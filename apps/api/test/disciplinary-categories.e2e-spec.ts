import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { AccountStatus, SystemRole } from '../src/generated/prisma/enums';
import { StructuredLoggerService } from '../src/observability/structured-logger.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { disciplinaryCategoriesHarness } from './support/disciplinary-categories.harness';

describe('Administrative disciplinary categories with real Bearer JWT (e2e)', () => {
  let app: INestApplication<App>;
  let h: ReturnType<typeof disciplinaryCategoriesHarness>;
  let jwt: JwtService;
  const endpoint = '/admin/disciplinary-categories';
  const logs = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  const token = (id: string) =>
    jwt.sign({ sub: id, ver: h.users[id].authVersion, type: 'access' });
  const get = (query = '', actor = 'admin') =>
    request(app.getHttpServer())
      .get(endpoint + query)
      .set('Authorization', `Bearer ${token(actor)}`);
  beforeEach(async () => {
    h = disciplinaryCategoriesHarness();
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
              JWT_SECRET: 'test-only-category-secret-at-least-32-bytes',
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

  it.each(['admin', 'dev'])(
    'allows %s with ordered, active-only, minimal rows and scoped total',
    async (actor) => {
      const response = await get('', actor).expect(200);
      expect(response.body).toMatchObject({
        meta: { page: 1, limit: 20, total: 5, pages: 1 },
      });
      const body = response.body as { items: Array<Record<string, unknown>> };
      expect(body.items.map((row) => row.code)).toEqual([
        'COMMITMENTS',
        'DISCRIMINATION',
        'HARASSMENT',
        'RESPECT',
        'SAFETY',
      ]);
      for (const row of body.items)
        expect(Object.keys(row).sort()).toEqual(['code', 'id', 'label']);
      expect(h.tx.disciplinaryCategory.createMany).not.toHaveBeenCalled();
    },
  );
  it('does not provision categories automatically during application startup', () => {
    expect(h.tx.disciplinaryCategory.createMany).not.toHaveBeenCalled();
  });
  it('requires JWT and does not accept forged x-user-id', async () => {
    await request(app.getHttpServer())
      .get(endpoint)
      .set('x-user-id', 'admin')
      .expect(401);
  });
  it('rejects malformed Bearer credentials', async () => {
    await request(app.getHttpServer())
      .get(endpoint)
      .set('Authorization', 'Bearer invalid')
      .expect(401);
  });
  it.each(['user', 'master', 'club-admin'])(
    'denies %s even with a valid token',
    async (actor) => {
      await get('', actor).expect(403);
      expect(h.tx.disciplinaryCategory.findMany).not.toHaveBeenCalled();
    },
  );
  it.each([
    AccountStatus.PENDING,
    AccountStatus.REJECTED,
    AccountStatus.SUSPENDED,
    AccountStatus.DELETION_PENDING,
    AccountStatus.ANONYMIZED,
  ])(
    'denies stale credentials after account status becomes %s',
    async (status) => {
      const bearer = token('admin');
      h.users.admin.status = status;
      await request(app.getHttpServer())
        .get(endpoint)
        .set('Authorization', `Bearer ${bearer}`)
        .expect(401);
    },
  );
  it('uses the current role instead of the role held when the token was issued', async () => {
    const bearer = token('admin');
    h.users.admin.systemRole = SystemRole.USER;
    await request(app.getHttpServer())
      .get(endpoint)
      .set('Authorization', `Bearer ${bearer}`)
      .expect(403);
  });
  it.each([
    '?page=0',
    '?limit=51',
    '?page=1.5',
    '?page=9007199254740991&limit=50',
    '?active=false',
    '?userId=admin',
    '?where[active]=false',
  ])('rejects invalid or unsupported query %s', async (query) => {
    await get(query).expect(400);
  });
  it('parses pagination without counting inactive categories', async () => {
    const response = await get('?page=2&limit=2').expect(200);
    expect(response.body).toMatchObject({
      items: [{ code: 'HARASSMENT' }, { code: 'RESPECT' }],
      meta: { page: 2, limit: 2, total: 5, pages: 3 },
    });
  });
  it('keeps the request ID and omits credentials from technical logs', async () => {
    const bearer = token('admin');
    await request(app.getHttpServer())
      .get(endpoint)
      .set('Authorization', `Bearer ${bearer}`)
      .set('x-request-id', 'categories-list-001')
      .expect(200)
      .expect('x-request-id', 'categories-list-001');
    expect(
      JSON.stringify({
        info: logs.info.mock.calls,
        error: logs.error.mock.calls,
      }),
    ).not.toContain(bearer);
  });
});
