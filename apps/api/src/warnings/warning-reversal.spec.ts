import { warningsHarness } from '../../test/support/warnings.harness';
import {
  AccountStatus,
  ReportStatus,
  SystemRole,
  WarningStatus,
} from '../generated/prisma/enums';
import { Prisma } from '../generated/prisma/client';

const immutable = [
  'id',
  'userId',
  'categoryId',
  'category',
  'reportId',
  'severity',
  'baseWeight',
  'recurrenceMultiplier',
  'effectiveWeight',
  'occurrenceNumber',
  'reason',
  'createdById',
  'createdAt',
  'expiresAt',
] as const;

describe('Administrative warning reversal', () => {
  it.each([
    ['admin', WarningStatus.ACTIVE],
    ['dev', WarningStatus.ACTIVE],
    ['admin', WarningStatus.EXPIRED],
    ['dev', WarningStatus.EXPIRED],
  ] as const)(
    'reverses as %s from %s preserving the original decision and weights',
    async (actor, status) => {
      const h = warningsHarness();
      const original = h.fixture({ status, reportId: 'resolved-report' });
      const beforeUsers = structuredClone(h.users),
        beforeReports = structuredClone(h.reports);
      const result = await h.service.reverse(
        actor,
        original.id,
        '  Explicit reversal reason  ',
        'warning-reversal-001',
      );
      expect(result.status).toBe('REVERSED');
      expect(result.reversedById).toBe(actor);
      expect(result.reversalReason).toBe('Explicit reversal reason');
      expect(result.reversedAt).toBeInstanceOf(Date);
      for (const field of immutable)
        expect(result[field]).toEqual(original[field]);
      expect(h.users).toEqual(beforeUsers);
      expect(h.reports).toEqual(beforeReports);
      expect(h.state().audits).toEqual([
        {
          actorId: actor,
          requestId: 'warning-reversal-001',
          action: 'WARNING_REVERSED',
          entityType: 'WARNING',
          entityId: original.id,
          metadata: { changed: true, fromStatus: status, toStatus: 'REVERSED' },
        },
      ]);
      expect(h.clients[0].warning.updateMany.mock.calls[0][0]).toEqual({
        where: { id: original.id, status },
        data: {
          status: 'REVERSED',
          reversedById: actor,
          reversedAt: result.reversedAt,
          reversalReason: 'Explicit reversal reason',
        },
      });
      expect(h.transaction.mock.calls[0][1]).toEqual({
        isolationLevel: 'Serializable',
      });
      expect(h.outside).not.toHaveBeenCalled();
    },
  );
  it('uses effective EXPIRED for overdue ACTIVE at the exact boundary', async () => {
    jest.useFakeTimers({ now: new Date('2026-11-03T12:00:00Z') });
    try {
      const h = warningsHarness(),
        original = h.fixture({ expiresAt: new Date() });
      await h.service.reverse('admin', original.id, 'Historical reversal');
      expect(h.state().audits[0].metadata).toEqual({
        changed: true,
        fromStatus: 'EXPIRED',
        toStatus: 'REVERSED',
      });
      expect(
        h.clients[0].warning.updateMany.mock.calls[0][0].where.status,
      ).toBe('ACTIVE');
    } finally {
      jest.useRealTimers();
    }
  });
  it('preserves the first reversal and updatedAt on a valid repeated request by another administrator', async () => {
    const h = warningsHarness(),
      original = h.fixture();
    const first = await h.service.reverse(
      'admin',
      original.id,
      'First decision',
    );
    const before = JSON.stringify(h.state().warnings);
    const repeated = await h.service.reverse(
      'dev',
      original.id,
      'Another valid reason',
      'repeat-001',
    );
    expect(repeated).toEqual(first);
    expect(JSON.stringify(h.state().warnings)).toBe(before);
    expect(h.clients[1].warning.updateMany).not.toHaveBeenCalled();
    expect(h.state().audits[1]).toMatchObject({
      actorId: 'dev',
      requestId: 'repeat-001',
      metadata: {
        changed: false,
        fromStatus: 'REVERSED',
        toStatus: 'REVERSED',
      },
    });
  });
  it.each(['', ' \t ', 'x\0x', '😀'.repeat(1001)])(
    'requires a valid reason even when already reversed (%#)',
    async (reason) => {
      const h = warningsHarness(),
        original = h.fixture({ status: WarningStatus.REVERSED });
      await expect(
        h.service.reverse('admin', original.id, reason),
      ).rejects.toMatchObject({ status: 400 });
      expect(h.state().audits).toHaveLength(0);
      expect(h.clients[0].warning.updateMany).not.toHaveBeenCalled();
    },
  );
  it.each(['user', 'master', 'club-admin'])(
    'denies %s before reading the warning',
    async (actor) => {
      const h = warningsHarness(),
        row = h.fixture();
      await expect(
        h.service.reverse(actor, row.id, 'Reason'),
      ).rejects.toMatchObject({ status: 403 });
      expect(h.clients[0].warning.findUnique).not.toHaveBeenCalled();
      expect(h.state().audits).toHaveLength(0);
    },
  );
  it.each([
    AccountStatus.PENDING,
    AccountStatus.REJECTED,
    AccountStatus.SUSPENDED,
    AccountStatus.DELETION_PENDING,
    AccountStatus.ANONYMIZED,
  ])(
    'rejects non-approved operator %s inside the transaction',
    async (status) => {
      const h = warningsHarness();
      h.users.admin.status = status;
      await expect(
        h.service.reverse('admin', 'missing', 'Reason'),
      ).rejects.toMatchObject({ status: 403 });
      expect(h.clients[0].warning.findUnique).not.toHaveBeenCalled();
    },
  );
  it('returns safe missing warning and invalid ID errors', async () => {
    const h = warningsHarness();
    await expect(
      h.service.reverse('admin', 'missing', 'Reason'),
    ).rejects.toMatchObject({
      status: 404,
      response: { code: 'WARNING_NOT_FOUND' },
    });
    await expect(
      h.service.reverse('admin', ' ', 'Reason'),
    ).rejects.toMatchObject({ status: 400 });
    expect(h.state().audits).toHaveLength(0);
  });
  it.each(['writeFails', 'auditFails', 'commitFails'] as const)(
    'rolls back reversal and audit when %s',
    async (fault) => {
      const h = warningsHarness(),
        row = h.fixture();
      const before = JSON.stringify(h.state());
      h.control[fault] = true;
      await expect(
        h.service.reverse('admin', row.id, 'Reason'),
      ).rejects.toThrow('Synthetic');
      expect(JSON.stringify(h.state())).toBe(before);
      expect(h.transaction).toHaveBeenCalledTimes(1);
    },
  );
  it('fails an audit-only repetition atomically without changing the original reversal', async () => {
    const h = warningsHarness(),
      row = h.fixture({
        status: WarningStatus.REVERSED,
        reversedById: 'dev',
        reversedAt: new Date(),
        reversalReason: 'Original',
      });
    const before = JSON.stringify(h.state());
    h.control.auditFails = true;
    await expect(
      h.service.reverse('admin', row.id, 'Repeat reason'),
    ).rejects.toThrow('Synthetic audit');
    expect(JSON.stringify(h.state())).toBe(before);
  });
  it('fails closed on a missed conditional update without auditing success', async () => {
    const h = warningsHarness(),
      row = h.fixture();
    h.control.updateMiss = true;
    await expect(
      h.service.reverse('admin', row.id, 'Reason'),
    ).rejects.toMatchObject({
      status: 409,
      response: { code: 'WARNING_CONFLICT' },
    });
    expect(h.state().warnings[0].status).toBe('ACTIVE');
    expect(h.state().audits).toHaveLength(0);
  });
  it.each([false, true])(
    'retries the whole reversal without retaining aborted audit (adapter=%s)',
    async (adapter) => {
      const h = warningsHarness(),
        row = h.fixture();
      h.control.aborts = 1;
      h.control.adapterAborts = adapter;
      const result = await h.service.reverse('admin', row.id, 'Reason');
      expect(result.status).toBe('REVERSED');
      expect(h.transaction).toHaveBeenCalledTimes(2);
      expect(h.state().audits).toHaveLength(1);
      for (const tx of h.clients)
        expect(tx.user.findUnique.mock.calls[0][0].where.id).toBe('admin');
    },
  );
  it.each(['role', 'status'] as const)(
    'rechecks operator %s after abort',
    async (changed) => {
      const h = warningsHarness(),
        row = h.fixture();
      h.control.aborts = 1;
      h.control.afterAbort = () => {
        if (changed === 'role') h.users.admin.systemRole = SystemRole.USER;
        else h.users.admin.status = AccountStatus.SUSPENDED;
      };
      await expect(
        h.service.reverse('admin', row.id, 'Reason'),
      ).rejects.toMatchObject({ status: 403 });
      expect(h.state().warnings[0].status).toBe('ACTIVE');
      expect(h.state().audits).toHaveLength(0);
      expect(h.clients[1].warning.findUnique).not.toHaveBeenCalled();
    },
  );
  it('preserves a concurrent winning reversal after retry', async () => {
    const h = warningsHarness(),
      row = h.fixture();
    const wonAt = new Date('2026-11-03T10:00:00Z');
    h.control.aborts = 1;
    h.control.afterAbort = () => {
      Object.assign(h.state().warnings[0], {
        status: WarningStatus.REVERSED,
        reversedById: 'dev',
        reversedAt: wonAt,
        reversalReason: 'Winning reason',
        updatedAt: wonAt,
      });
    };
    const result = await h.service.reverse('admin', row.id, 'Losing reason');
    expect(result).toMatchObject({
      reversedById: 'dev',
      reversedAt: wonAt,
      reversalReason: 'Winning reason',
    });
    expect(h.clients[1].warning.updateMany).not.toHaveBeenCalled();
    expect(h.state().audits).toHaveLength(1);
    expect(h.state().audits[0].metadata).toEqual({
      changed: false,
      fromStatus: 'REVERSED',
      toStatus: 'REVERSED',
    });
  });
  it.each([false, true])(
    'bounds retries with a safe conflict and no partial state (adapter=%s)',
    async (adapter) => {
      const h = warningsHarness(),
        row = h.fixture();
      h.control.aborts = 3;
      h.control.adapterAborts = adapter;
      await expect(
        h.service.reverse('admin', row.id, 'Reason'),
      ).rejects.toMatchObject({
        status: 409,
        response: { code: 'WARNING_CONFLICT' },
      });
      expect(h.transaction).toHaveBeenCalledTimes(3);
      expect(h.state().warnings[0].status).toBe('ACTIVE');
      expect(h.state().audits).toHaveLength(0);
    },
  );
  it('reverses historical decisions despite inactive category or changed report, preserving report uniqueness', async () => {
    const h = warningsHarness(),
      row = h.fixture({ reportId: 'resolved-report' });
    h.categories[0].active = false;
    h.reports[0].status = ReportStatus.DISMISSED;
    await h.service.reverse('admin', row.id, 'Historical correction');
    expect(h.clients[0].report.findUnique).not.toHaveBeenCalled();
    expect(h.clients[0].disciplinaryCategory.findUnique).not.toHaveBeenCalled();
    h.categories[0].active = true;
    h.reports[0].status = ReportStatus.RESOLVED;
    await expect(
      h.service.create('admin', {
        userId: 'target',
        categoryId: 'respect',
        reportId: 'resolved-report',
        severity: 'LIGHT',
        reason: 'New decision',
      }),
    ).rejects.toMatchObject({
      response: { code: 'WARNING_REPORT_ALREADY_USED' },
    });
  });
  it('removes only its active contribution and preserves later historical weights', async () => {
    const h = warningsHarness(),
      first = h.fixture();
    const second = h.fixture({
      occurrenceNumber: 2,
      recurrenceMultiplier: new Prisma.Decimal('1.5'),
      effectiveWeight: new Prisma.Decimal('4.5'),
    });
    expect(
      (await h.service.summary('admin', 'target')).totalActiveWeight.toString(),
    ).toBe('7.5');
    await h.service.reverse('admin', first.id, 'Reason');
    expect(
      (await h.service.summary('admin', 'target')).totalActiveWeight.toString(),
    ).toBe('4.5');
    expect(h.state().warnings.find((row) => row.id === second.id)).toEqual(
      second,
    );
  });
});
