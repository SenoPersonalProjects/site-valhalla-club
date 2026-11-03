import { warningsHarness } from '../../test/support/warnings.harness';
import { AuditService } from '../audit/audit.service';
import { AuthorizationService } from '../authorization/authorization.service';
import { WarningStatus } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { StructuredLoggerService } from '../observability/structured-logger.service';
import { WarningExpirationService } from './warning-expiration.service';
import {
  WARNING_EXPIRATION_BATCH_SIZE,
  WARNING_EXPIRATION_MAX_BATCHES,
  WARNING_EXPIRATION_TRANSACTION_TIMEOUT_MS,
} from './warning-expiration.constants';

const instant = () => new Date('2026-11-03T12:00:00.000Z');
function harness() {
  const h = warningsHarness(),
    prisma = h.root as unknown as PrismaService;
  const audit = new AuditService(prisma, new AuthorizationService(prisma));
  const logger = { info: jest.fn(), error: jest.fn() };
  const service = new WarningExpirationService(
    prisma,
    audit,
    logger as unknown as StructuredLoggerService,
  );
  return { ...h, audit, logger, expiration: service };
}

describe('Warning expiration reconciliation', () => {
  it('expires only ACTIVE at/before the reference, selecting IDs and preserving all history', async () => {
    const h = harness();
    const before = h.fixture({
      expiresAt: new Date(instant().getTime() - 1),
      reportId: 'resolved-report',
    });
    const boundary = h.fixture({ expiresAt: instant() });
    const future = h.fixture({ expiresAt: new Date(instant().getTime() + 1) });
    const expired = h.fixture({
      expiresAt: instant(),
      status: WarningStatus.EXPIRED,
    });
    const reversed = h.fixture({
      expiresAt: instant(),
      status: WarningStatus.REVERSED,
      reversedById: 'dev',
      reversedAt: instant(),
      reversalReason: 'Private reversal',
    });
    expect(await h.expiration.reconcile(instant())).toEqual({
      count: 2,
      batches: 1,
      batchLimitReached: false,
    });
    for (const row of [before, boundary]) {
      const saved = h.state().warnings.find((item) => item.id === row.id)!;
      for (const field of [
        'id',
        'userId',
        'categoryId',
        'reportId',
        'severity',
        'baseWeight',
        'recurrenceMultiplier',
        'effectiveWeight',
        'occurrenceNumber',
        'reason',
        'expiresAt',
        'createdAt',
        'createdById',
        'reversedById',
        'reversedAt',
        'reversalReason',
      ] as const)
        expect(saved[field]).toEqual(row[field]);
      expect(saved.status).toBe('EXPIRED');
    }
    for (const row of [future, expired, reversed])
      expect(h.state().warnings.find((item) => item.id === row.id)).toEqual(
        row,
      );
    const tx = h.clients[0];
    expect(tx.warning.findMany.mock.calls[0][0]).toEqual({
      where: { status: 'ACTIVE', expiresAt: { lte: instant() } },
      select: { id: true },
      take: WARNING_EXPIRATION_BATCH_SIZE,
      orderBy: [{ expiresAt: 'asc' }, { id: 'asc' }],
    });
    expect(tx.warning.updateMany.mock.calls[0][0].data).toEqual({
      status: 'EXPIRED',
    });
    expect(tx.user.findUnique).not.toHaveBeenCalled();
    expect(h.outside).not.toHaveBeenCalled();
    expect(h.transaction.mock.calls[0][1]).toEqual({
      isolationLevel: 'ReadCommitted',
      timeout: WARNING_EXPIRATION_TRANSACTION_TIMEOUT_MS,
    });
    expect(h.state().audits).toEqual(
      [before, boundary].map((row) => ({
        actorId: null,
        requestId: null,
        action: 'WARNING_EXPIRED',
        entityType: 'WARNING',
        entityId: row.id,
        metadata: { changed: true, fromStatus: 'ACTIVE', toStatus: 'EXPIRED' },
      })),
    );
  });
  it('is idempotent and never audits a second expiration', async () => {
    const h = harness();
    h.fixture({ expiresAt: instant() });
    await h.expiration.reconcile(instant());
    const snapshot = JSON.stringify(h.state());
    expect(await h.expiration.reconcile(instant())).toEqual({
      count: 0,
      batches: 1,
      batchLimitReached: false,
    });
    expect(JSON.stringify(h.state())).toBe(snapshot);
    expect(h.state().audits).toHaveLength(1);
  });
  it('bounds work per run and leaves remaining backlog for a later cycle', async () => {
    const h = harness(),
      maximum = WARNING_EXPIRATION_BATCH_SIZE * WARNING_EXPIRATION_MAX_BATCHES;
    for (let i = 0; i < maximum + 1; i++) h.fixture({ expiresAt: instant() });
    expect(await h.expiration.reconcile(instant())).toEqual({
      count: maximum,
      batches: WARNING_EXPIRATION_MAX_BATCHES,
      batchLimitReached: true,
    });
    expect(
      h.state().warnings.filter((row) => row.status === 'ACTIVE'),
    ).toHaveLength(1);
    expect(h.state().audits).toHaveLength(maximum);
    expect(await h.expiration.reconcile(instant())).toEqual({
      count: 1,
      batches: 1,
      batchLimitReached: false,
    });
    expect(h.state().audits).toHaveLength(maximum + 1);
  });
  it('performs one final empty read after an exactly full batch', async () => {
    const h = harness();
    for (let i = 0; i < WARNING_EXPIRATION_BATCH_SIZE; i++)
      h.fixture({ expiresAt: instant() });
    expect(await h.expiration.reconcile(instant())).toEqual({
      count: WARNING_EXPIRATION_BATCH_SIZE,
      batches: 2,
      batchLimitReached: false,
    });
  });
  it('does not emit audit on a lost conditional write', async () => {
    const h = harness();
    h.fixture({ expiresAt: instant() });
    h.control.updateMiss = true;
    expect((await h.expiration.reconcile(instant())).count).toBe(0);
    expect(h.state().audits).toHaveLength(0);
  });
  it.each(['writeFails', 'auditFails', 'commitFails'] as const)(
    'rolls back every expiration in the current batch when %s',
    async (fault) => {
      const h = harness();
      h.fixture({ expiresAt: instant() });
      h.fixture({ expiresAt: instant() });
      const snapshot = JSON.stringify(h.state());
      h.control[fault] = true;
      await expect(h.expiration.reconcile(instant())).rejects.toThrow(
        'Synthetic',
      );
      expect(JSON.stringify(h.state())).toBe(snapshot);
      expect(h.transaction).toHaveBeenCalledTimes(1);
    },
  );
  it('preserves committed batches on a later failure and resumes remaining work', async () => {
    const h = harness();
    for (let i = 0; i < WARNING_EXPIRATION_BATCH_SIZE + 2; i++)
      h.fixture({ expiresAt: instant() });
    const original = h.audit.record.bind(h.audit) as AuditService['record'];
    let calls = 0;
    const spy = jest
      .spyOn(h.audit, 'record')
      .mockImplementation(async (tx, event) => {
        calls++;
        if (calls === WARNING_EXPIRATION_BATCH_SIZE + 1)
          throw Error('Synthetic later audit failure');
        await original(tx, event);
      });
    await expect(h.expiration.reconcile(instant())).rejects.toThrow(
      'Synthetic',
    );
    spy.mockRestore();
    expect(h.state().audits).toHaveLength(WARNING_EXPIRATION_BATCH_SIZE);
    expect(
      h.state().warnings.filter((row) => row.status === 'ACTIVE'),
    ).toHaveLength(2);
    expect((await h.expiration.reconcile(instant())).count).toBe(2);
    expect(h.state().audits).toHaveLength(WARNING_EXPIRATION_BATCH_SIZE + 2);
  });
  it.each([false, true])(
    'retries a whole aborted batch with no duplicate events (adapter=%s)',
    async (adapter) => {
      const h = harness();
      h.fixture({ expiresAt: instant() });
      h.control.aborts = 1;
      h.control.adapterAborts = adapter;
      expect((await h.expiration.reconcile(instant())).count).toBe(1);
      expect(h.transaction).toHaveBeenCalledTimes(2);
      expect(h.state().audits).toHaveLength(1);
    },
  );
  it.each([WarningStatus.REVERSED, WarningStatus.EXPIRED])(
    'reselects candidates after another worker sets %s during abort',
    async (status) => {
      const h = harness();
      h.fixture({ expiresAt: instant() });
      h.control.aborts = 1;
      h.control.afterAbort = () => {
        h.state().warnings[0].status = status;
      };
      expect((await h.expiration.reconcile(instant())).count).toBe(0);
      expect(h.state().audits).toHaveLength(0);
      expect(h.clients[1].warning.updateMany).not.toHaveBeenCalled();
    },
  );
  it.each([false, true])(
    'bounds conflict retries and keeps state intact (adapter=%s)',
    async (adapter) => {
      const h = harness();
      h.fixture({ expiresAt: instant() });
      h.control.aborts = 3;
      h.control.adapterAborts = adapter;
      await expect(h.expiration.reconcile(instant())).rejects.toThrow();
      expect(h.transaction).toHaveBeenCalledTimes(3);
      expect(h.state().audits).toHaveLength(0);
      expect(h.state().warnings[0].status).toBe('ACTIVE');
    },
  );
  it('uses one copied reference across batch awaits', async () => {
    const h = harness();
    for (let i = 0; i < WARNING_EXPIRATION_BATCH_SIZE + 1; i++)
      h.fixture({ expiresAt: instant() });
    const at = instant(),
      original = h.audit.record.bind(h.audit) as AuditService['record'];
    jest.spyOn(h.audit, 'record').mockImplementation(async (tx, event) => {
      at.setUTCFullYear(2040);
      await original(tx, event);
    });
    await h.expiration.reconcile(at);
    for (const tx of h.clients)
      expect(tx.warning.findMany.mock.calls[0][0].where.expiresAt?.lte).toEqual(
        instant(),
      );
  });
  it('rejects invalid reference time before opening any transaction', async () => {
    const h = harness();
    await expect(h.expiration.reconcile(new Date(NaN))).rejects.toMatchObject({
      status: 400,
    });
    expect(h.transaction).not.toHaveBeenCalled();
  });
  it('runs on bootstrap and logs aggregate counters without sensitive fields', async () => {
    const h = harness();
    h.fixture({ expiresAt: new Date(0) });
    await h.expiration.onApplicationBootstrap();
    expect(h.logger.info).toHaveBeenCalledWith(
      'warnings_expiration_reconciled',
      { count: 1, batches: 1, batchLimitReached: false },
    );
    expect(h.logger.error).not.toHaveBeenCalled();
    const output = JSON.stringify(h.logger.info.mock.calls);
    for (const secret of [
      'warning-0',
      'Private administrative reason',
      'target',
      'resolved-report',
    ])
      expect(output).not.toContain(secret);
  });
  it('logs only a generic failure and resets the running flag for the next cycle', async () => {
    const h = harness();
    h.fixture({ expiresAt: new Date(0) });
    h.control.mutationError = new Error('private SQL database password');
    await h.expiration.run();
    expect(h.logger.error).toHaveBeenCalledWith(
      'warnings_expiration_reconciliation_failed',
    );
    expect(h.logger.info).not.toHaveBeenCalled();
    expect(JSON.stringify(h.logger.error.mock.calls)).not.toContain(
      'private SQL',
    );
    h.control.mutationError = undefined;
    await h.expiration.run();
    expect(h.state().audits).toHaveLength(1);
    expect(h.logger.info).toHaveBeenCalledTimes(1);
  });
  it('skips overlapping scheduled runs within an instance without blocking future cycles', async () => {
    const h = harness();
    type Result = Awaited<ReturnType<WarningExpirationService['reconcile']>>;
    let resolve!: (value: Result) => void;
    const pending = new Promise<Result>((done) => {
      resolve = done;
    });
    const spy = jest.spyOn(h.expiration, 'reconcile').mockReturnValue(pending);
    const first = h.expiration.run();
    await h.expiration.run();
    expect(spy).toHaveBeenCalledTimes(1);
    resolve({ count: 0, batches: 1, batchLimitReached: false });
    await first;
    await h.expiration.run();
    expect(spy).toHaveBeenCalledTimes(2);
  });
});
