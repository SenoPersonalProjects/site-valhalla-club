import { Prisma } from '../generated/prisma/client';

export const participantSelect = {
  id: true,
  userId: true,
  role: true,
  status: true,
  registeredAt: true,
  attendedAt: true,
  cancelledAt: true,
  updatedAt: true,
  user: { select: { profile: { select: { displayName: true } } } },
} satisfies Prisma.SessionParticipantSelect;

export const participationSessionSelect = {
  id: true,
  status: true,
  scheduledAt: true,
  campaign: { select: { masterId: true } },
  oneShot: { select: { masterId: true } },
} satisfies Prisma.SessionSelect;
