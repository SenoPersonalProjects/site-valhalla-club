import { Server } from 'node:http';
import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request, { Response } from 'supertest';
import { AppModule } from '../src/app.module';
import {
  AccountStatus,
  SanctionStatus,
  SanctionType,
} from '../src/generated/prisma/enums';
import { StructuredLoggerService } from '../src/observability/structured-logger.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { SanctionExpirationService } from '../src/sanctions/sanction-expiration.service';
import { SanctionsService } from '../src/sanctions/sanctions.service';
import { sanctionsHarness } from './support/sanctions.harness';

const body = (response: Response) => response.body as Record<string, unknown>;

describe('Sanction reversal and expiration through authenticated HTTP', () => {
  let app: INestApplication<Server>;
  let h: ReturnType<typeof sanctionsHarness>;
  const tokens: Record<string, string> = {};
  const logs = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  beforeAll(async () => {
    h = sanctionsHarness();
    // A record already due at startup verifies the actual bootstrap hook.
    h.fixture({ id: 'startup-expired', endsAt: new Date(0) });
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(h.root)
      .overrideProvider(ConfigService)
      .useValue({
        get: (key: string) =>
          ({
            JWT_SECRET: 'lifecycle-e2e-only-secret-at-least-32-bytes',
            JWT_EXPIRES_IN: '15m',
          })[key],
      })
      .overrideProvider(StructuredLoggerService)
      .useValue(logs)
      .compile();
    app = module.createNestApplication<INestApplication<Server>>();
    await app.init();
    const jwt = app.get(JwtService);
    for (const id of ['admin', 'dev', 'user', 'club-admin', 'target'])
      tokens[id] = await jwt.signAsync({ sub: id, ver: 0, type: 'access' });
  });
  afterAll(async () => {
    await app?.close();
  });
  afterEach(() => {
    h.reset();
    jest.clearAllMocks();
  });
  const get = (url: string, actor = 'target') =>
    request(app.getHttpServer())
      .get(url)
      .set('Authorization', 'Bearer ' + tokens[actor]);
  const reverse = (
    id: string,
    actor = 'admin',
    data: object = { reason: 'PRIVATE_HTTP_REVERSAL' },
  ) =>
    request(app.getHttpServer())
      .patch('/admin/sanctions/' + id + '/reversal')
      .set('Authorization', 'Bearer ' + tokens[actor])
      .send(data);

  it('reconciles existing expired decisions on actual application startup', () => {
    expect(h.state().sanctions[0]).toMatchObject({
      id: 'startup-expired',
      status: 'EXPIRED',
    });
    expect(h.state().logs[0]).toMatchObject({
      actorId: null,
      action: 'SANCTION_EXPIRED',
    });
    expect(logs.error).not.toHaveBeenCalled();
  });

  it.each(['admin', 'dev'])(
    'allows %s to reverse while preserving the original decision',
    async (actor) => {
      const row = h.fixture({ reportId: 'report', warningId: 'warning' });
      const response = await reverse(row.id, actor)
        .set('x-request-id', 'reversal-http-001')
        .expect(200);
      expect(body(response)).toMatchObject({
        status: 'REVERSED',
        isEffective: false,
        reason: row.reason,
        reportId: 'report',
        warningId: 'warning',
        createdById: 'admin',
        reversedById: actor,
        reversalReason: 'PRIVATE_HTTP_REVERSAL',
      });
      expect(h.state().logs[0]).toMatchObject({
        action: 'SANCTION_REVERSED',
        actorId: actor,
        requestId: 'reversal-http-001',
        metadata: {
          changed: true,
          fromStatus: 'ACTIVE',
          toStatus: 'REVERSED',
        },
      });
    },
  );

  it.each([
    { status: SanctionStatus.EXPIRED },
    { startsAt: new Date('2034-01-01Z') },
    { endsAt: new Date(0) },
    { type: SanctionType.EXPULSION, endsAt: null },
  ])(
    'accepts reversal for historical or future decisions %j',
    async (extra) => {
      const row = h.fixture(extra);
      expect(body(await reverse(row.id).expect(200)).status).toBe('REVERSED');
    },
  );

  it.each(['user', 'club-admin', 'target'])(
    'denies reversal by %s',
    async (actor) => {
      const row = h.fixture();
      expect(body(await reverse(row.id, actor).expect(403)).code).toBe(
        'ADMIN_ROLE_REQUIRED',
      );
      expect(h.state().logs).toHaveLength(0);
    },
  );

  it('rejects unauthenticated or forged requests, including alternate identity headers', async () => {
    const row = h.fixture();
    await request(app.getHttpServer())
      .patch('/admin/sanctions/' + row.id + '/reversal')
      .set('x-user-id', 'admin')
      .send({ reason: 'Denied' })
      .expect(401);
    await request(app.getHttpServer())
      .patch('/admin/sanctions/' + row.id + '/reversal')
      .set('Authorization', 'Bearer forged')
      .send({ reason: 'Denied' })
      .expect(401);
    expect(h.state().logs).toHaveLength(0);
  });

  it.each([
    {},
    { reason: null },
    { reason: '' },
    { reason: '  ' },
    { reason: 1 },
    { reason: 'x'.repeat(1001) },
    { reason: 'nul\0' },
    { reason: 'Valid', reversedById: 'dev' },
    { reason: 'Valid', status: 'ACTIVE' },
    { reason: 'Valid', reversedAt: '2030-01-01T00:00:00Z' },
  ])('rejects invalid or server-controlled fields %j', async (data) => {
    const row = h.fixture();
    expect(body(await reverse(row.id, 'admin', data).expect(400)).code).toBe(
      'BAD_REQUEST',
    );
    expect(h.state().sanctions[0].status).toBe('ACTIVE');
    expect(h.state().logs).toHaveLength(0);
  });

  it('returns 404 for a nonexistent decision', async () => {
    expect(body(await reverse('missing').expect(404)).code).toBe(
      'SANCTION_NOT_FOUND',
    );
    expect(h.state().logs).toHaveLength(0);
  });

  it('preserves the first reversal on repeated requests by another administrator', async () => {
    const row = h.fixture();
    const first = body(await reverse(row.id).expect(200));
    const second = body(
      await reverse(row.id, 'dev', { reason: 'New reason' }).expect(200),
    );
    expect(second).toEqual(first);
    expect(h.state().logs[1]).toMatchObject({
      actorId: 'dev',
      metadata: {
        changed: false,
        fromStatus: 'REVERSED',
        toStatus: 'REVERSED',
      },
    });
    await reverse(row.id, 'dev', {}).expect(400);
    expect(h.state().logs).toHaveLength(2);
  });

  it('restores normal access with the existing JWT only after the last global sanction is reversed', async () => {
    const one = h.fixture({ type: SanctionType.ACCOUNT_SUSPENSION });
    const two = h.fixture({ type: SanctionType.EXPULSION, endsAt: null });
    await get('/auth/me').expect(403);
    await reverse(one.id).expect(200);
    await get('/auth/me').expect(403);
    await reverse(two.id, 'dev').expect(200);
    await get('/auth/me').expect(200);
    const detail = body(await get('/account/sanctions/' + one.id).expect(200));
    expect(detail).toMatchObject({
      status: 'REVERSED',
      reversalReason: 'PRIVATE_HTTP_REVERSAL',
    });
    for (const key of ['createdById', 'reversedById', 'reportId', 'warningId'])
      expect(key in detail).toBe(false);
  });

  it('does not restore blocked account lifecycle status or revoked JWTs', async () => {
    const row = h.fixture({ type: SanctionType.ACCOUNT_SUSPENSION });
    h.users.get('target')!.status = AccountStatus.SUSPENDED;
    await reverse(row.id).expect(200);
    await get('/auth/me').expect(401);
    h.users.get('target')!.status = AccountStatus.APPROVED;
    h.users.get('target')!.authVersion++;
    await get('/auth/me').expect(401);
  });

  it('blocks a sanctioned administrator from reversing their own expulsion', async () => {
    const row = h.fixture({
      userId: 'admin',
      type: SanctionType.EXPULSION,
      endsAt: null,
    });
    expect(body(await reverse(row.id).expect(403)).code).toBe(
      'ACCOUNT_SANCTIONED',
    );
    await reverse(row.id, 'dev').expect(200);
    await get('/admin/sanctions', 'admin').expect(200);
  });

  it.each(['audit', 'commit'])(
    'does not commit a reversal after %s failure',
    async (kind) => {
      const row = h.fixture();
      if (kind === 'audit') h.failAudit();
      else h.failCommit();
      await reverse(row.id).expect(500);
      expect(h.state().sanctions[0].status).toBe('ACTIVE');
      expect(h.state().logs).toHaveLength(0);
    },
  );

  it('exhausts retries with a generic conflict and no partial audit', async () => {
    const row = h.fixture();
    h.abort(3);
    expect(body(await reverse(row.id).expect(409)).code).toBe(
      'SANCTION_CONFLICT',
    );
    expect(h.state().logs).toHaveLength(0);
  });

  it('reconciles expiration without keeping a block or generating duplicate lifecycle events', async () => {
    const row = h.fixture({
      type: SanctionType.ACCOUNT_SUSPENSION,
      endsAt: new Date(0),
    });
    await get('/auth/me').expect(200);
    await app.get(SanctionExpirationService).run();
    expect(h.state().sanctions[0].status).toBe('EXPIRED');
    expect(h.state().logs).toHaveLength(1);
    await app.get(SanctionExpirationService).run();
    expect(h.state().logs).toHaveLength(1);
    expect(
      body(await get('/account/sanctions/' + row.id).expect(200)),
    ).toMatchObject({ status: 'EXPIRED', isEffective: false });
    await reverse(row.id).expect(200);
    expect(h.state().logs[1].metadata).toEqual({
      changed: true,
      fromStatus: 'EXPIRED',
      toStatus: 'REVERSED',
    });
  });

  it('exposes no public reconciliation or self-reversal endpoint', async () => {
    await get('/account/sanctions/missing/reversal').expect(404);
    await request(app.getHttpServer())
      .post('/admin/sanctions/reconcile')
      .set('Authorization', 'Bearer ' + tokens.admin)
      .expect(404);
    expect(h.state().logs).toHaveLength(0);
  });

  it('keeps technical logs and audit metadata free of decision text', async () => {
    const row = h.fixture();
    await reverse(row.id).expect(200);
    h.fixture({ endsAt: new Date(0) });
    await app.get(SanctionsService).expireDue();
    const serialized = JSON.stringify({
      logs: logs.info.mock.calls,
      errors: logs.error.mock.calls,
      metadata: h.state().logs.map((log) => log.metadata),
    });
    for (const secret of [
      'PRIVATE_HTTP_REVERSAL',
      'PRIVATE_REASON_MARKER',
      tokens.admin,
    ])
      expect(serialized).not.toContain(secret);
  });
});
