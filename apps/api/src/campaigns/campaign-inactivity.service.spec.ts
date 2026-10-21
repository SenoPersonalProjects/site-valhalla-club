import { Prisma } from '../generated/prisma/client';
import { CampaignStatus, SessionStatus } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { StructuredLoggerService } from '../observability/structured-logger.service';
import { CampaignInactivityService } from './campaign-inactivity.service';
import {
  TableRulesService,
  TABLE_RULE_WINDOW_MS,
} from '../tables/table-rules.service';

describe('CampaignInactivityService', () => {
  const now = new Date('2026-10-20T12:00:00Z');
  const cutoff = new Date(now.getTime() - TABLE_RULE_WINDOW_MS);
  const old = new Date(cutoff.getTime() - 1);
  const updateMany = jest.fn();
  const rootUpdateMany = jest.fn(() => {
    throw new Error('root update forbidden');
  });
  const transaction = jest.fn();
  const tx = {
    campaign: { updateMany },
  } as unknown as Prisma.TransactionClient;
  const rules = new TableRulesService({
    campaign: { updateMany: rootUpdateMany },
    $transaction: transaction,
  } as unknown as PrismaService);
  const logger = { info: jest.fn(), error: jest.fn() };
  const service = new CampaignInactivityService(
    rules,
    logger as unknown as StructuredLoggerService,
  );
  beforeEach(() => {
    jest.clearAllMocks();
    transaction
      .mockReset()
      .mockImplementation(
        async (
          operation: (client: Prisma.TransactionClient) => Promise<unknown>,
        ) => operation(tx),
      );
    updateMany.mockReset();
  });

  it('uses a single typed updateMany with the status, baseline and session predicates', async () => {
    updateMany.mockResolvedValue({ count: 1 });
    await service.reconcile(now);
    expect(transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
    });
    expect(rootUpdateMany).not.toHaveBeenCalled();
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        status: CampaignStatus.ACTIVE,
        updatedAt: { lt: cutoff },
        sessions: {
          none: {
            status: { not: SessionStatus.CANCELLED },
            scheduledAt: { gte: cutoff },
          },
        },
      },
      data: { status: CampaignStatus.INACTIVE },
    });
  });

  it('reexecutes the inactivity predicate on a new transaction after P2034', async () => {
    const retriedUpdate = jest.fn().mockResolvedValue({ count: 0 });
    updateMany.mockResolvedValue({ count: 1 });
    transaction.mockImplementationOnce(
      async (
        operation: (client: Prisma.TransactionClient) => Promise<unknown>,
      ) => {
        await operation(tx);
        throw new Prisma.PrismaClientKnownRequestError('conflict', {
          code: 'P2034',
          clientVersion: '7.10.0',
        });
      },
    );
    transaction.mockImplementationOnce(
      async (
        operation: (client: Prisma.TransactionClient) => Promise<unknown>,
      ) =>
        operation({
          campaign: { updateMany: retriedUpdate },
        } as unknown as Prisma.TransactionClient),
    );
    expect(await service.reconcile(now)).toEqual({ count: 0 });
    expect(transaction).toHaveBeenCalledTimes(2);
    expect(updateMany).toHaveBeenCalledTimes(1);
    expect(retriedUpdate).toHaveBeenCalledWith(updateMany.mock.calls[0][0]);
    expect(rootUpdateMany).not.toHaveBeenCalled();
  });

  it.each([
    ['old without sessions', CampaignStatus.ACTIVE, old, [], 1],
    ['newly published', CampaignStatus.ACTIVE, now, [], 0],
    ['exactly 30 days', CampaignStatus.ACTIVE, cutoff, [], 0],
    [
      'recent session',
      CampaignStatus.ACTIVE,
      old,
      [{ status: SessionStatus.COMPLETED, scheduledAt: now }],
      0,
    ],
    [
      'session at cutoff',
      CampaignStatus.ACTIVE,
      old,
      [{ status: SessionStatus.SCHEDULED, scheduledAt: cutoff }],
      0,
    ],
    [
      'future session',
      CampaignStatus.ACTIVE,
      old,
      [
        {
          status: SessionStatus.SCHEDULED,
          scheduledAt: new Date(now.getTime() + 86_400_000),
        },
      ],
      0,
    ],
    [
      'old session',
      CampaignStatus.ACTIVE,
      old,
      [{ status: SessionStatus.COMPLETED, scheduledAt: old }],
      1,
    ],
    [
      'cancelled future session',
      CampaignStatus.ACTIVE,
      old,
      [
        {
          status: SessionStatus.CANCELLED,
          scheduledAt: new Date(now.getTime() + 86_400_000),
        },
      ],
      1,
    ],
    ['draft', CampaignStatus.DRAFT, old, [], 0],
    ['inactive', CampaignStatus.INACTIVE, old, [], 0],
    ['archived', CampaignStatus.ARCHIVED, old, [], 0],
  ] as const)(
    'reconciles %s idempotently',
    async (_name, initialStatus, updatedAt, sessions, expected) => {
      let status: string = initialStatus;
      // Evaluate the emitted query over a fixture; no real database is used here.
      updateMany.mockImplementation(
        ({ where, data }: Prisma.CampaignUpdateManyArgs) => {
          const condition = where!;
          const baseline = condition.updatedAt as Prisma.DateTimeFilter;
          const recent = condition.sessions!.none!;
          const sessionStatus = recent.status as Prisma.EnumSessionStatusFilter;
          const range = recent.scheduledAt as Prisma.DateTimeFilter;
          const matches =
            status === condition.status &&
            updatedAt < baseline.lt! &&
            !sessions.some(
              (s) =>
                s.status !== sessionStatus.not && s.scheduledAt >= range.gte!,
            );
          if (matches) status = data.status as string;
          return { count: matches ? 1 : 0 };
        },
      );
      expect(await service.reconcile(now)).toEqual({ count: expected });
      expect(await service.reconcile(now)).toEqual({ count: 0 });
      expect(status).toBe(expected ? CampaignStatus.INACTIVE : initialStatus);
    },
  );

  it('runs reconciliation on application startup', async () => {
    updateMany.mockResolvedValue({ count: 2 });
    await service.onApplicationBootstrap();
    expect(updateMany).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith('campaign_inactivity_reconciled', {
      count: 2,
    });
  });

  it('logs safely after exhausting Serializable retries and tries again on the next cycle', async () => {
    const error = new Prisma.PrismaClientKnownRequestError(
      'private connection details',
      { code: 'P2034', clientVersion: '7.10.0' },
    );
    transaction
      .mockRejectedValueOnce(error)
      .mockRejectedValueOnce(error)
      .mockRejectedValueOnce(error);
    await service.run();
    expect(transaction).toHaveBeenCalledTimes(3);
    expect(logger.error).toHaveBeenCalledWith(
      'campaign_inactivity_reconciliation_failed',
    );
    updateMany.mockResolvedValue({ count: 0 });
    await service.run();
    expect(transaction).toHaveBeenCalledTimes(4);
    expect(logger.info).toHaveBeenCalledWith('campaign_inactivity_reconciled', {
      count: 0,
    });
    expect(rootUpdateMany).not.toHaveBeenCalled();
  });

  it('does not overlap runs and recovers after a failed run without logging secrets', async () => {
    let reject!: (error: Error) => void;
    updateMany.mockImplementationOnce(
      () =>
        new Promise((_resolve, fail) => {
          reject = fail;
        }),
    );
    const pending = service.run();
    await service.run();
    expect(updateMany).toHaveBeenCalledTimes(1);
    reject(new Error('private connection details'));
    await pending;
    expect(logger.error).toHaveBeenCalledWith(
      'campaign_inactivity_reconciliation_failed',
    );
    updateMany.mockResolvedValue({ count: 0 });
    await service.run();
    expect(updateMany).toHaveBeenCalledTimes(2);
  });
});
