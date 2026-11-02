import { Prisma } from '../generated/prisma/client';

// Creation response belongs only to the authenticated author, not a public feed.
export const createdFeedbackSelect = {
  id: true,
  authorId: true,
  sessionId: true,
  targetType: true,
  targetUserId: true,
  rating: true,
  comment: true,
  visibility: true,
  editableUntil: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.FeedbackSelect;

// Deliberate public projection: never identify author/recipient or load profiles.
export const publicFeedbackSelect = {
  id: true,
  targetType: true,
  rating: true,
  comment: true,
  visibility: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.FeedbackSelect;

export const administrativeFeedbackSelect = {
  ...createdFeedbackSelect,
  hiddenAt: true,
  hiddenById: true,
  moderationReason: true,
} satisfies Prisma.FeedbackSelect;
