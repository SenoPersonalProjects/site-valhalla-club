import { Prisma } from '../generated/prisma/client';
import { WarningSeverity } from '../generated/prisma/enums';
import {
  activeWarningTotalsAt,
  calculateWarningForCreation,
} from './warning-calculation';

const instant = () => new Date('2026-01-01T12:34:56.789Z');
type AggregateResult = {
  _count: { _all: number };
  _sum: { effectiveWeight: Prisma.Decimal | null };
};

function calculationClient() {
  const count = jest.fn((args: Prisma.WarningCountArgs) => {
    if (!args.where) throw Error('Missing query scope');
    return Promise.resolve(1);
  });
  const aggregate = jest.fn(
    (args: Prisma.WarningAggregateArgs): Promise<AggregateResult> => {
      if (!args.where) throw Error('Missing query scope');
      return Promise.resolve({
        _count: { _all: 1 },
        _sum: { effectiveWeight: new Prisma.Decimal('4.5') },
      });
    },
  );
  return {
    count,
    aggregate,
    transaction: { warning: { count, aggregate } } as unknown as Pick<
      Prisma.TransactionClient,
      'warning'
    >,
  };
}

describe('Warning calculation with the supplied transaction', () => {
  it('scopes recurrence to the user, category, active state and unexpired deadline', async () => {
    const h = calculationClient();
    const result = await calculateWarningForCreation(
      h.transaction,
      'user-a',
      'category-a',
      WarningSeverity.MODERATE,
      instant(),
    );
    expect(h.count).toHaveBeenCalledWith({
      where: {
        userId: 'user-a',
        categoryId: 'category-a',
        status: 'ACTIVE',
        expiresAt: { gt: instant() },
      },
    });
    expect(result.occurrenceNumber).toBe(2);
    expect(result.effectiveWeight.toString()).toBe('4.5');
    expect(h.aggregate).not.toHaveBeenCalled();
  });

  it('uses the new active count on each call without caching recurrence', async () => {
    const h = calculationClient();
    h.count.mockResolvedValueOnce(0).mockResolvedValueOnce(2);
    const first = await calculateWarningForCreation(
      h.transaction,
      'user-a',
      'category-a',
      WarningSeverity.LIGHT,
      instant(),
    );
    const next = await calculateWarningForCreation(
      h.transaction,
      'user-a',
      'category-a',
      WarningSeverity.LIGHT,
      instant(),
    );
    expect(first.occurrenceNumber).toBe(1);
    expect(next.occurrenceNumber).toBe(3);
    expect(next.effectiveWeight.toString()).toBe('2');
  });

  it('keeps one reference instant even when the clock argument changes while awaiting the count', async () => {
    const h = calculationClient();
    const at = instant();
    h.count.mockImplementationOnce((args) => {
      expect(args.where).toMatchObject({ expiresAt: { gt: instant() } });
      at.setUTCFullYear(2030);
      return Promise.resolve(1);
    });
    const result = await calculateWarningForCreation(
      h.transaction,
      'user-a',
      'category-a',
      WarningSeverity.LIGHT,
      at,
    );
    expect(result.createdAt.toISOString()).toBe('2026-01-01T12:34:56.789Z');
    expect(result.expiresAt.toISOString()).toBe('2026-04-01T12:34:56.789Z');
  });

  it('rejects invalid calculation inputs before querying', async () => {
    const h = calculationClient();
    await expect(
      calculateWarningForCreation(
        h.transaction,
        'user',
        'category',
        'UNKNOWN' as WarningSeverity,
        instant(),
      ),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      calculateWarningForCreation(
        h.transaction,
        'user',
        'category',
        WarningSeverity.LIGHT,
        new Date(NaN),
      ),
    ).rejects.toMatchObject({ status: 400 });
    expect(h.count).not.toHaveBeenCalled();
  });

  it('propagates a count failure instead of treating it as zero recurrence', async () => {
    const h = calculationClient();
    h.count.mockRejectedValueOnce(Error('Synthetic persistence failure'));
    await expect(
      calculateWarningForCreation(
        h.transaction,
        'user',
        'category',
        WarningSeverity.LIGHT,
        instant(),
      ),
    ).rejects.toThrow('Synthetic persistence failure');
  });

  it('aggregates active weights in the database without loading reasons or historical rows', async () => {
    const h = calculationClient();
    const result = await activeWarningTotalsAt(
      h.transaction,
      'user-a',
      instant(),
    );
    expect(h.aggregate).toHaveBeenCalledWith({
      where: {
        userId: 'user-a',
        status: 'ACTIVE',
        expiresAt: { gt: instant() },
      },
      _count: { _all: true },
      _sum: { effectiveWeight: true },
    });
    expect(result.activeCount).toBe(1);
    expect(result.totalActiveWeight.toString()).toBe('4.5');
    expect(h.count).not.toHaveBeenCalled();
  });

  it('returns a Decimal zero for an empty active set', async () => {
    const h = calculationClient();
    h.aggregate.mockResolvedValueOnce({
      _count: { _all: 0 },
      _sum: { effectiveWeight: null },
    });
    const result = await activeWarningTotalsAt(
      h.transaction,
      'user-a',
      instant(),
    );
    expect(result.activeCount).toBe(0);
    expect(result.totalActiveWeight).toBeInstanceOf(Prisma.Decimal);
    expect(result.totalActiveWeight.toString()).toBe('0');
  });

  it('preserves the exact aggregate beyond JavaScript safe integer precision', async () => {
    const h = calculationClient();
    h.aggregate.mockResolvedValueOnce({
      _count: { _all: 2 },
      _sum: { effectiveWeight: new Prisma.Decimal('9007199254740993.5') },
    });
    const result = await activeWarningTotalsAt(
      h.transaction,
      'user-a',
      instant(),
    );
    const response: unknown = JSON.parse(JSON.stringify(result));
    expect(response).toEqual({
      activeCount: 2,
      totalActiveWeight: '9007199254740993.5',
    });
  });

  it('propagates aggregate failures rather than silently returning a zero score', async () => {
    const h = calculationClient();
    h.aggregate.mockRejectedValueOnce(Error('Synthetic persistence failure'));
    await expect(
      activeWarningTotalsAt(h.transaction, 'user-a', instant()),
    ).rejects.toThrow('Synthetic persistence failure');
  });
});
