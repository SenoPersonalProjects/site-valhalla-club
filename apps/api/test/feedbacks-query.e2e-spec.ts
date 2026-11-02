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
import { feedbackQueryHarness } from './support/feedback-query-harness';

describe('Feedback reading with real JWT and privacy boundaries (e2e)', () => {
  let app: INestApplication<App>;
  let h: Awaited<ReturnType<typeof feedbackQueryHarness>>;
  let jwt: JwtService;
  const logs = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  const token = (id: string) =>
    jwt.sign({ sub: id, ver: h.state().users[id].authVersion, type: 'access' });
  const get = (path: string, actor?: string) => {
    const req = request(app.getHttpServer()).get(path);
    return actor ? req.set('Authorization', `Bearer ${token(actor)}`) : req;
  };
  const publicPath = '/sessions/session/feedbacks/public';
  beforeEach(async () => {
    h = await feedbackQueryHarness('campaign', true);
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
              JWT_SECRET: 'test-only-feedback-query-secret-at-least-32-bytes',
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

  it('serves minimal public feedback without authentication', async () => {
    const response = await get(publicPath).expect(200);
    expect(response.body).toMatchObject({ meta: { total: 2 } });
    const body = response.body as { items: Record<string, unknown>[] };
    for (const row of body.items)
      expect(Object.keys(row).sort()).toEqual(
        [
          'id',
          'targetType',
          'rating',
          'comment',
          'visibility',
          'createdAt',
          'updatedAt',
        ].sort(),
      );
    expect(response.text).not.toContain('Private opinion');
    expect(response.text).not.toContain('Hidden content');
  });
  it('does not expand public visibility when an admin token is supplied', async () => {
    const response = await get(publicPath, 'admin').expect(200);
    expect(response.body).toMatchObject({ meta: { total: 2 } });
    expect(response.text).not.toContain('moderationReason');
  });
  it.each([
    '/sessions/session/feedbacks',
    '/feedbacks/example',
    '/admin/sessions/session/feedbacks',
    '/admin/feedbacks/example',
  ])('requires JWT for %s', async (path) => {
    await get(path).set('x-user-id', 'admin').expect(401);
  });
  it('returns private feedback to its author and recipient', async () => {
    for (const actor of ['player', 'master']) {
      const response = await get(
        `/feedbacks/${h.ids.privateMaster}`,
        actor,
      ).expect(200);
      expect(response.body).toMatchObject({
        comment: 'Private opinion',
        visibility: 'PRIVATE_TO_RECIPIENT',
      });
      expect(response.body).not.toHaveProperty('moderationReason');
    }
  });
  it.each(['other', 'admin', 'club-admin'])(
    'returns indistinguishable 404 for an unrelated caller: %s',
    async (actor) => {
      const response = await get(
        `/feedbacks/${h.ids.privateMaster}`,
        actor,
      ).expect(404);
      expect(response.body).toMatchObject({ code: 'FEEDBACK_NOT_FOUND' });
      expect(response.text).not.toContain('Private opinion');
    },
  );
  it('returns no personal records for an unrelated approved user', async () => {
    const response = await get(
      '/sessions/session/feedbacks',
      'club-admin',
    ).expect(200);
    expect(response.body).toEqual({
      items: [],
      meta: { page: 1, limit: 20, total: 0, pages: 0 },
    });
  });
  it('filters hidden feedback even for its author', async () => {
    await get(`/feedbacks/${h.ids.hidden}`, 'other').expect(404);
    const response = await get('/sessions/session/feedbacks', 'other').expect(
      200,
    );
    expect(response.text).not.toContain('Hidden content');
    expect(response.body).toMatchObject({ meta: { total: 1 } });
  });
  it.each([SystemRole.ADMIN, SystemRole.DEV])(
    'allows %s to read hidden and private records through admin routes',
    async (role) => {
      h.state().users.admin.systemRole = role;
      const list = await get(
        '/admin/sessions/session/feedbacks',
        'admin',
      ).expect(200);
      expect(list.body).toMatchObject({ meta: { total: 5 } });
      const detail = await get(
        `/admin/feedbacks/${h.ids.hidden}`,
        'admin',
      ).expect(200);
      expect(detail.body).toMatchObject({
        hiddenById: 'admin',
        moderationReason: 'Private moderation reason',
      });
      expect(detail.body).not.toHaveProperty('targetKey');
    },
  );
  it.each(['player', 'master', 'club-admin'])(
    'rejects administrative listing and details for %s',
    async (actor) => {
      await get('/admin/sessions/session/feedbacks', actor).expect(403);
      await get(`/admin/feedbacks/${h.ids.hidden}`, actor).expect(403);
    },
  );
  it.each([
    AccountStatus.PENDING,
    AccountStatus.REJECTED,
    AccountStatus.SUSPENDED,
  ])(
    'rejects stale credentials after account status becomes %s',
    async (status) => {
      const bearer = token('player');
      h.state().users.player.status = status;
      await request(app.getHttpServer())
        .get('/sessions/session/feedbacks')
        .set('Authorization', `Bearer ${bearer}`)
        .expect(401);
    },
  );
  it.each([
    'page=0',
    'limit=51',
    'page=1.5',
    'targetType=UNKNOWN',
    'targetType=',
    'authorId=admin',
    'visibility=PRIVATE_TO_RECIPIENT',
    'showHidden=true',
    'where[hiddenAt]=null',
    'page=9007199254740991&limit=50',
  ])('rejects unsupported query: %s', async (query) => {
    await get(`${publicPath}?${query}`).expect(400);
  });
  it.each([
    '/sessions/invalid%00id/feedbacks/public',
    '/feedbacks/invalid%00id',
    `/feedbacks/${'x'.repeat(129)}`,
  ])('validates path parameters: %s', async (path) => {
    await get(path, 'player').expect(400);
  });
  it('applies numeric pagination and type filtering consistently', async () => {
    const response = await get(
      `${publicPath}?page=1&limit=1&targetType=PLAYER`,
    ).expect(200);
    expect(response.body).toMatchObject({
      items: [{ id: h.ids.publicPlayer }],
      meta: { page: 1, limit: 1, total: 1, pages: 1 },
    });
  });
  it('returns an empty public scope for an unknown session', async () => {
    const response = await get('/sessions/unknown/feedbacks/public').expect(
      200,
    );
    expect(response.body).toMatchObject({ items: [], meta: { total: 0 } });
  });
  it('never includes private content, moderation reasons or tokens in technical logs', async () => {
    const bearer = token('admin');
    await request(app.getHttpServer())
      .get(`/admin/feedbacks/${h.ids.hidden}`)
      .set('Authorization', `Bearer ${bearer}`)
      .expect(200);
    await get(`/feedbacks/${h.ids.privateMaster}`, 'player').expect(200);
    const serialized = JSON.stringify({
      info: logs.info.mock.calls,
      warn: logs.warn.mock.calls,
      error: logs.error.mock.calls,
    });
    for (const value of [
      bearer,
      'Private opinion',
      'Private moderation reason',
      'Hidden content',
    ])
      expect(serialized).not.toContain(value);
  });
});
