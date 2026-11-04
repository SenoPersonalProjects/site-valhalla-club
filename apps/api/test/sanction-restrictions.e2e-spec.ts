import { Server } from 'node:http';
import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import request, { Response } from 'supertest';
import { AppModule } from '../src/app.module';
import { AccountStatus, SanctionType } from '../src/generated/prisma/enums';
import { PrismaService } from '../src/prisma/prisma.service';
import { StructuredLoggerService } from '../src/observability/structured-logger.service';
import { sanctionsHarness } from './support/sanctions.harness';

const data = (response: Response) => response.body as Record<string, unknown>;

describe('Live account restrictions and authenticated access to own decisions', () => {
  let app: INestApplication<Server>,
    h: ReturnType<typeof sanctionsHarness>,
    jwt: JwtService;
  const tokens: Record<string, string> = {};
  const logs = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  const password = 'test-only-restriction-password';
  beforeAll(async () => {
    h = sanctionsHarness(await bcrypt.hash(password, 12));
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(h.root)
      .overrideProvider(ConfigService)
      .useValue({
        get: (key: string) =>
          ({
            JWT_SECRET: 'restriction-e2e-only-secret-at-least-32-bytes',
            JWT_EXPIRES_IN: '15m',
          })[key],
      })
      .overrideProvider(StructuredLoggerService)
      .useValue(logs)
      .compile();
    app = module.createNestApplication<INestApplication<Server>>();
    await app.init();
    jwt = app.get(JwtService);
    for (const id of ['target', 'admin', 'user'])
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
  const get = (url: string, actor = 'target') =>
    request(app.getHttpServer())
      .get(url)
      .set('Authorization', 'Bearer ' + tokens[actor]);

  it.each([SanctionType.ACCOUNT_SUSPENSION, SanctionType.EXPULSION])(
    'applies %s to an already issued JWT',
    async (type) => {
      await get('/auth/me').expect(200);
      const sanction = h.fixture({
        type,
        endsAt:
          type === SanctionType.EXPULSION ? null : new Date('2035-01-01Z'),
      });
      const denied = await get('/auth/me').expect(403);
      expect(data(denied).code).toBe('ACCOUNT_SANCTIONED');
      await get('/account/sanctions').expect(200);
      const detail = await get('/account/sanctions/' + sanction.id).expect(200);
      expect(data(detail).id).toBe(sanction.id);
    },
  );
  it('login checks the actual password and allows only restricted routes for a sanctioned account', async () => {
    h.fixture({ type: SanctionType.ACCOUNT_SUSPENSION });
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'target@example.test', password })
      .expect(200);
    const token = data(login).accessToken as string;
    await request(app.getHttpServer())
      .get('/account/sanctions')
      .set('Authorization', 'Bearer ' + token)
      .expect(200);
    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', 'Bearer ' + token)
      .expect(403);
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'target@example.test', password: 'wrong-test-password' })
      .expect(401);
  });
  it('does not elevate an account blocked by its lifecycle status', async () => {
    h.users.get('target')!.status = AccountStatus.SUSPENDED;
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'target@example.test', password })
      .expect(403);
    await get('/account/sanctions').expect(401);
  });
  it.each([
    { startsAt: new Date('2034-01-01Z') },
    { endsAt: new Date(0) },
    { status: 'EXPIRED' as const },
    { status: 'REVERSED' as const },
  ])('ignores non-effective account sanctions %j', async (extra) => {
    h.fixture({ type: SanctionType.ACCOUNT_SUSPENSION, ...extra });
    await get('/auth/me').expect(200);
  });
  it('does not turn table, event or activity restrictions into a total access ban', async () => {
    for (const type of [
      SanctionType.TABLE_CREATION_RESTRICTION,
      SanctionType.TABLE_PARTICIPATION_RESTRICTION,
      SanctionType.MASTER_ACTIVITY_RESTRICTION,
      SanctionType.EVENT_PARTICIPATION_RESTRICTION,
      SanctionType.CLUB_ACTIVITY_RESTRICTION,
    ])
      h.fixture({ type });
    await get('/auth/me').expect(200);
  });
  it('requires a valid JWT even on the disciplinary exception routes', async () => {
    await request(app.getHttpServer())
      .get('/account/sanctions')
      .set('x-user-id', 'target')
      .expect(401);
    await request(app.getHttpServer())
      .get('/account/sanctions')
      .set('Authorization', 'Bearer invalid')
      .expect(401);
    const expired = await jwt.signAsync(
      { sub: 'target', ver: 0, type: 'access' },
      { expiresIn: -1 },
    );
    await request(app.getHttpServer())
      .get('/account/sanctions')
      .set('Authorization', 'Bearer ' + expired)
      .expect(401);
  });
  it('forbids client headers and claims from opting into restricted access', async () => {
    h.fixture({ type: SanctionType.ACCOUNT_SUSPENSION });
    const forged = await jwt.signAsync({
      sub: 'target',
      ver: 0,
      type: 'access',
      disciplinaryAccess: true,
    });
    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', 'Bearer ' + forged)
      .set('x-disciplinary-access', 'true')
      .expect(403);
  });
  it('lets a restricted account log out and invalidates its old JWT', async () => {
    h.fixture({ type: SanctionType.EXPULSION, endsAt: null });
    await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Authorization', 'Bearer ' + tokens.target)
      .expect(204);
    await get('/account/sanctions').expect(401);
  });
  it.each([
    '/admin/sanctions',
    '/admin/users',
    '/admin/audit-logs',
    '/tables/me',
  ])('does not release ordinary or administrative route %s', async (url) => {
    h.fixture({ userId: 'admin', type: SanctionType.ACCOUNT_SUSPENSION });
    await get(url, 'admin').expect(403);
  });
  it('blocks profile mutations through their actual HTTP method', async () => {
    h.fixture({ type: SanctionType.ACCOUNT_SUSPENSION });
    await request(app.getHttpServer())
      .patch('/account/profile')
      .set('Authorization', 'Bearer ' + tokens.target)
      .send({ displayName: 'Changed' })
      .expect(403);
  });
  it('does not mutate account status, roles, or sanction history while checking access', async () => {
    const before = structuredClone(h.users.get('target'));
    h.fixture({ type: SanctionType.ACCOUNT_SUSPENSION });
    const state = h.state();
    await get('/auth/me').expect(403);
    await get('/account/sanctions').expect(200);
    expect(h.users.get('target')).toEqual(before);
    expect(h.state()).toEqual(state);
  });
  it('limits listing to the authenticated owner and rejects user substitution', async () => {
    h.fixture();
    h.fixture({ userId: 'user' });
    const response = await get('/account/sanctions').expect(200);
    const result = data(response) as {
      items: Record<string, unknown>[];
      meta: { total: number };
    };
    expect(result.meta.total).toBe(1);
    expect(result.items[0].userId).toBe('target');
    await get('/account/sanctions?userId=user').expect(400);
    await get('/account/sanctions?createdById=admin').expect(400);
  });
  it('does not expose existence or private provenance of other users decisions', async () => {
    const foreign = h.fixture({ userId: 'user' });
    const missing = await get('/account/sanctions/missing').expect(404);
    const forbidden = await get('/account/sanctions/' + foreign.id).expect(404);
    expect(data(forbidden).code).toBe(data(missing).code);
  });
  it('even an administrator only sees its own decisions through owner routes', async () => {
    const row = h.fixture();
    await get('/account/sanctions/' + row.id, 'admin').expect(404);
  });
  it('returns the own decision reason but omits administrators, links and third-party information', async () => {
    const row = h.fixture({
      reportId: 'report',
      warningId: 'warning',
      reason: 'Own decision explanation',
      reversalReason: 'Own reversal explanation',
    });
    const response = await get('/account/sanctions/' + row.id).expect(200);
    const result = data(response);
    expect(result.reason).toBe('Own decision explanation');
    for (const key of [
      'reportId',
      'warningId',
      'createdById',
      'reversedById',
      'report',
      'warning',
      'profile',
      'passwordHash',
    ])
      expect(result).not.toHaveProperty(key);
    expect(JSON.stringify(result)).not.toContain('PRIVATE_REPORT_MARKER');
  });
  it('supports owner filters and pagination without copying private text into lists', async () => {
    h.fixture({ type: SanctionType.EXPULSION, endsAt: null });
    h.fixture();
    const response = await get(
      '/account/sanctions?type=EXPULSION&status=ACTIVE&limit=1',
    ).expect(200);
    const result = data(response) as {
      items: Record<string, unknown>[];
      meta: { total: number };
    };
    expect(result.meta.total).toBe(1);
    expect(result.items[0].type).toBe('EXPULSION');
    expect(result.items[0]).not.toHaveProperty('reason');
  });
  it.each(['limit=51', 'page=0', 'type=UNKNOWN', 'status=UNKNOWN'])(
    'rejects invalid owner query %s',
    async (query) => {
      await get('/account/sanctions?' + query).expect(400);
    },
  );
  it('keeps public health independent from restrictions and logs free of decision text', async () => {
    h.fixture({ type: SanctionType.ACCOUNT_SUSPENSION });
    await get('/auth/me').expect(403);
    await get('/account/sanctions').expect(200);
    await request(app.getHttpServer()).get('/health').expect(200);
    const output = JSON.stringify([
      logs.info.mock.calls,
      logs.error.mock.calls,
    ]);
    for (const marker of ['PRIVATE_REASON_MARKER', password, tokens.target])
      expect(output).not.toContain(marker);
  });
});
