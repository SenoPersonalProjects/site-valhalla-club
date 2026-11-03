import { Prisma } from '../generated/prisma/client';
import { WarningSeverity } from '../generated/prisma/enums';
import {
  activeWarningWhereAt,
  calculateWarning,
  warningReferenceTime,
  warningSeverityPolicy,
} from './warning-policy';

type WarningCalculationClient = Pick<Prisma.TransactionClient, 'warning'>;

// The caller owns authorization, Serializable isolation, retries and writes.
// No root PrismaService or nested transaction is created by these helpers.
export async function calculateWarningForCreation(
  transaction: WarningCalculationClient,
  userId: string,
  categoryId: string,
  severity: WarningSeverity,
  at: Date,
) {
  warningSeverityPolicy(severity);
  const reference = warningReferenceTime(at);
  const activeCount = await transaction.warning.count({
    where: { userId, categoryId, ...activeWarningWhereAt(reference) },
  });
  return calculateWarning(severity, activeCount, reference);
}

export async function activeWarningTotalsAt(
  transaction: WarningCalculationClient,
  userId: string,
  at: Date,
) {
  // Sum Decimal values in the database; do not convert weights to JS numbers.
  const totals = await transaction.warning.aggregate({
    where: { userId, ...activeWarningWhereAt(at) },
    _count: { _all: true },
    _sum: { effectiveWeight: true },
  });
  return {
    activeCount: totals._count._all,
    totalActiveWeight: totals._sum.effectiveWeight ?? new Prisma.Decimal(0),
  };
}
