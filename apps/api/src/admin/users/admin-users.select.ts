import { Prisma } from '../../generated/prisma/client';

export const adminUserListSelect = {
  id: true,
  status: true,
  systemRole: true,
  clubRoles: { orderBy: { role: 'asc' }, select: { role: true } },
  profile: { select: { displayName: true } },
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

// Email identifies the individual registration being operated on. General
// listing does not need it. Contacts, birth date and free-text notes are omitted.
export const adminUserDetailSelect = {
  ...adminUserListSelect,
  email: true,
  reviewedAt: true,
  suspendedAt: true,
  deletionRequestedAt: true,
  deletionExpiresAt: true,
} satisfies Prisma.UserSelect;
