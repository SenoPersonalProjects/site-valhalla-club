import { Prisma } from '../generated/prisma/client';

export const sanctionListSelect = {
  id: true,
  userId: true,
  type: true,
  status: true,
  scopeType: true,
  campaignId: true,
  sessionId: true,
  startsAt: true,
  endsAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.SanctionSelect;

export const sanctionDetailSelect = {
  ...sanctionListSelect,
  reportId: true,
  warningId: true,
  scopeDescription: true,
  reason: true,
  createdById: true,
  reversedById: true,
  reversedAt: true,
  reversalReason: true,
} satisfies Prisma.SanctionSelect;

export const ownSanctionDetailSelect = {
  ...sanctionListSelect,
  scopeDescription: true,
  reason: true,
  reversedAt: true,
  reversalReason: true,
} satisfies Prisma.SanctionSelect;
