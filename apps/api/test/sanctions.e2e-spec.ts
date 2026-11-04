import { Server } from 'node:http';
import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import request, { Response } from 'supertest';
import { AppModule } from '../src/app.module';
import {
  AccountStatus,
  SanctionScopeType,
  SanctionType,
  SystemRole,
} from '../src/generated/prisma/enums';
import { PrismaService } from '../src/prisma/prisma.service';
import { StructuredLoggerService } from '../src/observability/structured-logger.service';
import { sanctionsHarness } from './support/sanctions.harness';

const body = (response: Response) => response.body as Record<string, unknown>;
const payload = (extra: Record<string, unknown> = {}) => ({
  userId: 'target',
  type: 'TABLE_CREATION_RESTRICTION',
  reason: 'PRIVATE_REASON_MARKER',
  endsAt: '2035-01-01T00:00:00Z',
  ...extra,
});

describe('Administrative sanctions with real JWT and repository doubles', () => {
  let app: INestApplication<Server>;
  let h: ReturnType<typeof sanctionsHarness>;
  const tokens: Record<string, string> = {};
  const logs = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  const password = 'test-only-sanctions-password';
  beforeAll(async () => {
    h = sanctionsHarness(await bcrypt.hash(password, 12));
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(h.root)
      .overrideProvider(ConfigService)
      .useValue({
        get: (key: string) =>
          ({
            JWT_SECRET: 'sanctions-e2e-test-secret-at-least-32-bytes',
            JWT_EXPIRES_IN: '15m',
          })[key],
      })
      .overrideProvider(StructuredLoggerService)
      .useValue(logs)
      .compile();
    app = module.createNestApplication<INestApplication<Server>>();
    await app.init();
    const jwt = app.get(JwtService);
    for (const id of ['admin', 'dev', 'user', 'club-admin'])
      tokens[id] = await jwt.signAsync({ sub: id, ver: 0, type: 'access' });
  });
  beforeEach(() => {
    h.reset();
    logs.info.mockClear();
    logs.error.mockClear();
  });
  afterAll(async () => {
    await app?.close();
  });
  const get = (url: string, actor = 'admin') =>
    request(app.getHttpServer())
      .get(url)
      .set('Authorization', 'Bearer ' + tokens[actor]);
  const post = (extra: Record<string, unknown> = {}, actor = 'admin') =>
    request(app.getHttpServer())
      .post('/admin/sanctions')
      .set('Authorization', 'Bearer ' + tokens[actor])
      .send(payload(extra));

  it('logs in through the existing route and creates an administrative decision', async () => {
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@example.test', password })
      .expect(200);
    const token = body(login).accessToken as string;
    const response = await request(app.getHttpServer())
      .post('/admin/sanctions')
      .set('Authorization', 'Bearer ' + token)
      .set('x-request-id', 'sanctions-e2e-001')
      .send(payload())
      .expect(201);
    expect(body(response)).toMatchObject({
      userId: 'target',
      createdById: 'admin',
      scopeType: 'GENERAL',
      status: 'ACTIVE',
      isEffective: true,
    });
    expect(response.headers['x-request-id']).toBe('sanctions-e2e-001');
    expect(h.state().logs[0].requestId).toBe('sanctions-e2e-001');
  });
  it.each(Object.values(SanctionType))(
    'allows ADMIN to register %s',
    async (type) => {
      await post(
        type === SanctionType.EXPULSION
          ? { type, endsAt: undefined }
          : { type },
      ).expect(201);
    },
  );
  it('allows DEV without granting club master permissions', async () => {
    await post({}, 'dev').expect(201);
    expect(h.state().sanctions[0].createdById).toBe('dev');
  });
  for (const actor of ['user', 'club-admin'])
    for (const [method, url] of [
      ['get', '/admin/sanctions'],
      ['get', '/admin/sanctions/missing'],
      ['post', '/admin/sanctions'],
    ] as const)
      it(`denies ${method} ${url} for ${actor}`, async () => {
        const response =
          method === 'post'
            ? await post({}, actor).expect(403)
            : await get(url, actor).expect(403);
        expect(body(response).code).toBe('ADMIN_ROLE_REQUIRED');
      });
  it('does not authenticate x-user-id or an unsigned identity', async () => {
    await request(app.getHttpServer())
      .get('/admin/sanctions')
      .set('x-user-id', 'admin')
      .expect(401);
    await request(app.getHttpServer())
      .post('/admin/sanctions')
      .send(payload())
      .expect(401);
    await request(app.getHttpServer())
      .get('/admin/sanctions')
      .set('Authorization', 'Bearer forged')
      .expect(401);
  });
  it('checks current role and account status with the same existing token', async () => {
    h.users.get('admin')!.systemRole = SystemRole.USER;
    await get('/admin/sanctions').expect(403);
    h.users.get('admin')!.systemRole = SystemRole.ADMIN;
    h.users.get('admin')!.status = AccountStatus.SUSPENDED;
    await get('/admin/sanctions').expect(401);
  });
  it('rejects revoked JWT versions', async () => {
    h.users.get('admin')!.authVersion++;
    await get('/admin/sanctions').expect(401);
  });
  it.each([
    { reason: undefined },
    { reason: null },
    { reason: '' },
    { reason: '   ' },
    { reason: 'x'.repeat(1001) },
    { type: 'UNKNOWN' },
    { status: 'ACTIVE' },
    { createdById: 'dev' },
    { reversedById: 'dev' },
    { reportId: null },
    { warningId: '' },
    { scopeType: null },
    { scopeDescription: null },
    { endsAt: undefined },
    { endsAt: null },
    { endsAt: '2035-02-30T00:00:00Z' },
    { startsAt: '2030-01-01T00:00:00' },
    { startsAt: '2030-01-01T00:00:00Z', endsAt: '2029-01-01T00:00:00Z' },
    { startsAt: '2020-01-01T00:00:00Z' },
    { scopeType: 'CAMPAIGN', campaignId: 'campaign' },
    { type: 'EXPULSION', endsAt: '2035-01-01T00:00:00Z' },
  ])('rejects invalid HTTP payload %j', async (extra) => {
    await post(extra).expect(400);
    expect(h.state()).toEqual({ sanctions: [], logs: [] });
  });
  it.each([
    {
      type: 'TABLE_PARTICIPATION_RESTRICTION',
      scopeType: 'CAMPAIGN',
      campaignId: 'campaign',
    },
    {
      type: 'MASTER_ACTIVITY_RESTRICTION',
      scopeType: 'SESSION',
      sessionId: 'session',
    },
    {
      type: 'EVENT_PARTICIPATION_RESTRICTION',
      scopeType: 'OTHER',
      scopeDescription: ' Atividade fictícia ',
    },
  ])('accepts configured specific scope %j', async (extra) => {
    const response = await post(extra).expect(201);
    expect(body(response).scopeType).toBe(extra.scopeType);
  });
  it('marks scheduled sanctions ineffective without inventing a database state', async () => {
    const response = await post({ startsAt: '2030-01-01T00:00:00Z' }).expect(
      201,
    );
    expect(body(response)).toMatchObject({
      status: 'ACTIVE',
      isEffective: false,
    });
  });
  it('accepts a resolved report and its historical warning without copying private material', async () => {
    h.warnings.get('warning')!.status = 'EXPIRED';
    const response = await post({
      reportId: 'report',
      warningId: 'warning',
    }).expect(201);
    expect(body(response)).toMatchObject({
      reportId: 'report',
      warningId: 'warning',
    });
    expect(JSON.stringify(body(response))).not.toContain(
      'PRIVATE_REPORT_MARKER',
    );
  });
  it.each(['OPEN', 'UNDER_REVIEW', 'DISMISSED'])(
    'rejects report state %s',
    async (status) => {
      h.reports.get('report')!.status = status;
      const response = await post({ reportId: 'report' }).expect(409);
      expect(body(response).code).toBe('SANCTION_REPORT_NOT_RESOLVED');
    },
  );
  it('rejects a reversed warning', async () => {
    h.warnings.get('warning')!.status = 'REVERSED';
    const response = await post({ warningId: 'warning' }).expect(409);
    expect(body(response).code).toBe('SANCTION_WARNING_REVERSED');
  });
  it('rejects duplicate decisions without duplicate audit', async () => {
    await post().expect(201);
    const response = await post().expect(409);
    expect(body(response).code).toBe('SANCTION_ALREADY_EXISTS');
    expect(h.state().logs).toHaveLength(1);
  });
  it('keeps user status and roles unchanged while registration is implemented separately from enforcement', async () => {
    const before = structuredClone(h.users.get('target'));
    await post({ type: 'ACCOUNT_SUSPENSION' }).expect(201);
    expect(h.users.get('target')).toEqual(before);
  });
  it('filters and paginates a minimal list, with effective expiration and no read-side writes', async () => {
    h.fixture({ endsAt: new Date(0) });
    h.fixture();
    h.fixture({ status: 'REVERSED' });
    const before = h.state();
    const response = await get(
      '/admin/sanctions?userId=target&status=EXPIRED&page=1&limit=1',
    ).expect(200);
    const data = body(response) as {
      items: Record<string, unknown>[];
      meta: Record<string, unknown>;
    };
    expect(data.meta).toMatchObject({ total: 1, page: 1, limit: 1 });
    expect(data.items[0]).toMatchObject({
      status: 'EXPIRED',
      isEffective: false,
    });
    for (const key of [
      'reason',
      'scopeDescription',
      'reportId',
      'warningId',
      'createdById',
      'reversalReason',
    ])
      expect(data.items[0]).not.toHaveProperty(key);
    expect(h.state()).toEqual(before);
  });
  it('combines type, scope and resource filters', async () => {
    h.fixture();
    h.fixture({
      type: SanctionType.TABLE_PARTICIPATION_RESTRICTION,
      scopeType: SanctionScopeType.CAMPAIGN,
      campaignId: 'campaign',
    });
    const response = await get(
      '/admin/sanctions?userId=target&type=TABLE_PARTICIPATION_RESTRICTION&scopeType=CAMPAIGN&campaignId=campaign',
    ).expect(200);
    expect(body(response).items as unknown[]).toHaveLength(1);
  });
  it('returns detail only to approved administrators', async () => {
    const row = h.fixture();
    const response = await get('/admin/sanctions/' + row.id).expect(200);
    expect(body(response)).toMatchObject({
      reason: 'PRIVATE_REASON_MARKER',
      createdById: 'admin',
    });
  });
  it('returns 404 for an unknown sanction', async () => {
    const response = await get('/admin/sanctions/missing').expect(404);
    expect(body(response).code).toBe('SANCTION_NOT_FOUND');
  });
  it.each([
    'limit=51',
    'page=0',
    'page=999999999999',
    'status=INVALID',
    'type=INVALID',
    'scopeType=INVALID',
    'userId=',
    'extra=PRIVATE',
  ])('rejects invalid list query %s', async (query) => {
    await get('/admin/sanctions?' + query).expect(400);
  });
  it('rolls back a creation when audit fails and returns a standardized generic error', async () => {
    h.failAudit();
    const response = await post().expect(500);
    expect(body(response).code).toBe('INTERNAL_SERVER_ERROR');
    expect(JSON.stringify(body(response))).not.toContain('private audit');
    expect(h.state()).toEqual({ sanctions: [], logs: [] });
  });
  it('does not copy reasons, reports, passwords or Bearer tokens to technical logs', async () => {
    await post({ reportId: 'report' }).expect(201);
    const output = JSON.stringify([
      logs.info.mock.calls,
      logs.error.mock.calls,
      h.state().logs,
    ]);
    for (const marker of [
      'PRIVATE_REASON_MARKER',
      'PRIVATE_REPORT_MARKER',
      password,
      tokens.admin,
    ])
      expect(output).not.toContain(marker);
  });
});
