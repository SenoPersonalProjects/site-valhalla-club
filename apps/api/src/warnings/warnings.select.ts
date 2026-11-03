import { Prisma } from '../generated/prisma/client';
import { disciplinaryCategorySelect } from './disciplinary-categories.service';

export const warningListSelect = {
  id: true,
  userId: true,
  categoryId: true,
  category: { select: disciplinaryCategorySelect },
  severity: true,
  baseWeight: true,
  recurrenceMultiplier: true,
  effectiveWeight: true,
  occurrenceNumber: true,
  status: true,
  expiresAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.WarningSelect;

export const warningDetailSelect = {
  ...warningListSelect,
  reportId: true,
  reason: true,
  createdById: true,
  reversedById: true,
  reversedAt: true,
  reversalReason: true,
} satisfies Prisma.WarningSelect;
