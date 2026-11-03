import { BadRequestException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { WarningSeverity, WarningStatus } from '../generated/prisma/enums';
import {
  WARNING_DAY_MS,
  WARNING_MAX_OCCURRENCE_NUMBER,
  WARNING_RECURRENCE_MULTIPLIERS,
  WARNING_SEVERITY_POLICY,
} from './warning-policy.constants';

type WarningLifetime = Readonly<{ status: WarningStatus; expiresAt: Date }>;

export function warningReferenceTime(value: Date): Date {
  const time = value.getTime();
  if (!Number.isFinite(time)) {
    throw new BadRequestException({
      code: 'WARNING_REFERENCE_TIME_INVALID',
      message: 'Instante de referência inválido',
    });
  }
  return new Date(time);
}

export function warningSeverityPolicy(severity: WarningSeverity) {
  if (!Object.values(WarningSeverity).includes(severity)) {
    throw new BadRequestException({
      code: 'WARNING_SEVERITY_INVALID',
      message: 'Gravidade de advertência inválida',
    });
  }
  return WARNING_SEVERITY_POLICY[severity];
}

export function calculateWarning(
  severity: WarningSeverity,
  activeCount: number,
  at: Date,
) {
  const rule = warningSeverityPolicy(severity);
  if (
    !Number.isSafeInteger(activeCount) ||
    activeCount < 0 ||
    activeCount >= WARNING_MAX_OCCURRENCE_NUMBER
  ) {
    throw new BadRequestException({
      code: 'WARNING_RECURRENCE_INVALID',
      message: 'Quantidade de advertências ativas inválida para o cálculo',
    });
  }
  const createdAt = warningReferenceTime(at);
  const expiresAt = warningReferenceTime(
    new Date(createdAt.getTime() + rule.activeDays * WARNING_DAY_MS),
  );
  const baseWeight = new Prisma.Decimal(rule.baseWeight);
  const recurrenceMultiplier = new Prisma.Decimal(
    WARNING_RECURRENCE_MULTIPLIERS[
      Math.min(activeCount, WARNING_RECURRENCE_MULTIPLIERS.length - 1)
    ],
  );
  return {
    severity,
    baseWeight,
    recurrenceMultiplier,
    effectiveWeight: baseWeight.mul(recurrenceMultiplier),
    occurrenceNumber: activeCount + 1,
    createdAt,
    expiresAt,
  };
}

export function activeWarningWhereAt(at: Date) {
  return {
    status: WarningStatus.ACTIVE,
    expiresAt: { gt: warningReferenceTime(at) },
  } satisfies Prisma.WarningWhereInput;
}

export function warningStatusWhereAt(
  status: WarningStatus,
  at: Date,
): Prisma.WarningWhereInput {
  const reference = warningReferenceTime(at);
  if (status === WarningStatus.ACTIVE) return activeWarningWhereAt(reference);
  if (status === WarningStatus.EXPIRED) {
    return {
      OR: [
        { status: WarningStatus.EXPIRED },
        { status: WarningStatus.ACTIVE, expiresAt: { lte: reference } },
      ],
    };
  }
  if (status === WarningStatus.REVERSED)
    return { status: WarningStatus.REVERSED };
  throw new BadRequestException({
    code: 'WARNING_STATUS_INVALID',
    message: 'Estado de advertência inválido',
  });
}

export function effectiveWarningStatusAt(
  warning: WarningLifetime,
  at: Date,
): WarningStatus {
  if (!Object.values(WarningStatus).includes(warning.status)) {
    throw new BadRequestException({
      code: 'WARNING_STATUS_INVALID',
      message: 'Estado de advertência inválido',
    });
  }
  const reference = warningReferenceTime(at);
  const expiresAt = warningReferenceTime(warning.expiresAt);
  return warning.status === WarningStatus.ACTIVE && expiresAt <= reference
    ? WarningStatus.EXPIRED
    : warning.status;
}
