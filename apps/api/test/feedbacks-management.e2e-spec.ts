import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { AccountStatus, SystemRole } from '../src/generated/prisma/enums';
import { FEEDBACK_EDIT_WINDOW_MS } from '../src/feedbacks/feedback.constants';
import { StructuredLoggerService } from '../src/observability/structured-logger.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { feedbackQueryHarness } from './support/feedback-query-harness';

describe('Feedback editing and hiding with real Bearer JWT (e2e)', () => {
  let app: INestApplication<App>;
  let h: Awaited<ReturnType<typeof feedbackQueryHarness>>;
  let jwt: JwtService;
  const logs = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  const token = (id: string) =>
    jwt.sign({ sub: id, ver: h.state().users[id].authVersion, type: 'access' });
  const edit = (body: object, actor = 'player', id = h.ids.privateMaster) =>
    request(app.getHttpServer())
      .patch(`/feedbacks/${id}`)
      .set('Authorization', `Bearer ${token(actor)}`)
      .send(body);
  const hide = (
    body: object = { reason: 'Moderation reason' },
    actor = 'admin',
    id = h.ids.session,
  ) =>
    request(app.getHttpServer())
      .patch(`/admin/feedbacks/${id}/hide`)
      .set('Authorization', `Bearer ${token(actor)}`)
      .send(body);
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
              JWT_SECRET:
                'test-only-feedback-management-secret-at-least-32-bytes',
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

  it('edits rating, comment and visibility without changing identity or extending the deadline', async () => {
    const before = structuredClone(
      h.state().feedbacks.find((row) => row.id === h.ids.privateMaster)!,
    );
    const response = await edit({
      rating: 0,
      comment: ' Revised opinion ',
      visibility: 'PUBLIC',
    }).expect(200);
    expect(response.body).toMatchObject({
      id: before.id,
      authorId: before.authorId,
      targetUserId: before.targetUserId,
      sessionId: before.sessionId,
      targetType: before.targetType,
      rating: 0,
      comment: 'Revised opinion',
      visibility: 'PUBLIC',
      createdAt: before.createdAt.toISOString(),
      editableUntil: before.editableUntil.toISOString(),
    });
    expect(response.body).not.toHaveProperty('targetKey');
    expect(response.body).not.toHaveProperty('moderationReason');
  });
  it.each([null, '', '  '])(
    'clears optional comment with %j',
    async (comment) => {
      const response = await edit({ comment }).expect(200);
      expect(response.body).toMatchObject({
        comment: null,
        rating: 9,
        visibility: 'PRIVATE_TO_RECIPIENT',
      });
    },
  );
  it.each([0, 10])('accepts boundary rating %s', async (rating) => {
    await edit({ rating }).expect(200);
  });
  it.each([
    {},
    { rating: null },
    { rating: -1 },
    { rating: 11 },
    { rating: 2.5 },
    { rating: '8' },
    { visibility: null },
    { visibility: 'INVALID' },
    { comment: 10 },
    { comment: '\u0000' },
    { comment: 'x'.repeat(2001) },
    { rating: 8, authorId: 'admin' },
    { rating: 8, targetType: 'SESSION' },
    { rating: 8, targetUserId: 'other' },
    { rating: 8, sessionId: 'other-session' },
    { rating: 8, editableUntil: '2099-01-01T00:00:00Z' },
    { rating: 8, createdAt: '2099-01-01T00:00:00Z' },
    { rating: 8, hiddenAt: null },
    { rating: 8, targetKey: 'SESSION' },
  ])('rejects invalid or immutable edit fields: %j', async (body) => {
    const before = structuredClone(h.state().feedbacks);
    await edit(body).expect(400);
    expect(h.state().feedbacks).toEqual(before);
  });
  it('rejects private visibility for session feedback', async () => {
    const response = await edit(
      { visibility: 'PRIVATE_TO_RECIPIENT' },
      'player',
      h.ids.session,
    ).expect(400);
    expect(response.body).toMatchObject({
      code: 'FEEDBACK_SESSION_PRIVATE_NOT_ALLOWED',
    });
  });
  it.each(['master', 'other', 'admin'])(
    'blocks another author editing, including recipient/admin: %s',
    async (actor) => {
      const response = await edit({ rating: 1 }, actor).expect(404);
      expect(response.body).toMatchObject({ code: 'FEEDBACK_NOT_FOUND' });
    },
  );
  it('requires JWT for both mutations and rejects forged x-user-id', async () => {
    await request(app.getHttpServer())
      .patch(`/feedbacks/${h.ids.session}`)
      .set('x-user-id', 'player')
      .send({ rating: 1 })
      .expect(401);
    await request(app.getHttpServer())
      .patch(`/admin/feedbacks/${h.ids.session}/hide`)
      .set('x-user-id', 'admin')
      .send({ reason: 'Moderation' })
      .expect(401);
  });
  it('blocks editing after the original 24h even if the persisted deadline was extended', async () => {
    const row = h
      .state()
      .feedbacks.find((item) => item.id === h.ids.privateMaster)!;
    row.createdAt = new Date(Date.now() - FEEDBACK_EDIT_WINDOW_MS - 1);
    row.editableUntil = new Date(Date.now() + FEEDBACK_EDIT_WINDOW_MS);
    const response = await edit({ rating: 1 }).expect(409);
    expect(response.body).toMatchObject({
      code: 'FEEDBACK_EDIT_WINDOW_CLOSED',
    });
  });
  it('also honors a shorter persisted deadline', async () => {
    h
      .state()
      .feedbacks.find(
        (item) => item.id === h.ids.privateMaster,
      )!.editableUntil = new Date(Date.now() - 1);
    await edit({ rating: 1 }).expect(409);
  });
  it.each([SystemRole.ADMIN, SystemRole.DEV])(
    'allows %s to hide with responsible actor, reason, date and request ID',
    async (role) => {
      h.state().users.admin.systemRole = role;
      const response = await hide({ reason: ' Private moderation reason ' })
        .set('x-request-id', 'feedback-hide-http-1')
        .expect(200)
        .expect('x-request-id', 'feedback-hide-http-1');
      expect(response.body).toMatchObject({
        id: h.ids.session,
        hiddenById: 'admin',
        moderationReason: 'Private moderation reason',
        rating: 8,
      });
      expect(
        Number.isNaN(
          Date.parse((response.body as { hiddenAt: string }).hiddenAt),
        ),
      ).toBe(false);
      expect(h.state().audits.at(-1)).toMatchObject({
        action: 'FEEDBACK_HIDDEN',
        entityType: 'FEEDBACK',
        entityId: h.ids.session,
        requestId: 'feedback-hide-http-1',
        actorId: 'admin',
        metadata: { changed: true, sessionId: 'session' },
      });
      expect(JSON.stringify(h.state().audits)).not.toContain(
        'Private moderation reason',
      );
    },
  );
  it('hides content from public/personal reads and author editing while preserving administrative history', async () => {
    await hide().expect(200);
    const publicFeed = await request(app.getHttpServer())
      .get('/sessions/session/feedbacks/public')
      .expect(200);
    expect(publicFeed.body).toMatchObject({ meta: { total: 1 } });
    await request(app.getHttpServer())
      .get(`/feedbacks/${h.ids.session}`)
      .set('Authorization', `Bearer ${token('player')}`)
      .expect(404);
    await edit({ rating: 1 }, 'player', h.ids.session).expect(404);
    const administrative = await request(app.getHttpServer())
      .get(`/admin/feedbacks/${h.ids.session}`)
      .set('Authorization', `Bearer ${token('admin')}`)
      .expect(200);
    expect(administrative.body).toMatchObject({
      moderationReason: 'Moderation reason',
    });
    expect(h.state().feedbacks).toHaveLength(5);
  });
  it('keeps the first moderation data when repeated and records changed=false', async () => {
    const first = await hide().expect(200);
    const second = await hide({ reason: 'Different reason' }).expect(200);
    expect(second.body).toEqual(first.body);
    expect(h.state().audits.at(-1)?.metadata).toEqual({
      changed: false,
      sessionId: 'session',
    });
  });
  it.each(['player', 'master', 'club-admin'])(
    'rejects moderation by %s',
    async (actor) => {
      await hide({ reason: 'Moderation' }, actor).expect(403);
    },
  );
  it.each([
    {},
    { reason: '' },
    { reason: '   ' },
    { reason: null },
    { reason: 1 },
    { reason: '\u0000' },
    { reason: 'x'.repeat(1001) },
    { reason: 'Moderation', hiddenById: 'other' },
    { reason: 'Moderation', hiddenAt: '2026-01-01Z' },
  ])('rejects invalid moderation body', async (body) => {
    const count = h.state().audits.length;
    await hide(body).expect(400);
    expect(h.state().audits).toHaveLength(count);
  });
  it.each([
    AccountStatus.PENDING,
    AccountStatus.REJECTED,
    AccountStatus.SUSPENDED,
  ])('blocks stale JWT after status changes to %s', async (status) => {
    const bearer = token('player');
    const adminBearer = token('admin');
    h.state().users.player.status = status;
    h.state().users.admin.status = status;
    await request(app.getHttpServer())
      .patch(`/feedbacks/${h.ids.session}`)
      .set('Authorization', `Bearer ${bearer}`)
      .send({ rating: 1 })
      .expect(401);
    await request(app.getHttpServer())
      .patch(`/admin/feedbacks/${h.ids.session}/hide`)
      .set('Authorization', `Bearer ${adminBearer}`)
      .send({ reason: 'Moderation' })
      .expect(401);
  });
  it('validates mutation path identifiers', async () => {
    await edit({ rating: 1 }, 'player', 'invalid%00id').expect(400);
    await hide({ reason: 'Moderation' }, 'admin', 'x'.repeat(129)).expect(400);
  });
  it('keeps comments, reasons and tokens out of technical logs', async () => {
    const bearer = token('player');
    await request(app.getHttpServer())
      .patch(`/feedbacks/${h.ids.privateMaster}`)
      .set('Authorization', `Bearer ${bearer}`)
      .send({ comment: 'Sensitive feedback edit' })
      .expect(200);
    await hide({ reason: 'Sensitive moderation reason' }).expect(200);
    const serialized = JSON.stringify({
      info: logs.info.mock.calls,
      warn: logs.warn.mock.calls,
      error: logs.error.mock.calls,
    });
    for (const value of [
      bearer,
      'Sensitive feedback edit',
      'Sensitive moderation reason',
    ])
      expect(serialized).not.toContain(value);
  });
  it('rolls back both hiding and audit if audit persistence fails', async () => {
    const before = structuredClone(h.state());
    h.failAudit();
    await hide().expect(500);
    expect(h.state()).toEqual(before);
  });
});
