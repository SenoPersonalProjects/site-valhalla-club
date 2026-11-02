import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import {
  AccountStatus,
  SessionParticipantStatus,
  SessionStatus,
} from '../src/generated/prisma/enums';
import { FEEDBACK_EDIT_WINDOW_MS } from '../src/feedbacks/feedback.constants';
import { StructuredLoggerService } from '../src/observability/structured-logger.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { completedParticipationHarness } from './support/participation-harness';

describe('Feedback submission with real Bearer JWT (e2e)', () => {
  let app: INestApplication<App>;
  let h: Awaited<ReturnType<typeof completedParticipationHarness>>;
  let jwt: JwtService;
  const endpoint = '/sessions/session/feedbacks';
  const logs = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  const token = (id = 'player') =>
    jwt.sign({ sub: id, ver: h.state().users[id].authVersion, type: 'access' });
  const submit = (body: object, author = 'player') =>
    request(app.getHttpServer())
      .post(endpoint)
      .set('Authorization', `Bearer ${token(author)}`)
      .send(body);

  beforeEach(async () => {
    h = await completedParticipationHarness('campaign', true);
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
              JWT_SECRET: 'test-only-feedback-secret-at-least-32-bytes',
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

  it.each([
    { targetType: 'SESSION', rating: 8, comment: 'invalid\u0000comment' },
    { targetType: 'MASTER', targetUserId: 'invalid\u0000id', rating: 8 },
  ])('rejects NUL in body input: %j', async (body) => {
    await submit(body).expect(400);
    expect(h.state().feedbacks).toEqual([]);
  });

  it('rejects NUL in the session route identifier', async () => {
    await request(app.getHttpServer())
      .post('/sessions/invalid%00id/feedbacks')
      .set('Authorization', `Bearer ${token()}`)
      .send({ targetType: 'SESSION', rating: 8 })
      .expect(400);
    expect(h.state().feedbacks).toEqual([]);
  });

  it.each([
    { targetType: 'SESSION', rating: 0 },
    { targetType: 'MASTER', targetUserId: 'master', rating: 10 },
    { targetType: 'PLAYER', targetUserId: 'other', rating: 8 },
  ])(
    'creates %j with server identity, default visibility and exact 24h deadline',
    async (body) => {
      const auditCount = h.state().audits.length;
      const response = await submit(body)
        .set('x-user-id', 'admin')
        .set('x-request-id', 'feedback-create-1')
        .expect(201)
        .expect('x-request-id', 'feedback-create-1');
      expect(response.body).toMatchObject({
        authorId: 'player',
        sessionId: 'session',
        ...body,
        visibility: 'PUBLIC',
        comment: null,
      });
      const result = response.body as {
        createdAt: string;
        editableUntil: string;
      };
      expect(
        Date.parse(result.editableUntil) - Date.parse(result.createdAt),
      ).toBe(FEEDBACK_EDIT_WINDOW_MS);
      expect(response.body).not.toHaveProperty('targetKey');
      expect(response.body).not.toHaveProperty('moderationReason');
      expect(response.body).not.toHaveProperty('user');
      expect(h.state().feedbacks).toHaveLength(1);
      expect(h.state().audits).toHaveLength(auditCount);
    },
  );

  it.each([
    { targetType: 'MASTER', targetUserId: 'master' },
    { targetType: 'PLAYER', targetUserId: 'other' },
  ])(
    'accepts private feedback %j and keeps content out of technical logs',
    async (target) => {
      const comment = 'Private feedback comment';
      const bearer = token();
      const response = await request(app.getHttpServer())
        .post(endpoint)
        .set('Authorization', `Bearer ${bearer}`)
        .set('Cookie', 'test-cookie=private-cookie')
        .send({
          ...target,
          rating: 7,
          comment: `  ${comment}  `,
          visibility: 'PRIVATE_TO_RECIPIENT',
        })
        .expect(201);
      expect(response.body).toMatchObject({
        comment,
        visibility: 'PRIVATE_TO_RECIPIENT',
      });
      const serializedLogs = JSON.stringify({
        info: logs.info.mock.calls,
        warn: logs.warn.mock.calls,
        error: logs.error.mock.calls,
      });
      for (const secret of [comment, bearer, 'private-cookie'])
        expect(serializedLogs).not.toContain(secret);
    },
  );

  it('accepts a master reviewing a player based on actual session role', async () => {
    await submit(
      { targetType: 'PLAYER', targetUserId: 'player', rating: 9 },
      'master',
    ).expect(201);
    expect(h.state().feedbacks[0].authorId).toBe('master');
  });

  it('requires a Bearer token and ignores a forged identity header', async () => {
    const response = await request(app.getHttpServer())
      .post(endpoint)
      .set('x-user-id', 'player')
      .send({ targetType: 'SESSION', rating: 8 })
      .expect(401);
    expect(response.body).toMatchObject({ code: 'AUTH_TOKEN_REQUIRED' });
    expect(h.state().feedbacks).toEqual([]);
  });

  it('rejects bad, expired and revoked tokens and an unavailable account', async () => {
    for (const bearer of [
      'invalid',
      jwt.sign({ sub: 'player', ver: 0, type: 'access' }, { expiresIn: -1 }),
    ]) {
      await request(app.getHttpServer())
        .post(endpoint)
        .set('Authorization', `Bearer ${bearer}`)
        .send({ targetType: 'SESSION', rating: 8 })
        .expect(401);
    }
    const old = token();
    h.state().users.player.authVersion++;
    await request(app.getHttpServer())
      .post(endpoint)
      .set('Authorization', `Bearer ${old}`)
      .send({ targetType: 'SESSION', rating: 8 })
      .expect(401);
    h.state().users.player.status = AccountStatus.SUSPENDED;
    await submit({ targetType: 'SESSION', rating: 8 }).expect(401);
    expect(h.state().feedbacks).toEqual([]);
  });

  it.each([
    {},
    { targetType: 'SESSION' },
    { targetType: 'UNKNOWN', rating: 8 },
    { targetType: 'SESSION', rating: -1 },
    { targetType: 'SESSION', rating: 11 },
    { targetType: 'SESSION', rating: 5.5 },
    { targetType: 'SESSION', rating: '8' },
    { targetType: 'SESSION', rating: true },
    { targetType: 'SESSION', rating: null },
    { targetType: 'SESSION', rating: 8, comment: 123 },
    { targetType: 'SESSION', rating: 8, comment: [] },
    { targetType: 'SESSION', rating: 8, comment: 'x'.repeat(2001) },
    { targetType: 'SESSION', rating: 8, visibility: null },
    { targetType: 'SESSION', rating: 8, visibility: 'UNKNOWN' },
    { targetType: 'MASTER', targetUserId: '', rating: 8 },
    { targetType: 'MASTER', targetUserId: 123, rating: 8 },
    { targetType: 'MASTER', targetUserId: 'x'.repeat(129), rating: 8 },
  ])('rejects invalid input before creating feedback: %j', async (body) => {
    const response = await submit(body).expect(400);
    expect(response.body).toMatchObject({ code: 'BAD_REQUEST' });
    expect(h.state().feedbacks).toEqual([]);
  });

  it.each([
    { authorId: 'admin' },
    { sessionId: 'other-session' },
    { targetKey: 'forged' },
    { createdAt: '2000-01-01T00:00:00Z' },
    { editableUntil: '2099-01-01T00:00:00Z' },
    { hiddenAt: null },
    { moderationReason: 'forged' },
    { ratingExtra: 10 },
  ])('rejects forged fields %j', async (extra) => {
    await submit({ targetType: 'SESSION', rating: 8, ...extra }).expect(400);
    expect(h.state().feedbacks).toEqual([]);
  });

  it.each([
    [
      { targetType: 'SESSION', targetUserId: 'master', rating: 8 },
      'FEEDBACK_TARGET_INVALID',
    ],
    [
      { targetType: 'SESSION', rating: 8, visibility: 'PRIVATE_TO_RECIPIENT' },
      'FEEDBACK_SESSION_PRIVATE_NOT_ALLOWED',
    ],
    [{ targetType: 'MASTER', rating: 8 }, 'FEEDBACK_TARGET_USER_REQUIRED'],
    [
      { targetType: 'PLAYER', targetUserId: null, rating: 8 },
      'FEEDBACK_TARGET_USER_REQUIRED',
    ],
  ] as const)(
    'rejects incompatible target/visibility combination %j',
    async (body, code) => {
      const response = await submit(body).expect(400);
      expect(response.body).toMatchObject({ code });
    },
  );

  it.each(['REGISTERED', 'CONFIRMED', 'CANCELLED', 'NO_SHOW'] as const)(
    'denies an author with participation %s',
    async (status) => {
      h.state().participants.find((p) => p.userId === 'player')!.status =
        SessionParticipantStatus[status];
      const response = await submit({
        targetType: 'SESSION',
        rating: 8,
      }).expect(403);
      expect(response.body).toMatchObject({
        code: 'FEEDBACK_AUTHOR_NOT_ATTENDED',
      });
      expect(h.state().feedbacks).toEqual([]);
    },
  );

  it.each(['admin', 'club-admin'])(
    'denies %s without attendance despite their roles',
    async (author) => {
      const response = await submit(
        { targetType: 'SESSION', rating: 8 },
        author,
      ).expect(403);
      expect(response.body).toMatchObject({
        code: 'FEEDBACK_AUTHOR_NOT_ATTENDED',
      });
    },
  );

  it('requires completion and the correct recipient role, and prevents personal self-review', async () => {
    h.state().session.status = SessionStatus.SCHEDULED;
    const pending = await submit({ targetType: 'SESSION', rating: 8 }).expect(
      409,
    );
    expect(pending.body).toMatchObject({
      code: 'FEEDBACK_SESSION_NOT_COMPLETED',
    });
    h.state().session.status = SessionStatus.COMPLETED;
    const mismatch = await submit({
      targetType: 'MASTER',
      targetUserId: 'other',
      rating: 8,
    }).expect(403);
    expect(mismatch.body).toMatchObject({
      code: 'FEEDBACK_RECIPIENT_NOT_ELIGIBLE',
    });
    const self = await submit({
      targetType: 'PLAYER',
      targetUserId: 'player',
      rating: 8,
    }).expect(403);
    expect(self.body).toMatchObject({ code: 'FEEDBACK_SELF_REVIEW_FORBIDDEN' });
  });

  it('rejects missing sessions and oversized route identifiers', async () => {
    const missing = await request(app.getHttpServer())
      .post('/sessions/missing/feedbacks')
      .set('Authorization', `Bearer ${token()}`)
      .send({ targetType: 'SESSION', rating: 8 })
      .expect(404);
    expect(missing.body).toMatchObject({ code: 'SESSION_NOT_FOUND' });
    await request(app.getHttpServer())
      .post(`/sessions/${'x'.repeat(129)}/feedbacks`)
      .set('Authorization', `Bearer ${token()}`)
      .send({ targetType: 'SESSION', rating: 8 })
      .expect(400);
  });

  it('does not overwrite the first feedback or extend the deadline on duplicates', async () => {
    const body = { targetType: 'MASTER', targetUserId: 'master', rating: 8 };
    const first = await submit(body).expect(201);
    const duplicate = await submit({
      ...body,
      rating: 0,
      comment: 'Replacement',
      visibility: 'PRIVATE_TO_RECIPIENT',
    }).expect(409);
    expect(duplicate.body).toMatchObject({ code: 'FEEDBACK_ALREADY_EXISTS' });
    expect(h.state().feedbacks).toHaveLength(1);
    const firstResult = first.body as { editableUntil: string };
    expect(h.state().feedbacks[0].editableUntil.toISOString()).toBe(
      firstResult.editableUntil,
    );
    expect(h.state().feedbacks[0].rating).toBe(8);
  });

  it('returns one creation and one safe conflict for simultaneous duplicates', async () => {
    const body = { targetType: 'SESSION', rating: 8 };
    const responses = await Promise.all([submit(body), submit(body)]);
    expect(responses.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(h.state().feedbacks).toHaveLength(1);
  });

  it('uses newly created feedback to block administrative attendance corrections', async () => {
    await submit({
      targetType: 'MASTER',
      targetUserId: 'master',
      rating: 8,
    }).expect(201);
    const response = await request(app.getHttpServer())
      .patch('/sessions/session/participants/player/attendance')
      .set('Authorization', `Bearer ${token('admin')}`)
      .send({ status: 'NO_SHOW', reason: 'Synthetic correction' })
      .expect(409);
    expect(response.body).toMatchObject({ code: 'PARTICIPATION_HAS_FEEDBACK' });
    expect(
      h.state().participants.find((p) => p.userId === 'player')?.status,
    ).toBe('ATTENDED');
  });

  it.each(['write', 'commit'] as const)(
    'returns a safe 500 and rolls back on %s failure',
    async (failure) => {
      if (failure === 'write') h.failFeedbackWrite();
      else h.failCommit();
      const response = await submit({
        targetType: 'SESSION',
        rating: 8,
      }).expect(500);
      expect(response.body).toMatchObject({ code: 'INTERNAL_SERVER_ERROR' });
      expect(JSON.stringify(response.body)).not.toContain('Synthetic');
      expect(h.state().feedbacks).toEqual([]);
    },
  );
});
