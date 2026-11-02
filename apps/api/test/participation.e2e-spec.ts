import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { AccountStatus, SessionStatus } from '../src/generated/prisma/enums';
import { StructuredLoggerService } from '../src/observability/structured-logger.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { participationHarness } from './support/participation-harness';

// Real global JWT/role guards, DTO validation, controllers and services;
// only persistence/configuration/logger are replaced with test providers.
describe('Session participation with real Bearer JWT (e2e)', () => {
  let app: INestApplication<App>;
  let h: ReturnType<typeof participationHarness>;
  let jwt: JwtService;
  const logs = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  const participants = '/sessions/session/participants';
  const token = (id = 'master') =>
    jwt.sign({ sub: id, ver: h.state().users[id].authVersion, type: 'access' });
  const authorize = (id = 'master') => `Bearer ${token(id)}`;
  const add = () =>
    request(app.getHttpServer())
      .post(participants)
      .set('Authorization', authorize())
      .send({ userId: 'player' });
  const mark = (status = 'ATTENDED', id = 'master', reason?: string) =>
    request(app.getHttpServer())
      .patch(`${participants}/player/attendance`)
      .set('Authorization', authorize(id))
      .send({ status, ...(reason === undefined ? {} : { reason }) });

  beforeEach(async () => {
    h = participationHarness('campaign', true);
    jest.clearAllMocks();
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(h.root)
      .overrideProvider(StructuredLoggerService)
      .useValue(logs)
      .overrideProvider(ConfigService)
      .useValue({
        get: (key: string) =>
          (
            ({
              JWT_SECRET:
                'test-only-participation-secret-with-at-least-32-bytes',
              JWT_EXPIRES_IN: '15m',
              RENDER: 'true',
            }) as Record<string, string>
          )[key],
      })
      .compile();
    app = module.createNestApplication<App>();
    await app.init();
    jwt = app.get(JwtService);
  });

  afterEach(async () => {
    await app.close();
  });

  it('rejects NUL in participant identifiers in the body', async () => {
    await request(app.getHttpServer())
      .post(participants)
      .set('Authorization', authorize())
      .send({ userId: 'invalid\u0000id' })
      .expect(400);
    expect(h.state().participants).toEqual([]);
    expect(h.state().audits).toEqual([]);
  });

  it.each([
    '/sessions/invalid%00id/participants',
    '/sessions/session/participants/invalid%00id/attendance',
  ])('rejects NUL in participation route identifiers: %s', async (path) => {
    const query = path.endsWith('/attendance')
      ? request(app.getHttpServer()).patch(path).send({ status: 'ATTENDED' })
      : request(app.getHttpServer()).get(path);
    await query.set('Authorization', authorize()).expect(400);
    expect(h.state().audits).toEqual([]);
  });

  it('rejects NUL in cancellation reason before database writes', async () => {
    await add().expect(201);
    const before = structuredClone(h.state());
    await request(app.getHttpServer())
      .patch(`${participants}/player/cancellation`)
      .set('Authorization', authorize())
      .send({ reason: 'Invalid\u0000reason' })
      .expect(400);
    expect(h.state()).toEqual(before);
  });

  it('rejects NUL in an administrative correction reason', async () => {
    await add().expect(201);
    await mark().expect(200);
    await request(app.getHttpServer())
      .patch('/sessions/session/status')
      .set('Authorization', authorize())
      .send({ status: 'COMPLETED' })
      .expect(200);
    const before = structuredClone(h.state());
    await mark('NO_SHOW', 'admin', 'Invalid\u0000reason').expect(400);
    expect(h.state()).toEqual(before);
  });

  it.each([1000, 1001])(
    'enforces the Unicode reason limit consistently: %s',
    async (size) => {
      await add().expect(201);
      await request(app.getHttpServer())
        .patch(`${participants}/player/cancellation`)
        .set('Authorization', authorize())
        .send({ reason: '😀'.repeat(size) })
        .expect(size === 1000 ? 200 : 400);
    },
  );

  it('registers, lists, calls attendance and completes the campaign session atomically', async () => {
    await add().expect(201).expect('x-request-id', /\S+/);
    const pending = await request(app.getHttpServer())
      .patch('/sessions/session/status')
      .set('Authorization', authorize())
      .send({ status: 'COMPLETED' })
      .expect(409);
    expect(pending.body).toMatchObject({ code: 'SESSION_ATTENDANCE_PENDING' });
    await mark().expect(200);
    await request(app.getHttpServer())
      .patch('/sessions/session/status')
      .set('Authorization', authorize())
      .set('x-request-id', 'completed-session-1')
      .send({ status: 'COMPLETED' })
      .expect(200);
    const response = await request(app.getHttpServer())
      .get(participants)
      .set('Authorization', authorize())
      .expect(200);
    const body = response.body as { items: unknown[] };
    expect(body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          userId: 'player',
          role: 'PLAYER',
          status: 'ATTENDED',
        }),
        expect.objectContaining({
          userId: 'master',
          role: 'MASTER',
          status: 'ATTENDED',
        }),
      ]),
    );
    expect(response.body).toMatchObject({ meta: { total: 2 } });
    expect(JSON.stringify(response.body)).not.toMatch(
      /private-phone|birthDate|systemRole|attendanceCorrectionReason|cancellationReason/,
    );
    expect(h.state().audits.at(-1)).toMatchObject({
      action: 'SESSION_COMPLETED',
      requestId: 'completed-session-1',
    });
  });

  it('keeps one-shot completion on its own aggregate path and registers the real owner', async () => {
    h.state().session.campaignId = null;
    h.state().session.campaign = null;
    h.state().session.oneShotId = 'one-shot';
    h.state().session.oneShot = { masterId: 'master' };
    await add().expect(201);
    await mark().expect(200);
    const denied = await request(app.getHttpServer())
      .patch('/sessions/session/status')
      .set('Authorization', authorize())
      .send({ status: 'COMPLETED' })
      .expect(409);
    expect(denied.body).toMatchObject({
      code: 'ONE_SHOT_SESSION_MANAGED_BY_ONE_SHOT',
    });
    await request(app.getHttpServer())
      .patch('/one-shots/one-shot/status')
      .set('Authorization', authorize('admin'))
      .send({ status: 'COMPLETED' })
      .expect(200);
    expect(h.state().oneShotStatus).toBe('COMPLETED');
    expect(h.state().session.status).toBe('COMPLETED');
    expect(
      h.state().participants.find((p) => p.role === 'MASTER'),
    ).toMatchObject({ userId: 'master', status: 'ATTENDED' });
  });

  it.each([
    ['get', ''],
    ['post', ''],
    ['patch', '/player/attendance'],
    ['patch', '/player/cancellation'],
  ] as const)(
    'requires a JWT on %s %s despite forged identity headers',
    async (method, suffix) => {
      await request(app.getHttpServer())
        [method](participants + suffix)
        .set('x-user-id', 'admin')
        .send({})
        .expect(401);
      expect(h.state().participants).toEqual([]);
    },
  );

  it.each(['player', 'other', 'club-admin'])(
    'rejects managing participation as %s',
    async (actor) => {
      const response = await request(app.getHttpServer())
        .post(participants)
        .set('Authorization', authorize(actor))
        .send({ userId: 'player' })
        .expect(403);
      expect(response.body).toMatchObject({ code: 'ADMIN_ROLE_REQUIRED' });
    },
  );

  it('rejects expired, invalid, revoked and suspended JWT access', async () => {
    for (const bearer of [
      'invalid',
      jwt.sign({ sub: 'master', ver: 0, type: 'access' }, { expiresIn: -1 }),
    ]) {
      await request(app.getHttpServer())
        .get(participants)
        .set('Authorization', `Bearer ${bearer}`)
        .expect(401);
    }
    const revoked = token();
    h.state().users.master.authVersion++;
    await request(app.getHttpServer())
      .get(participants)
      .set('Authorization', `Bearer ${revoked}`)
      .expect(401);
    h.state().users.master.status = AccountStatus.SUSPENDED;
    await request(app.getHttpServer())
      .get(participants)
      .set('Authorization', authorize())
      .expect(401);
  });

  it.each([
    { userId: 'player', role: 'MASTER' },
    { userId: 'player', status: 'ATTENDED' },
    { userId: 'player', actorId: 'admin' },
    { userId: '' },
    { userId: '   ' },
    { userId: null },
    { userId: 123 },
    { userId: 'a'.repeat(129) },
  ])('rejects invalid or forged registration input %j', async (body) => {
    await request(app.getHttpServer())
      .post(participants)
      .set('Authorization', authorize())
      .send(body)
      .expect(400);
    expect(h.state().participants).toEqual([]);
  });

  it.each([
    { status: 'CONFIRMED' },
    { status: 'CANCELLED' },
    { status: null },
    { status: 'ATTENDED', attendedAt: '2026-01-01Z' },
    { status: 'ATTENDED', reason: null },
    { status: 'ATTENDED', reason: 'a'.repeat(1001) },
  ])('rejects invalid attendance input %j', async (body) => {
    await add().expect(201);
    await request(app.getHttpServer())
      .patch(`${participants}/player/attendance`)
      .set('Authorization', authorize())
      .send(body)
      .expect(400);
    expect(h.state().participants[0].status).toBe('REGISTERED');
  });

  it('preserves cancellations and rejects invalid reasons, pagination and future attendance', async () => {
    await add().expect(201);
    await request(app.getHttpServer())
      .patch(`${participants}/player/cancellation`)
      .set('Authorization', authorize())
      .send({ reason: '   ' })
      .expect(400);
    h.state().session.scheduledAt = new Date(Date.now() + 60_000);
    await mark().expect(409);
    await request(app.getHttpServer())
      .get(participants)
      .query({ limit: 51 })
      .set('Authorization', authorize())
      .expect(400);
    await request(app.getHttpServer())
      .patch(`${participants}/player/cancellation`)
      .set('Authorization', authorize())
      .send({ reason: 'Private cancellation text' })
      .expect(200);
    h.state().session.scheduledAt = new Date(Date.now() - 60_000);
    await mark('NO_SHOW').expect(409);
    expect(h.state().participants[0].status).toBe('CANCELLED');
    expect(JSON.stringify(h.state().audits)).not.toContain(
      'Private cancellation text',
    );
    expect(
      JSON.stringify({
        info: logs.info.mock.calls,
        warn: logs.warn.mock.calls,
        error: logs.error.mock.calls,
      }),
    ).not.toContain('Private cancellation text');
  });

  it('allows corrections only by ADMIN with reason before feedback and keeps the text private', async () => {
    await add().expect(201);
    await mark('NO_SHOW').expect(200);
    await request(app.getHttpServer())
      .patch('/sessions/session/status')
      .set('Authorization', authorize())
      .send({ status: 'COMPLETED' })
      .expect(200);
    await mark('ATTENDED', 'master', 'Correction').expect(403);
    await mark('ATTENDED', 'admin').expect(400);
    const corrected = await mark(
      'ATTENDED',
      'admin',
      'Private correction text',
    ).expect(200);
    expect(JSON.stringify(corrected.body)).not.toContain(
      'Private correction text',
    );
    expect(h.state().participants[0].attendanceCorrectionReason).toBe(
      'Private correction text',
    );
    h.state().feedbackCount = 1;
    const locked = await mark('NO_SHOW', 'admin', 'Other reason').expect(409);
    expect(locked.body).toMatchObject({ code: 'PARTICIPATION_HAS_FEEDBACK' });
    expect(JSON.stringify(h.state().audits)).not.toContain(
      'Private correction text',
    );
    expect(
      JSON.stringify({
        info: logs.info.mock.calls,
        warn: logs.warn.mock.calls,
        error: logs.error.mock.calls,
      }),
    ).not.toContain('Private correction text');
  });

  it('returns a safe error and rolls back the whole addition when audit fails', async () => {
    h.failAudit();
    const response = await add().expect(500);
    expect(response.body).toMatchObject({ code: 'INTERNAL_SERVER_ERROR' });
    expect(JSON.stringify(response.body)).not.toContain(
      'Synthetic audit failure',
    );
    expect(h.state().participants).toEqual([]);
    expect(h.state().audits).toEqual([]);
  });

  it('does not expose the call list publicly or allow additions to completed sessions', async () => {
    await request(app.getHttpServer()).get(participants).expect(401);
    h.state().session.status = SessionStatus.COMPLETED;
    await add().expect(409);
  });
});
