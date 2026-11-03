import { warningsHarness } from '../../test/support/warnings.harness';
import {
  AccountStatus,
  SystemRole,
  WarningSeverity,
  WarningStatus,
} from '../generated/prisma/enums';
import { Prisma } from '../generated/prisma/client';
import { CreateWarningDto, ListWarningsDto } from './warnings.dto';
import { warningDetailSelect, warningListSelect } from './warnings.select';

const input = (): CreateWarningDto => ({
  userId: 'target',
  categoryId: 'respect',
  severity: WarningSeverity.MODERATE,
  reason: '  Private administrative reason  ',
});

describe('Administrative warning creation and reads', () => {
  it.each(['admin', 'dev'])(
    'creates directly as %s with server calculation and atomic minimal audit',
    async (actor) => {
      const h = warningsHarness();
      const result = await h.service.create(
        actor,
        input(),
        'warning-create-001',
      );
      expect(result).toMatchObject({
        userId: 'target',
        categoryId: 'respect',
        createdById: actor,
        reason: 'Private administrative reason',
        status: 'ACTIVE',
        reportId: null,
        occurrenceNumber: 1,
      });
      expect(result.effectiveWeight.toString()).toBe('3');
      expect(result.expiresAt.getTime() - result.createdAt.getTime()).toBe(
        180 * 86_400_000,
      );
      expect(h.state().audits).toEqual([
        {
          actorId: actor,
          action: 'WARNING_CREATED',
          entityType: 'WARNING',
          entityId: result.id,
          requestId: 'warning-create-001',
          metadata: { changed: true, hasReport: false },
        },
      ]);
      expect(h.clients[0].warning.create.mock.calls[0][0].select).toEqual(
        warningDetailSelect,
      );
      expect(
        h.clients[0].warning.create.mock.calls[0][0].data,
      ).not.toHaveProperty('id');
      expect(h.transaction.mock.calls[0][1]).toEqual({
        isolationLevel: 'Serializable',
      });
      expect(h.outside).not.toHaveBeenCalled();
    },
  );
  it('calculates the next recurrence from the current active set', async () => {
    const h = warningsHarness();
    await h.service.create('admin', input());
    const second = await h.service.create('admin', input());
    expect(second.occurrenceNumber).toBe(2);
    expect(second.effectiveWeight.toString()).toBe('4.5');
    expect(h.state().audits[0].requestId).toBeNull();
  });
  it.each(['user', 'master', 'club-admin'])(
    'denies %s on every operation before reading discipline',
    async (actor) => {
      const h = warningsHarness();
      for (const call of [
        () => h.service.create(actor, input()),
        () => h.service.list(actor, new ListWarningsDto()),
        () => h.service.findOne(actor, 'id'),
        () => h.service.summary(actor, 'target'),
      ]) {
        await expect(call()).rejects.toMatchObject({ status: 403 });
        const tx = h.clients.at(-1)!;
        expect(tx.warning.count).not.toHaveBeenCalled();
        expect(tx.warning.findMany).not.toHaveBeenCalled();
        expect(tx.warning.findUnique).not.toHaveBeenCalled();
        expect(tx.warning.aggregate).not.toHaveBeenCalled();
      }
      expect(h.state().warnings).toHaveLength(0);
      expect(h.state().audits).toHaveLength(0);
    },
  );
  it.each([
    AccountStatus.PENDING,
    AccountStatus.REJECTED,
    AccountStatus.SUSPENDED,
    AccountStatus.DELETION_PENDING,
    AccountStatus.ANONYMIZED,
  ])('rechecks operator status %s inside the transaction', async (status) => {
    const h = warningsHarness();
    h.users.admin.status = status;
    await expect(h.service.create('admin', input())).rejects.toMatchObject({
      status: 403,
    });
    expect(h.state().warnings).toHaveLength(0);
  });
  it.each([
    [{ userId: 'missing' }, 404, 'USER_NOT_FOUND'],
    [{ categoryId: 'missing' }, 404, 'DISCIPLINARY_CATEGORY_NOT_FOUND'],
    [{ categoryId: 'inactive' }, 409, 'DISCIPLINARY_CATEGORY_INACTIVE'],
    [{ reason: ' \t ' }, 400, 'BAD_REQUEST'],
    [{ reason: 'x'.repeat(1001) }, 400, 'BAD_REQUEST'],
    [{ reason: 'x\0x' }, 400, 'BAD_REQUEST'],
    [{ userId: ' ' }, 400, 'BAD_REQUEST'],
    [{ categoryId: 'x'.repeat(129) }, 400, 'BAD_REQUEST'],
  ] as const)(
    'rejects invalid creation %j without partial writes',
    async (extra, status, code) => {
      const h = warningsHarness();
      await expect(
        h.service.create('admin', { ...input(), ...extra }),
      ).rejects.toMatchObject({ status, response: { code } });
      expect(h.state().warnings).toHaveLength(0);
      expect(h.state().audits).toHaveLength(0);
    },
  );
  it('allows an existing suspended recipient without changing their account or roles', async () => {
    const h = warningsHarness();
    h.users.target.status = AccountStatus.SUSPENDED;
    const before = structuredClone(h.users);
    await h.service.create('admin', input());
    expect(h.users).toEqual(before);
  });
  it.each(['auditFails', 'writeFails', 'commitFails'] as const)(
    'rolls back both records when %s',
    async (fault) => {
      const h = warningsHarness();
      h.control[fault] = true;
      await expect(h.service.create('admin', input())).rejects.toThrow(
        'Synthetic',
      );
      expect(h.state().warnings).toHaveLength(0);
      expect(h.state().audits).toHaveLength(0);
      expect(h.transaction).toHaveBeenCalledTimes(1);
    },
  );
  it.each([false, true])(
    'retries the full operation and recounts without aborted writes (adapter=%s)',
    async (adapter) => {
      const h = warningsHarness();
      h.control.aborts = 1;
      h.control.adapterAborts = adapter;
      h.control.afterAbort = () => {
        h.fixture();
      };
      const result = await h.service.create('admin', input());
      expect(result.occurrenceNumber).toBe(2);
      expect(result.effectiveWeight.toString()).toBe('4.5');
      expect(h.state().warnings).toHaveLength(2);
      expect(h.state().audits).toHaveLength(1);
      expect(h.transaction).toHaveBeenCalledTimes(2);
      for (const tx of h.clients) {
        expect(tx.user.findUnique.mock.calls[0][0].where.id).toBe('admin');
        expect(tx.warning.count).toHaveBeenCalledTimes(1);
      }
    },
  );
  it.each(['role', 'status', 'category'] as const)(
    'rechecks changed %s after serialization abort',
    async (changed) => {
      const h = warningsHarness();
      h.control.aborts = 1;
      h.control.afterAbort = () => {
        if (changed === 'role') h.users.admin.systemRole = SystemRole.USER;
        if (changed === 'status')
          h.users.admin.status = AccountStatus.SUSPENDED;
        if (changed === 'category') h.categories[0].active = false;
      };
      await expect(h.service.create('admin', input())).rejects.toMatchObject({
        status: changed === 'category' ? 409 : 403,
      });
      expect(h.state().warnings).toHaveLength(0);
      expect(h.state().audits).toHaveLength(0);
    },
  );
  it.each([false, true])(
    'bounds serialization retries and returns a safe conflict (adapter=%s)',
    async (adapter) => {
      const h = warningsHarness();
      h.control.aborts = 10;
      h.control.adapterAborts = adapter;
      await expect(h.service.create('admin', input())).rejects.toMatchObject({
        status: 409,
        response: { code: 'WARNING_CONFLICT' },
      });
      expect(h.transaction).toHaveBeenCalledTimes(3);
      expect(h.state().warnings).toHaveLength(0);
      expect(h.state().audits).toHaveLength(0);
    },
  );
  it('lists exact filters with identical item/count scope, deterministic pagination and minimal projection', async () => {
    const h = warningsHarness();
    h.fixture();
    h.fixture({ userId: 'user' });
    h.fixture({ status: WarningStatus.REVERSED });
    const query = Object.assign(new ListWarningsDto(), {
      userId: 'target',
      categoryId: 'respect',
      severity: WarningSeverity.MODERATE,
      status: WarningStatus.ACTIVE,
      limit: 1,
    });
    const result = await h.service.list('admin', query);
    expect(result.meta).toEqual({ page: 1, limit: 1, total: 1, pages: 1 });
    expect(result.items[0]).not.toHaveProperty('reason');
    expect(result.items[0]).not.toHaveProperty('reportId');
    const tx = h.clients[0];
    expect(tx.warning.findMany.mock.calls[0][0].where).toEqual(
      tx.warning.count.mock.calls[0][0].where,
    );
    expect(tx.warning.findMany.mock.calls[0][0].select).toEqual(
      warningListSelect,
    );
    expect(tx.warning.findMany.mock.calls[0][0].orderBy).toEqual([
      { createdAt: 'desc' },
      { id: 'desc' },
    ]);
    expect(h.transaction.mock.calls[0][1]).toEqual({
      isolationLevel: 'RepeatableRead',
    });
    expect(h.state().audits).toHaveLength(0);
  });
  it('treats overdue ACTIVE as EXPIRED in list, count, detail and summary without writing', async () => {
    jest.useFakeTimers({ now: new Date('2026-11-03T12:00:00Z') });
    try {
      const h = warningsHarness();
      const expired = h.fixture({ expiresAt: new Date() });
      h.fixture({ status: WarningStatus.REVERSED });
      h.fixture();
      const before = JSON.stringify(h.state());
      const result = await h.service.list(
        'admin',
        Object.assign(new ListWarningsDto(), { status: WarningStatus.EXPIRED }),
      );
      expect(result.items).toHaveLength(1);
      expect(result.meta.total).toBe(1);
      expect(result.items[0].status).toBe('EXPIRED');
      expect((await h.service.findOne('admin', expired.id)).status).toBe(
        'EXPIRED',
      );
      const summary = await h.service.summary('admin', 'target');
      expect(summary.activeCount).toBe(1);
      expect(summary.totalActiveWeight.toString()).toBe('3');
      expect(JSON.stringify(h.state())).toBe(before);
      const tx = h.clients.at(-1)!;
      expect(tx.warning.aggregate.mock.calls[0][0].where).toEqual(
        tx.warning.groupBy.mock.calls[0][0].where,
      );
      expect(tx.warning.aggregate.mock.calls[0][0].where.expiresAt?.gt).toEqual(
        summary.calculatedAt,
      );
    } finally {
      jest.useRealTimers();
    }
  });
  it('summarizes category totals including inactive categories with active historical warnings', async () => {
    const h = warningsHarness();
    h.fixture();
    h.fixture({ effectiveWeight: new Prisma.Decimal('4.5') });
    h.fixture({
      categoryId: 'other',
      category: { id: 'other', code: 'OTHER', label: 'Outros' },
      effectiveWeight: new Prisma.Decimal('1'),
    });
    h.fixture({ userId: 'user', effectiveWeight: new Prisma.Decimal('15') });
    h.categories[0].active = false;
    const summary = await h.service.summary('dev', 'target');
    expect(summary.activeCount).toBe(3);
    expect(summary.totalActiveWeight.toString()).toBe('8.5');
    expect(summary.categories).toHaveLength(2);
    expect(summary.categories.map((row) => row.category.code)).toEqual([
      'OTHER',
      'RESPECT',
    ]);
    expect(
      summary.categories.map((row) => row.totalActiveWeight.toString()),
    ).toEqual(['1', '7.5']);
    expect(summary.categories[1].category).toEqual({
      id: 'respect',
      code: 'RESPECT',
      label: 'Ofensas e desrespeito',
    });
  });
  it('returns a zero summary without exposing user fields or inventing categories', async () => {
    const h = warningsHarness();
    const summary = await h.service.summary('admin', 'target');
    expect(summary.activeCount).toBe(0);
    expect(summary.totalActiveWeight.toString()).toBe('0');
    expect(summary.categories).toEqual([]);
    expect(Object.keys(summary).sort()).toEqual([
      'activeCount',
      'calculatedAt',
      'categories',
      'totalActiveWeight',
      'userId',
    ]);
  });
  it('returns safe missing resource errors', async () => {
    const h = warningsHarness();
    await expect(h.service.findOne('admin', 'missing')).rejects.toMatchObject({
      status: 404,
      response: { code: 'WARNING_NOT_FOUND' },
    });
    await expect(h.service.summary('admin', 'missing')).rejects.toMatchObject({
      status: 404,
      response: { code: 'USER_NOT_FOUND' },
    });
  });
  it.each([
    { page: 0, limit: 20 },
    { page: 1.5, limit: 20 },
    { page: 1, limit: 51 },
    { page: Number.MAX_SAFE_INTEGER, limit: 50 },
  ])('rejects invalid service pagination %j', async (pagination) => {
    const h = warningsHarness();
    await expect(
      h.service.list('admin', Object.assign(new ListWarningsDto(), pagination)),
    ).rejects.toMatchObject({ status: 400 });
  });
});
