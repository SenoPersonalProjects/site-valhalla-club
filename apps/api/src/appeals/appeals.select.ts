import { Prisma } from '../generated/prisma/client';

export const appealListSelect = {
  id: true,
  userId: true,
  warningId: true,
  sanctionId: true,
  sequence: true,
  status: true,
  reviewedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.AppealSelect;

export const ownAppealDetailSelect = {
  ...appealListSelect,
  justification: true,
  response: true,
} satisfies Prisma.AppealSelect;

export const adminAppealDetailSelect = {
  ...ownAppealDetailSelect,
  reviewedById: true,
} satisfies Prisma.AppealSelect;

export const appealCaseSelect = {
  id: true,
  userId: true,
  createdById: true,
  status: true,
} satisfies Prisma.SanctionSelect & Prisma.WarningSelect;

export const ownWarningListSelect = {
  id: true,
  userId: true,
  categoryId: true,
  severity: true,
  status: true,
  baseWeight: true,
  recurrenceMultiplier: true,
  effectiveWeight: true,
  occurrenceNumber: true,
  expiresAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.WarningSelect;

export const ownWarningDetailSelect = {
  ...ownWarningListSelect,
  reason: true,
  reversedAt: true,
  reversalReason: true,
} satisfies Prisma.WarningSelect;
