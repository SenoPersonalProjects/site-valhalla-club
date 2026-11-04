import { Server } from 'node:http';
import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request, { Response } from 'supertest';
import { AppModule } from '../src/app.module';
import {
  AccountStatus,
  SanctionType,
  SystemRole,
} from '../src/generated/prisma/enums';
import { StructuredLoggerService } from '../src/observability/structured-logger.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { sanctionsHarness } from './support/sanctions.harness';

const body = (response: Response) => response.body as Record<string, unknown>;
const justification = 'PRIVATE_HTTP_APPEAL';
const responseText = 'PRIVATE_HTTP_REVIEW';

describe('Own appeals, independent administrative review and limited disciplinary access', () => {
  let app: INestApplication<Server>, h: ReturnType<typeof sanctionsHarness>;
  const tokens: Record<string, string> = {};
  const logs = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  beforeAll(async () => {
    h = sanctionsHarness();
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(h.root)
      .overrideProvider(ConfigService)
      .useValue({
        get: (key: string) =>
          ({
            JWT_SECRET: 'appeals-e2e-only-secret-at-least-32-bytes',
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
  beforeEach(() => {
    h.reset();
    jest.clearAllMocks();
  });
  afterAll(async () => {
    await app?.close();
  });
  const get = (url: string, actor = 'target') =>
    request(app.getHttpServer())
      .get(url)
      .set('Authorization', 'Bearer ' + tokens[actor]);
  const submit = (
    data: object = { warningId: 'warning', justification },
    actor = 'target',
  ) =>
    request(app.getHttpServer())
      .post('/account/appeals')
      .set('Authorization', 'Bearer ' + tokens[actor])
      .send(data);
  const review = (
    id: string,
    decision = 'APPROVED',
    actor = 'dev',
    data: object = { decision, response: responseText },
  ) =>
    request(app.getHttpServer())
      .patch('/admin/appeals/' + id + '/review')
      .set('Authorization', 'Bearer ' + tokens[actor])
      .send(data);

  it.each(['WARNING', 'SANCTION'])(
    'creates a %s appeal with server-controlled identity and sequence',
    async (kind) => {
      const refs =
        kind === 'WARNING'
          ? { warningId: 'warning' }
          : { sanctionId: h.fixture().id };
      const result = await submit({ ...refs, justification })
        .set('x-request-id', 'appeal-http-001')
        .expect(201);
      expect(body(result)).toMatchObject({
        userId: 'target',
        sequence: 1,
        status: 'PENDING',
        justification,
      });
      expect('reviewedById' in body(result)).toBe(false);
      expect(h.state().logs[0]).toMatchObject({
        action: 'APPEAL_SUBMITTED',
        requestId: 'appeal-http-001',
        metadata: { targetType: kind, sequence: 1 },
      });
    },
  );

  it.each([
    {},
    { warningId: 'warning', sanctionId: 'x', justification },
    { warningId: null, justification },
    { warningId: 'warning', justification: '' },
    { warningId: 'warning', justification: '  ' },
    { warningId: 'warning', justification: null },
    { warningId: 'warning', justification: 1 },
    { warningId: 'warning', justification: 'x'.repeat(1001) },
    { warningId: 'warning', justification: 'nul\0' },
    { warningId: 'warning', justification, userId: 'user' },
    { warningId: 'warning', justification, sequence: 3 },
    { warningId: 'warning', justification, status: 'APPROVED' },
    { warningId: 'warning', justification, reviewedById: 'dev' },
    { warningId: 'x'.repeat(129), justification },
  ])(
    'rejects invalid or server-controlled submission fields %j',
    async (data) => {
      await submit(data).expect(400);
      expect(h.appeals()).toHaveLength(0);
      expect(h.state().logs).toHaveLength(0);
    },
  );

  it('requires authentication on every limited route and ignores alternate identity headers', async () => {
    for (const route of [
      '/account/appeals',
      '/account/warnings',
      '/account/warnings/warning',
    ]) {
      await request(app.getHttpServer())
        .get(route)
        .set('x-user-id', 'target')
        .expect(401);
      await request(app.getHttpServer())
        .get(route)
        .set('Authorization', 'Bearer forged')
        .expect(401);
    }
    await request(app.getHttpServer())
      .post('/account/appeals')
      .set('x-user-id', 'target')
      .send({ warningId: 'warning', justification })
      .expect(401);
  });

  it('rejects revoked tokens and lifecycle-blocked owners on limited routes', async () => {
    h.users.get('target')!.authVersion++;
    await submit().expect(401);
    await get('/account/warnings').expect(401);
    h.users.get('target')!.authVersion = 0;
    h.users.get('target')!.status = AccountStatus.SUSPENDED;
    await submit().expect(401);
    await get('/account/appeals').expect(401);
  });

  it.each(['user', 'admin'])(
    'does not disclose another account case or appeal to %s using own routes',
    async (actor) => {
      const appeal = h.appealFixture();
      await submit({ warningId: 'warning', justification }, actor).expect(404);
      await get('/account/appeals/' + appeal.id, actor).expect(404);
      await get('/account/warnings/warning', actor).expect(404);
      expect(
        body(await get('/account/appeals', actor).expect(200)).meta,
      ).toMatchObject({ total: 0 });
    },
  );

  it.each(['ACCOUNT_SUSPENSION', 'EXPULSION'] as const)(
    'preserves only authenticated own access while under %s',
    async (type) => {
      const sanction = h.fixture({
        type,
        endsAt: type === 'EXPULSION' ? null : new Date('2035-01-01Z'),
      });
      await get('/auth/me').expect(403);
      const appeal = body(
        await submit({ sanctionId: sanction.id, justification }).expect(201),
      );
      await get('/account/appeals/' + String(appeal.id)).expect(200);
      await get('/account/appeals').expect(200);
      await get('/account/warnings').expect(200);
      await get('/auth/me').expect(403);
      await get('/admin/appeals').expect(403);
      expect(h.state().sanctions[0].status).toBe('ACTIVE');
    },
  );

  it('allows three rejected attempts and blocks both parallel pending submissions and the fourth attempt', async () => {
    for (let i = 1; i <= 3; i++) {
      const appeal = body(await submit().expect(201));
      expect(appeal.sequence).toBe(i);
      expect(body(await submit().expect(409)).code).toBe('APPEAL_PENDING');
      await review(String(appeal.id), 'REJECTED').expect(200);
    }
    expect(body(await submit().expect(409)).code).toBe('APPEAL_LIMIT_REACHED');
    expect(h.appeals()).toHaveLength(3);
  });

  it('does not share the warning counter with a related sanction', async () => {
    const one = body(await submit().expect(201));
    await review(String(one.id), 'REJECTED').expect(200);
    const sanction = h.fixture({ warningId: 'warning' });
    expect(
      body(await submit({ sanctionId: sanction.id, justification }).expect(201))
        .sequence,
    ).toBe(1);
    expect(body(await submit().expect(201)).sequence).toBe(2);
  });

  it.each(['admin', 'target'])(
    'denies evaluation by the issuer or appellant: %s',
    async (actor) => {
      const appeal = h.appealFixture();
      if (actor === 'target')
        h.users.get('target')!.systemRole = SystemRole.DEV;
      expect(
        body(await review(appeal.id, 'APPROVED', actor).expect(403)).code,
      ).toBe('APPEAL_INDEPENDENT_REVIEWER_REQUIRED');
      expect(h.appeals()[0].status).toBe('PENDING');
    },
  );

  it.each(['user', 'club-admin'])(
    'denies administrative review and queries to %s',
    async (actor) => {
      const appeal = h.appealFixture();
      await review(appeal.id, 'REJECTED', actor).expect(403);
      await get('/admin/appeals', actor).expect(403);
      await get('/admin/appeals/' + appeal.id, actor).expect(403);
    },
  );

  it('does not permit a sanctioned administrator to review appeals', async () => {
    const appeal = h.appealFixture();
    h.fixture({ userId: 'dev', type: SanctionType.EXPULSION, endsAt: null });
    expect(body(await review(appeal.id).expect(403)).code).toBe(
      'ACCOUNT_SANCTIONED',
    );
    await get('/account/appeals', 'dev').expect(200);
  });

  it.each([
    {},
    { decision: 'PENDING', response: 'Valid' },
    { decision: 'APPROVED' },
    { decision: 'REJECTED', response: null },
    { decision: 'APPROVED', response: '' },
    { decision: 'APPROVED', response: '  ' },
    { decision: 'APPROVED', response: 'x'.repeat(1001) },
    { decision: 'APPROVED', response: 'Valid', reviewedById: 'dev' },
    {
      decision: 'APPROVED',
      response: 'Valid',
      reviewedAt: '2030-01-01T00:00:00Z',
    },
  ])('validates every review field %j', async (data) => {
    const appeal = h.appealFixture();
    await review(appeal.id, 'APPROVED', 'dev', data).expect(400);
    expect(h.appeals()[0].status).toBe('PENDING');
    expect(h.state().logs).toHaveLength(0);
  });

  it.each(['WARNING', 'SANCTION'])(
    'approves %s with atomic reversal while preserving other measures',
    async (kind) => {
      const sanction = h.fixture({
        type: SanctionType.ACCOUNT_SUSPENSION,
        warningId: 'warning',
      });
      const refs =
        kind === 'WARNING'
          ? { warningId: 'warning' }
          : { sanctionId: sanction.id };
      const appeal = body(await submit({ ...refs, justification }).expect(201));
      const reviewed = body(
        await review(String(appeal.id))
          .set('x-request-id', 'review-http-001')
          .expect(200),
      );
      expect(reviewed).toMatchObject({
        status: 'APPROVED',
        reviewedById: 'dev',
        response: responseText,
      });
      expect(h.state().logs.map((log) => log.action)).toEqual([
        'APPEAL_SUBMITTED',
        kind + '_REVERSED',
        'APPEAL_REVIEWED',
      ]);
      if (kind === 'WARNING') {
        expect(h.warnings.get('warning')!.status).toBe('REVERSED');
        expect(h.warnings.get('warning')!.effectiveWeight).toBe('4.5');
        await get('/auth/me').expect(403);
        expect(h.state().sanctions[0].status).toBe('ACTIVE');
      } else {
        await get('/auth/me').expect(200);
        expect(h.warnings.get('warning')!.status).toBe('ACTIVE');
      }
      const own = body(
        await get('/account/appeals/' + String(appeal.id)).expect(200),
      );
      expect(own.response).toBe(responseText);
      expect('reviewedById' in own).toBe(false);
      expect(
        body(await submit({ ...refs, justification }).expect(409)).code,
      ).toBe('APPEAL_CASE_CLOSED');
    },
  );

  it('preserves the first reviewer and response on a repeated decision', async () => {
    const appeal = h.appealFixture();
    const first = body(await review(appeal.id, 'REJECTED').expect(200));
    h.users.get('user')!.systemRole = SystemRole.ADMIN;
    expect(
      body(
        await review(appeal.id, 'REJECTED', 'user', {
          decision: 'REJECTED',
          response: 'Changed text',
        }).expect(200),
      ),
    ).toEqual(first);
    await review(appeal.id, 'APPROVED').expect(409);
    await review(appeal.id, 'REJECTED', 'dev', { decision: 'REJECTED' }).expect(
      400,
    );
    expect(h.state().logs).toHaveLength(2);
    expect(h.state().logs[1].metadata).toMatchObject({ changed: false });
  });

  it('handles an already reversed target without rewriting the original reversal', async () => {
    const sanction = h.fixture(),
      appeal = h.appealFixture({ warningId: null, sanctionId: sanction.id });
    await h.service.reverse('admin', sanction.id, {
      reason: 'First manual decision',
    });
    await review(appeal.id).expect(200);
    expect(h.state().sanctions[0].reversalReason).toBe('First manual decision');
    expect(h.appeals()[0].status).toBe('APPROVED');
  });

  it('supports filtered administrative queries without exposing free text in lists', async () => {
    const appeal = h.appealFixture();
    h.appealFixture({ userId: 'user' });
    const result = body(
      await get(
        '/admin/appeals?userId=target&status=PENDING&limit=1',
        'dev',
      ).expect(200),
    );
    expect(result.meta).toMatchObject({ total: 1, limit: 1 });
    const items = result.items as Record<string, unknown>[];
    expect(items[0].id).toBe(appeal.id);
    expect('justification' in items[0]).toBe(false);
    expect('response' in items[0]).toBe(false);
    expect(
      body(await get('/admin/appeals/' + appeal.id, 'dev').expect(200)),
    ).toHaveProperty('reviewedById');
  });

  it.each([
    '?userId=user',
    '?reviewedById=dev',
    '?warningId=warning&sanctionId=x',
    '?status=UNKNOWN',
    '?page=0',
    '?limit=51',
  ])('rejects invalid owner filters %s', async (query) => {
    await get('/account/appeals' + query).expect(400);
  });

  it('returns minimal own warning projections with effective expiration', async () => {
    h.warnings.get('warning')!.expiresAt = new Date(0);
    const result = body(
      await get('/account/warnings?status=EXPIRED').expect(200),
    );
    const items = result.items as Record<string, unknown>[];
    expect(items[0]).toMatchObject({
      id: 'warning',
      status: 'EXPIRED',
      isEffective: false,
    });
    expect('reason' in items[0]).toBe(false);
    const detail = body(await get('/account/warnings/warning').expect(200));
    expect(detail.reason).toBe('PRIVATE_WARNING_REASON');
    for (const key of ['reportId', 'createdById', 'reversedById'])
      expect(key in detail).toBe(false);
    await get('/account/warnings?userId=user').expect(400);
    await get('/account/warnings?status=REVERSED').expect(200);
    expect(h.state().logs).toHaveLength(0);
  });

  it.each(['WARNING', 'SANCTION'])(
    'rolls back %s reversal when the final appeal audit fails',
    async (kind) => {
      const refs =
        kind === 'WARNING'
          ? { warningId: 'warning' }
          : { sanctionId: h.fixture().id };
      const appeal = body(await submit({ ...refs, justification }).expect(201));
      h.failAudit('APPEAL_REVIEWED');
      await review(String(appeal.id)).expect(500);
      expect(h.appeals()[0].status).toBe('PENDING');
      expect(h.state().logs).toHaveLength(1);
      if (kind === 'WARNING')
        expect(h.warnings.get('warning')!.status).toBe('ACTIVE');
      else expect(h.state().sanctions[0].status).toBe('ACTIVE');
    },
  );

  it('retries a conflicting third sequence safely and exposes only generic exhaustion', async () => {
    h.abort(3);
    const result = await submit().expect(409);
    expect(body(result).code).toBe('APPEAL_CONFLICT');
    expect(h.appeals()).toHaveLength(0);
  });

  it('returns not found for unknown appeals without audit', async () => {
    await get('/account/appeals/missing').expect(404);
    await get('/admin/appeals/missing', 'dev').expect(404);
    await review('missing').expect(404);
    expect(h.state().logs).toHaveLength(0);
  });

  it('logs no private justification, response, warning content or JWT', async () => {
    const appeal = body(await submit().expect(201));
    await review(String(appeal.id)).expect(200);
    const serialized = JSON.stringify({
      info: logs.info.mock.calls,
      errors: logs.error.mock.calls,
      metadata: h.state().logs.map((log) => log.metadata),
    });
    for (const secret of [
      justification,
      responseText,
      'PRIVATE_WARNING_REASON',
      tokens.target,
    ])
      expect(serialized).not.toContain(secret);
  });
});
