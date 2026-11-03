import { WarningSeverity } from '../generated/prisma/enums';

export const WARNING_SEVERITY_POLICY = {
  [WarningSeverity.LIGHT]: { baseWeight: '1', activeDays: 90 },
  [WarningSeverity.MODERATE]: { baseWeight: '3', activeDays: 180 },
  [WarningSeverity.SEVERE]: { baseWeight: '6', activeDays: 365 },
} as const satisfies Record<
  WarningSeverity,
  { baseWeight: string; activeDays: number }
>;

export const WARNING_RECURRENCE_MULTIPLIERS = ['1', '1.5', '2', '2.5'] as const;
export const WARNING_DAY_MS = 24 * 60 * 60 * 1000;
// occurrenceNumber is a Prisma Int, bounded by the signed 32-bit storage type.
export const WARNING_MAX_OCCURRENCE_NUMBER = 2_147_483_647;
