import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { SchedulerRegistry } from '@nestjs/schedule';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import {
  AccountStatus,
  ReportStatus,
  ReportTargetType,
  SystemRole,
  WarningStatus,
} from '../src/generated/prisma/enums';
import { StructuredLoggerService } from '../src/observability/structured-logger.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { warningsHarness } from './support/warnings.harness';
import { WarningExpirationService } from '../src/warnings/warning-expiration.service';

describe('Administrative warnings with real Bearer JWT (e2e)', () => {
  let app: INestApplication<App>;
  let h: ReturnType<typeof warningsHarness>;
  let jwt: JwtService;
  const logs = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  const base = '/admin/warnings';
  const body = () => ({
    userId: 'target',
    categoryId: 'respect',
    severity: 'MODERATE',
    reason: '  Private disciplinary reason  ',
  });
  const token = (actor: string) =>
    jwt.sign({ sub: actor, ver: h.users[actor].authVersion, type: 'access' });
  const post = (data: unknown = body(), actor = 'admin') =>
    request(app.getHttpServer())
      .post(base)
      .set('Authorization', `Bearer ${token(actor)}`)
      .send(data as object);
  const get = (url = base, actor = 'admin') =>
    request(app.getHttpServer())
      .get(url)
      .set('Authorization', `Bearer ${token(actor)}`);
  const reverse = (
    id: string,
    data: unknown = { reason: 'Private reversal reason' },
    actor = 'admin',
  ) =>
    request(app.getHttpServer())
      .patch(base + '/' + id + '/reversal')
      .set('Authorization', `Bearer ${token(actor)}`)
      .send(data as object);
  beforeEach(async () => {
    h = warningsHarness();
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
              JWT_SECRET: 'test-only-warning-secret-at-least-32-bytes',
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

  describe('Expiration job integration', () => {
    it('runs at application startup and registers its interval without exposing a new HTTP route', () => {
      expect(logs.info).toHaveBeenCalledWith('warnings_expiration_reconciled', {
        count: 0,
        batches: 1,
        batchLimitReached: false,
      });
      expect(logs.error).not.toHaveBeenCalledWith(
        'warnings_expiration_reconciliation_failed',
      );
      expect(
        app.get(SchedulerRegistry).doesExist('interval', 'warning-expiration'),
      ).toBe(true);
    });
    it('expires overdue fixtures internally, remains idempotent and preserves private admin reads', async () => {
      const due = h.fixture({ expiresAt: new Date(0) }),
        future = h.fixture();
      const job = app.get(WarningExpirationService);
      await job.run();
      await job.run();
      expect(h.state().warnings.find((row) => row.id === due.id)?.status).toBe(
        'EXPIRED',
      );
      expect(
        h.state().warnings.find((row) => row.id === future.id)?.status,
      ).toBe('ACTIVE');
      expect(h.state().audits).toEqual([
        {
          actorId: null,
          requestId: null,
          action: 'WARNING_EXPIRED',
          entityType: 'WARNING',
          entityId: due.id,
          metadata: {
            changed: true,
            fromStatus: 'ACTIVE',
            toStatus: 'EXPIRED',
          },
        },
      ]);
      const summary = await get('/admin/users/target/warnings/summary').expect(
        200,
      );
      expect(summary.body).toMatchObject({
        activeCount: 1,
        totalActiveWeight: '3',
      });
      await get(base + '/' + due.id, 'user').expect(403);
      const detail = await get(base + '/' + due.id).expect(200);
      expect(detail.body).toMatchObject({
        status: 'EXPIRED',
        effectiveWeight: '3',
        reason: due.reason,
      });
    });
    it('handles job failure safely and retries on a later cycle without partial state', async () => {
      const row = h.fixture({ expiresAt: new Date(0) });
      h.control.auditFails = true;
      const job = app.get(WarningExpirationService);
      await job.run();
      expect(h.state().warnings[0].status).toBe('ACTIVE');
      expect(h.state().audits).toHaveLength(0);
      expect(logs.error).toHaveBeenCalledWith(
        'warnings_expiration_reconciliation_failed',
      );
      expect(JSON.stringify(logs.error.mock.calls)).not.toContain(
        'Synthetic audit',
      );
      h.control.auditFails = false;
      await job.run();
      expect(
        h.state().warnings.find((item) => item.id === row.id)?.status,
      ).toBe('EXPIRED');
      expect(h.state().audits).toHaveLength(1);
    });
    it('does not change a reversed historical warning or duplicate its audit', async () => {
      const row = h.fixture({
        expiresAt: new Date(0),
        status: WarningStatus.REVERSED,
        reversedById: 'dev',
        reversedAt: new Date(0),
        reversalReason: 'Original reversal',
      });
      const snapshot = JSON.stringify(h.state());
      await app.get(WarningExpirationService).run();
      expect(JSON.stringify(h.state())).toBe(snapshot);
      expect(h.state().warnings[0]).toEqual(row);
    });
    it('limits technical logs to aggregate counters', async () => {
      h.fixture({ expiresAt: new Date(0) });
      await app.get(WarningExpirationService).run();
      const output = JSON.stringify(logs.info.mock.calls);
      for (const secret of [
        'Private administrative reason',
        'warning-0',
        'target',
        'resolved-report',
      ])
        expect(output).not.toContain(secret);
    });
  });

  describe('Reversal endpoint', () => {
    it.each(['admin', 'dev'])(
      'reverses as %s, returns original values and removes active weight',
      async (actor) => {
        const row = h.fixture();
        const result = await reverse(
          row.id,
          { reason: '  Private reversal reason  ' },
          actor,
        ).expect(200);
        expect(result.body).toMatchObject({
          id: row.id,
          status: 'REVERSED',
          reversedById: actor,
          reversalReason: 'Private reversal reason',
          reason: row.reason,
          baseWeight: '3',
          effectiveWeight: '3',
          occurrenceNumber: 1,
        });
        const summary = await get(
          '/admin/users/target/warnings/summary',
        ).expect(200);
        expect(summary.body).toMatchObject({
          activeCount: 0,
          totalActiveWeight: '0',
          categories: [],
        });
        expect(h.state().audits[0]).toMatchObject({
          action: 'WARNING_REVERSED',
          metadata: {
            changed: true,
            fromStatus: 'ACTIVE',
            toStatus: 'REVERSED',
          },
        });
      },
    );
    it('reverses stored EXPIRED and overdue ACTIVE without needing an expiration job', async () => {
      for (const status of [WarningStatus.EXPIRED, WarningStatus.ACTIVE]) {
        const row = h.fixture({ status, expiresAt: new Date(0) });
        await reverse(row.id).expect(200);
        expect(h.state().audits.at(-1)?.metadata).toEqual({
          changed: true,
          fromStatus: 'EXPIRED',
          toStatus: 'REVERSED',
        });
      }
    });
    it('keeps the first decision on repeat and records an audit-only no-op', async () => {
      const row = h.fixture();
      await reverse(row.id, { reason: 'First private reason' }, 'admin').expect(
        200,
      );
      const before = JSON.stringify(h.state().warnings);
      const repeated = await reverse(
        row.id,
        { reason: 'Different private reason' },
        'dev',
      ).expect(200);
      expect(repeated.body).toMatchObject({
        reversedById: 'admin',
        reversalReason: 'First private reason',
      });
      expect(JSON.stringify(h.state().warnings)).toBe(before);
      expect(h.state().audits[1]).toMatchObject({
        actorId: 'dev',
        metadata: {
          changed: false,
          fromStatus: 'REVERSED',
          toStatus: 'REVERSED',
        },
      });
    });
    it.each(['user', 'master', 'club-admin'])(
      'denies %s without touching state',
      async (actor) => {
        const row = h.fixture();
        await reverse(row.id, { reason: 'Reason' }, actor).expect(403);
        expect(h.state().warnings[0].status).toBe('ACTIVE');
        expect(h.state().audits).toHaveLength(0);
      },
    );
    it('requires JWT and ignores a forged identity header', async () => {
      const row = h.fixture();
      await request(app.getHttpServer())
        .patch(base + '/' + row.id + '/reversal')
        .set('x-user-id', 'admin')
        .send({ reason: 'Reason' })
        .expect(401);
    });
    it.each([
      AccountStatus.PENDING,
      AccountStatus.REJECTED,
      AccountStatus.SUSPENDED,
      AccountStatus.DELETION_PENDING,
      AccountStatus.ANONYMIZED,
    ])('rejects stale token after operator becomes %s', async (status) => {
      const row = h.fixture(),
        bearer = token('admin');
      h.users.admin.status = status;
      await request(app.getHttpServer())
        .patch(base + '/' + row.id + '/reversal')
        .set('Authorization', `Bearer ${bearer}`)
        .send({ reason: 'Reason' })
        .expect(401);
    });
    it('rejects role demotion with the same existing JWT', async () => {
      const row = h.fixture(),
        bearer = token('admin');
      h.users.admin.systemRole = SystemRole.USER;
      await request(app.getHttpServer())
        .patch(base + '/' + row.id + '/reversal')
        .set('Authorization', `Bearer ${bearer}`)
        .send({ reason: 'Reason' })
        .expect(403);
    });
    it.each([
      {},
      { reason: null },
      { reason: '' },
      { reason: ' \t ' },
      { reason: 'x\0x' },
      { reason: 7 },
      { reason: [] },
      { reason: {} },
      { reason: '😀'.repeat(1001) },
    ])(
      'rejects invalid reason body %# even on repeated reversal',
      async (data) => {
        const row = h.fixture({ status: WarningStatus.REVERSED });
        await reverse(row.id, data).expect(400);
        expect(h.state().audits).toHaveLength(0);
      },
    );
    it.each([
      'id',
      'userId',
      'status',
      'effectiveWeight',
      'expiresAt',
      'reportId',
      'createdById',
      'reversedById',
      'reversedAt',
      'reversalReason',
    ])('rejects extra field %s', async (field) => {
      const row = h.fixture();
      await reverse(row.id, {
        reason: 'Valid reason',
        [field]: 'forged',
      }).expect(400);
      expect(h.state().warnings[0].status).toBe('ACTIVE');
    });
    it('accepts a 1000-character Unicode reason as plain text', async () => {
      const row = h.fixture(),
        reason = '😀'.repeat(1000);
      const result = await reverse(row.id, {
        reason: '  ' + reason + '  ',
      }).expect(200);
      expect((result.body as { reversalReason: string }).reversalReason).toBe(
        reason,
      );
    });
    it('returns safe unknown resource and invalid route errors', async () => {
      const response = await reverse('missing').expect(404);
      expect(response.body).toMatchObject({ code: 'WARNING_NOT_FOUND' });
      await reverse('x'.repeat(129)).expect(400);
    });
    it('does not release the report after reversal', async () => {
      const result = await post({
        ...body(),
        reportId: 'resolved-report',
      }).expect(201);
      await reverse((result.body as { id: string }).id).expect(200);
      const duplicate = await post({
        ...body(),
        reportId: 'resolved-report',
      }).expect(409);
      expect(duplicate.body).toMatchObject({
        code: 'WARNING_REPORT_ALREADY_USED',
      });
    });
    it('rolls back the reversal when its audit fails', async () => {
      const row = h.fixture();
      h.control.auditFails = true;
      const response = await reverse(row.id).expect(500);
      expect(response.body).toMatchObject({ code: 'INTERNAL_SERVER_ERROR' });
      expect(h.state().warnings[0].status).toBe('ACTIVE');
      expect(h.state().audits).toHaveLength(0);
    });
    it.each([false, true])(
      'returns safe bounded-retry conflict (adapter=%s)',
      async (adapter) => {
        const row = h.fixture();
        h.control.aborts = 3;
        h.control.adapterAborts = adapter;
        const response = await reverse(row.id).expect(409);
        expect(response.body).toMatchObject({ code: 'WARNING_CONFLICT' });
        expect(h.state().warnings[0].status).toBe('ACTIVE');
        expect(h.state().audits).toHaveLength(0);
      },
    );
    it('correlates audit and response without logging the reason or credentials', async () => {
      const row = h.fixture(),
        bearer = token('admin');
      await request(app.getHttpServer())
        .patch(base + '/' + row.id + '/reversal')
        .set('Authorization', `Bearer ${bearer}`)
        .set('x-request-id', 'reverse-http-001')
        .send({ reason: 'Private reversal reason' })
        .expect(200)
        .expect('x-request-id', 'reverse-http-001');
      expect(h.state().audits[0].requestId).toBe('reverse-http-001');
      const output = JSON.stringify({
        audits: h.state().audits,
        logs: { info: logs.info.mock.calls, error: logs.error.mock.calls },
      });
      expect(output).not.toContain('Private reversal reason');
      expect(output).not.toContain(bearer);
    });
  });

  it.each(['admin', 'dev'])(
    'creates as %s and serializes Decimal weights with server-owned actor and dates',
    async (actor) => {
      const result = await post(body(), actor).expect(201);
      expect(result.body).toMatchObject({
        userId: 'target',
        createdById: actor,
        severity: 'MODERATE',
        reason: 'Private disciplinary reason',
        reportId: null,
        status: 'ACTIVE',
        baseWeight: '3',
        recurrenceMultiplier: '1',
        effectiveWeight: '3',
        occurrenceNumber: 1,
      });
      const detail = result.body as {
        id: string;
        createdAt: string;
        expiresAt: string;
      };
      expect(
        new Date(detail.expiresAt).getTime() -
          new Date(detail.createdAt).getTime(),
      ).toBe(180 * 86_400_000);
      expect(h.state().audits[0].entityId).toBe(detail.id);
      await get(base + '/' + detail.id, actor).expect(200);
      const list = await get(base + '?userId=target', actor).expect(200);
      const items = (list.body as { items: Record<string, unknown>[] }).items;
      expect(items).toHaveLength(1);
      for (const hidden of [
        'reason',
        'reportId',
        'createdById',
        'reversalReason',
        'user',
        'report',
      ])
        expect(items[0]).not.toHaveProperty(hidden);
      const summary = await get(
        '/admin/users/target/warnings/summary',
        actor,
      ).expect(200);
      expect(summary.body).toMatchObject({
        userId: 'target',
        activeCount: 1,
        totalActiveWeight: '3',
        categories: [
          {
            category: { id: 'respect', code: 'RESPECT' },
            activeCount: 1,
            totalActiveWeight: '3',
          },
        ],
      });
      expect(h.state().audits).toHaveLength(1);
    },
  );
  it.each(['user', 'master', 'club-admin'])(
    'forbids %s on creation and every read route',
    async (actor) => {
      const row = h.fixture();
      await post(body(), actor).expect(403);
      for (const url of [
        base,
        base + '/' + row.id,
        '/admin/users/target/warnings/summary',
      ])
        await get(url, actor).expect(403);
      expect(h.state().audits).toHaveLength(0);
    },
  );
  it('requires JWT on all endpoints and ignores x-user-id', async () => {
    for (const url of [
      base,
      base + '/unknown',
      '/admin/users/target/warnings/summary',
    ])
      await request(app.getHttpServer())
        .get(url)
        .set('x-user-id', 'admin')
        .expect(401);
    await request(app.getHttpServer())
      .post(base)
      .set('x-user-id', 'admin')
      .send(body())
      .expect(401);
  });
  it.each([
    AccountStatus.PENDING,
    AccountStatus.REJECTED,
    AccountStatus.SUSPENDED,
    AccountStatus.DELETION_PENDING,
    AccountStatus.ANONYMIZED,
  ])('rejects stale operator token after status %s', async (status) => {
    const bearer = token('admin');
    h.users.admin.status = status;
    await request(app.getHttpServer())
      .post(base)
      .set('Authorization', `Bearer ${bearer}`)
      .send(body())
      .expect(401);
  });
  it('rejects logout-invalidated token and a demoted administrator', async () => {
    const bearer = token('admin');
    h.users.admin.authVersion++;
    await request(app.getHttpServer())
      .post(base)
      .set('Authorization', `Bearer ${bearer}`)
      .send(body())
      .expect(401);
    h.users.admin.systemRole = SystemRole.USER;
    await post().expect(403);
  });
  it.each([
    { userId: null },
    { userId: '' },
    { userId: ' \t ' },
    { userId: 'a'.repeat(129) },
    { userId: 'target\0' },
    { categoryId: null },
    { categoryId: [] },
    { categoryId: ' ' },
    { severity: null },
    { severity: 'UNKNOWN' },
    { severity: ['LIGHT'] },
    { reason: null },
    { reason: '' },
    { reason: '  \t\n' },
    { reason: 7 },
    { reason: { text: 'reason' } },
    { reason: 'x\0x' },
    { reason: '😀'.repeat(1001) },
    { reportId: null },
    { reportId: '' },
    { reportId: ' \t ' },
    { reportId: 'x\0x' },
    { reportId: 'x'.repeat(129) },
    { reportId: 7 },
    { reportId: [] },
  ])('rejects invalid creation fields %j', async (extra) => {
    await post({ ...body(), ...extra }).expect(400);
    expect(h.state().warnings).toHaveLength(0);
    expect(h.state().audits).toHaveLength(0);
  });
  it.each(['userId', 'categoryId', 'severity', 'reason'])(
    'requires %s',
    async (key) => {
      const data: Record<string, unknown> = body();
      delete data[key];
      await post(data).expect(400);
    },
  );
  it.each([
    'id',
    'status',
    'baseWeight',
    'effectiveWeight',
    'recurrenceMultiplier',
    'occurrenceNumber',
    'createdById',
    'createdAt',
    'expiresAt',
    'reversedById',
    'reversedAt',
    'reversalReason',
    'requestId',
  ])('rejects client-controlled field %s', async (key) => {
    await post({ ...body(), [key]: 'forged' }).expect(400);
    expect(h.state().audits).toHaveLength(0);
  });
  it('accepts 1000 Unicode characters and trims the reason as plain text', async () => {
    const reason = '😀'.repeat(1000);
    const response = await post({
      ...body(),
      reason: '  ' + reason + '  ',
    }).expect(201);
    expect((response.body as { reason: string }).reason).toBe(reason);
  });
  it('requires an explanation for OTHER as for all categories, without defaulting severity', async () => {
    await post({ ...body(), categoryId: 'other', reason: ' ' }).expect(400);
    await post({
      ...body(),
      categoryId: 'other',
      reason: 'Explicit explanation',
    }).expect(201);
    await post({
      userId: 'target',
      categoryId: 'other',
      reason: 'Explanation',
    }).expect(400);
  });
  it.each(['admin', 'dev'])(
    'links a resolved USER report as %s with explicit reason and minimal audit',
    async (actor) => {
      const before = structuredClone(h.reports);
      const result = await post(
        { ...body(), reportId: 'resolved-report' },
        actor,
      ).expect(201);
      expect(result.body).toMatchObject({
        reportId: 'resolved-report',
        reason: 'Private disciplinary reason',
        effectiveWeight: '3',
      });
      expect(h.state().audits[0].metadata).toEqual({
        changed: true,
        hasReport: true,
      });
      expect(h.reports).toEqual(before);
      const response: unknown = result.body;
      const serialized = JSON.stringify({
        response,
        audit: h.state().audits,
        logs: { info: logs.info.mock.calls, error: logs.error.mock.calls },
      });
      for (const privateText of [
        'Private report description',
        'Private reporter',
        'Private resolution note',
        'https://private.example.test/evidence',
      ])
        expect(serialized).not.toContain(privateText);
    },
  );
  it.each([
    ReportStatus.OPEN,
    ReportStatus.UNDER_REVIEW,
    ReportStatus.DISMISSED,
  ])('rejects unresolved/ineligible report %s', async (status) => {
    h.reports[0].status = status;
    const result = await post({
      ...body(),
      reportId: 'resolved-report',
    }).expect(409);
    expect(result.body).toMatchObject({ code: 'WARNING_REPORT_NOT_RESOLVED' });
    expect(h.state().warnings).toHaveLength(0);
    expect(h.state().audits).toHaveLength(0);
  });
  it('returns safe 404 for unknown report instead of creating a direct warning', async () => {
    const response = await post({ ...body(), reportId: 'missing' }).expect(404);
    expect(response.body).toMatchObject({ code: 'REPORT_NOT_FOUND' });
    expect(h.state().warnings).toHaveLength(0);
  });
  it.each([ReportTargetType.SESSION, ReportTargetType.USER])(
    'requires a non-null individual target for type %s',
    async (type) => {
      h.reports[0].targetType = type;
      h.reports[0].reportedUserId = null;
      const response = await post({
        ...body(),
        reportId: 'resolved-report',
      }).expect(409);
      expect(response.body).toMatchObject({
        code: 'WARNING_REPORT_TARGET_INVALID',
      });
    },
  );
  it.each([
    [{ userId: 'user' }, 'WARNING_REPORT_USER_MISMATCH'],
    [{ categoryId: 'other' }, 'WARNING_REPORT_CATEGORY_MISMATCH'],
  ] as const)('rejects report mismatch %j', async (extra, code) => {
    const response = await post({
      ...body(),
      reportId: 'resolved-report',
      ...extra,
    }).expect(409);
    expect(response.body).toMatchObject({ code });
    expect(h.state().audits).toHaveLength(0);
  });
  it('blocks a matching report when its category is inactive', async () => {
    h.categories[0].active = false;
    const response = await post({
      ...body(),
      reportId: 'resolved-report',
    }).expect(409);
    expect(response.body).toMatchObject({
      code: 'DISCIPLINARY_CATEGORY_INACTIVE',
    });
  });
  it.each([
    WarningStatus.ACTIVE,
    WarningStatus.EXPIRED,
    WarningStatus.REVERSED,
  ])(
    'prevents report reuse with historical warning state %s',
    async (status) => {
      h.fixture({ reportId: 'resolved-report', status });
      const response = await post({
        ...body(),
        reportId: 'resolved-report',
      }).expect(409);
      expect(response.body).toMatchObject({
        code: 'WARNING_REPORT_ALREADY_USED',
      });
      expect(h.state().warnings).toHaveLength(1);
      expect(h.state().audits).toHaveLength(0);
    },
  );
  it.each([undefined, null, ' '])(
    'requires explicit administrative reason with report (%s)',
    async (reason) => {
      await post({ ...body(), reportId: 'resolved-report', reason }).expect(
        400,
      );
      expect(h.state().warnings).toHaveLength(0);
    },
  );
  it.each(['user', 'master', 'club-admin'])(
    'denies %s report-based creation without reading the report',
    async (actor) => {
      await post({ ...body(), reportId: 'resolved-report' }, actor).expect(403);
      for (const tx of h.clients)
        expect(tx.report.findUnique).not.toHaveBeenCalled();
    },
  );
  it('rolls back report linkage after audit failure and allows a later valid request', async () => {
    h.control.auditFails = true;
    await post({ ...body(), reportId: 'resolved-report' }).expect(500);
    expect(h.state().warnings).toHaveLength(0);
    expect(h.state().audits).toHaveLength(0);
    h.control.auditFails = false;
    await post({ ...body(), reportId: 'resolved-report' }).expect(201);
    await post({ ...body(), reportId: 'resolved-report' }).expect(409);
    expect(h.state().audits).toHaveLength(1);
  });
  it('returns safe missing user/category/warning errors and inactive category conflict', async () => {
    for (const data of [
      { ...body(), userId: 'missing' },
      { ...body(), categoryId: 'missing' },
    ])
      await post(data).expect(404);
    await post({ ...body(), categoryId: 'inactive' }).expect(409);
    await get(base + '/unknown').expect(404);
    await get('/admin/users/unknown/warnings/summary').expect(404);
  });
  it.each([
    '?page=0',
    '?page=1.5',
    '?limit=51',
    '?page=9007199254740991&limit=50',
    '?userId=',
    '?categoryId=%20',
    '?userId=target&userId=admin',
    '?severity=unknown',
    '?status=unknown',
    '?reason=private',
    '?reportId=id',
    '?where[userId]=admin',
  ])('rejects invalid query %s', async (query) => {
    await get(base + query).expect(400);
  });
  it('validates warning and summary route IDs', async () => {
    await get(base + '/' + 'x'.repeat(129)).expect(400);
    await get('/admin/users/' + 'x'.repeat(129) + '/warnings/summary').expect(
      400,
    );
  });
  it('filters/paginates effective state without exposing detail reasons or writing expiry', async () => {
    const now = Date.now();
    const expired = h.fixture({ expiresAt: new Date(now - 1) });
    h.fixture({ status: WarningStatus.REVERSED });
    h.fixture();
    const snapshot = JSON.stringify(h.state());
    const result = await get(
      base + '?userId=target&status=EXPIRED&limit=1',
    ).expect(200);
    expect(result.body).toMatchObject({
      items: [{ id: expired.id, status: 'EXPIRED' }],
      meta: { total: 1, pages: 1 },
    });
    await get(base + '?status=EXPIRED&page=2&limit=1')
      .expect(200)
      .expect(({ body: response }: { body: { items: object[] } }) => {
        expect(response.items).toEqual([]);
      });
    expect(JSON.stringify(h.state())).toBe(snapshot);
  });
  it('correlates response and audit with a safe Request ID without logging reason or credentials', async () => {
    const bearer = token('admin');
    await request(app.getHttpServer())
      .post(base)
      .set('Authorization', `Bearer ${bearer}`)
      .set('Cookie', 'secret-cookie')
      .set('x-request-id', 'warning-create-001')
      .send(body())
      .expect(201)
      .expect('x-request-id', 'warning-create-001');
    expect(h.state().audits[0].requestId).toBe('warning-create-001');
    expect(h.state().audits[0].metadata).toEqual({
      changed: true,
      hasReport: false,
    });
    const output = JSON.stringify({
      info: logs.info.mock.calls,
      warn: logs.warn.mock.calls,
      error: logs.error.mock.calls,
    });
    for (const secret of [
      bearer,
      'secret-cookie',
      'Private disciplinary reason',
    ])
      expect(output).not.toContain(secret);
  });
  it('rolls back a mutation on audit failure with a generic HTTP error', async () => {
    h.control.auditFails = true;
    const response = await post().expect(500);
    expect(response.body).toMatchObject({
      statusCode: 500,
      code: 'INTERNAL_SERVER_ERROR',
    });
    expect(h.state().warnings).toHaveLength(0);
    expect(h.state().audits).toHaveLength(0);
    expect(JSON.stringify(response.body)).not.toContain('Synthetic audit');
  });
  it.each([false, true])(
    'returns a generic conflict after three serialization failures (adapter=%s)',
    async (adapter) => {
      h.control.aborts = 3;
      h.control.adapterAborts = adapter;
      const response = await post().expect(409);
      expect(response.body).toMatchObject({ code: 'WARNING_CONFLICT' });
      expect(JSON.stringify(response.body)).not.toContain('private SQL');
      expect(h.state().warnings).toHaveLength(0);
      expect(h.state().audits).toHaveLength(0);
    },
  );
});
