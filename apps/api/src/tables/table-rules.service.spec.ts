import { Prisma } from '../generated/prisma/client';
import { OneShotStatus } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { TableRulesService, TABLE_RULE_WINDOW_MS } from './table-rules.service';

describe('TableRulesService', () => {
  const transaction = jest.fn();
  const prisma = { $transaction: transaction } as unknown as PrismaService;
  const rules = new TableRulesService(prisma);
  const now = new Date('2026-10-20T12:00:00Z');
  beforeEach(() => jest.resetAllMocks());

  it.each([
    [
      '2026-11-01T02:59:59.999Z',
      '2026-10-01T03:00:00.000Z',
      '2026-11-01T03:00:00.000Z',
    ],
    [
      '2026-11-01T03:00:00.000Z',
      '2026-11-01T03:00:00.000Z',
      '2026-12-01T03:00:00.000Z',
    ],
    [
      '2027-01-01T02:00:00.000Z',
      '2026-12-01T03:00:00.000Z',
      '2027-01-01T03:00:00.000Z',
    ],
    [
      '2028-02-29T23:00:00.000Z',
      '2028-02-01T03:00:00.000Z',
      '2028-03-01T03:00:00.000Z',
    ],
  ])('uses the civil month in America/Maceio for %s', (value, start, end) => {
    expect(rules.oneShotMonth(new Date(value))).toEqual({
      gte: new Date(start),
      lt: new Date(end),
    });
  });

  it('accepts exactly 30 days and rejects one millisecond beyond', () => {
    const limit = new Date(now.getTime() + TABLE_RULE_WINDOW_MS);
    expect(rules.parseOneShotDate(limit.toISOString(), now)).toEqual(limit);
    expect(() =>
      rules.parseOneShotDate(new Date(limit.getTime() + 1).toISOString(), now),
    ).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({
          code: 'ONE_SHOT_SCHEDULE_TOO_FAR',
        }),
      }),
    );
  });

  it('normalizes explicit offsets to UTC and rejects ambiguous server-local timestamps', () => {
    expect(rules.parseOneShotDate('2026-10-21T09:00:00-03:00', now)).toEqual(
      new Date('2026-10-21T12:00:00Z'),
    );
    expect(() => rules.parseOneShotDate('2026-10-21T09:00:00', now)).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({
          code: 'SESSION_DATE_MUST_BE_FUTURE',
        }),
      }),
    );
  });

  it.each([
    'invalid',
    now.toISOString(),
    new Date(now.getTime() - 1).toISOString(),
  ])('rejects invalid/past/present date %s', (value) => {
    expect(() => rules.parseOneShotDate(value, now)).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({
          code: 'SESSION_DATE_MUST_BE_FUTURE',
        }),
      }),
    );
  });

  const serializationError = () =>
    new Prisma.PrismaClientKnownRequestError('conflict', {
      code: 'P2034',
      clientVersion: '7.10.0',
    });
  it('retries the whole transaction with a fresh client after P2034', async () => {
    const first = {},
      second = {};
    const operation = jest.fn().mockResolvedValue('ok');
    transaction.mockImplementationOnce(
      async (callback: (tx: unknown) => Promise<unknown>) => {
        await callback(first);
        throw serializationError();
      },
    );
    transaction.mockImplementationOnce(
      (callback: (tx: unknown) => Promise<unknown>) => callback(second),
    );
    await expect(rules.serializable(operation)).resolves.toBe('ok');
    expect(operation.mock.calls).toEqual([[first], [second]]);
    expect(transaction).toHaveBeenNthCalledWith(2, operation, {
      isolationLevel: 'Serializable',
    });
  });

  it('returns a bounded deterministic domain conflict after three failures', async () => {
    transaction.mockRejectedValue(serializationError());
    await expect(rules.serializable(jest.fn())).rejects.toMatchObject({
      status: 409,
      response: { code: 'TABLE_CONCURRENT_CHANGE' },
    });
    expect(transaction).toHaveBeenCalledTimes(3);
  });

  it('does not retry unrelated failures', async () => {
    transaction.mockRejectedValue(new Error('failure'));
    await expect(rules.serializable(jest.fn())).rejects.toThrow('failure');
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it.each(Object.values(OneShotStatus))(
    'counts %s records globally, with independent systems/months',
    async (status) => {
      const date = new Date('2026-10-25T12:00:00Z');
      const rows = Array.from({ length: 5 }, (_, i) => ({
        masterId: 'master-' + i,
        gameSystemId: 'system-1',
        status,
        scheduledAt: date,
      }));
      const count = jest.fn(
        ({
          where,
        }: {
          where: {
            gameSystemId: string;
            session: { is: { scheduledAt: { gte: Date; lt: Date } } };
          };
        }) => {
          const range = where.session.is.scheduledAt;
          return rows.filter(
            (r) =>
              r.gameSystemId === where.gameSystemId &&
              r.scheduledAt >= range.gte &&
              r.scheduledAt < range.lt,
          ).length;
        },
      );
      const tx = { oneShot: { count } } as unknown as Prisma.TransactionClient;
      await expect(
        rules.assertOneShotCapacity(tx, 'system-1', date),
      ).rejects.toMatchObject({
        response: { code: 'ONE_SHOT_MONTHLY_LIMIT_REACHED' },
      });
      await expect(
        rules.assertOneShotCapacity(tx, 'system-2', date),
      ).resolves.toBeUndefined();
      await expect(
        rules.assertOneShotCapacity(
          tx,
          'system-1',
          new Date('2026-11-01T12:00:00Z'),
        ),
      ).resolves.toBeUndefined();
      expect(count).toHaveBeenNthCalledWith(1, {
        where: {
          gameSystemId: 'system-1',
          session: { is: { scheduledAt: rules.oneShotMonth(date) } },
        },
      });
    },
  );
});
