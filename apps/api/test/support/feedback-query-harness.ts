import {
  FeedbackTargetType,
  FeedbackVisibility,
} from '../../src/generated/prisma/enums';
import { completedParticipationHarness } from './participation-harness';

export async function feedbackQueryHarness(
  kind: 'campaign' | 'oneShot' = 'campaign',
  allowRootUserReads = false,
) {
  const h = await completedParticipationHarness(kind, allowRootUserReads);
  const session = await h.feedbacks.create('session', 'player', {
    targetType: FeedbackTargetType.SESSION,
    rating: 8,
  });
  const privateMaster = await h.feedbacks.create('session', 'player', {
    targetType: FeedbackTargetType.MASTER,
    targetUserId: 'master',
    rating: 9,
    comment: 'Private opinion',
    visibility: FeedbackVisibility.PRIVATE_TO_RECIPIENT,
  });
  const publicPlayer = await h.feedbacks.create('session', 'master', {
    targetType: FeedbackTargetType.PLAYER,
    targetUserId: 'player',
    rating: 10,
  });
  const unrelated = await h.feedbacks.create('session', 'other', {
    targetType: FeedbackTargetType.MASTER,
    targetUserId: 'master',
    rating: 6,
    visibility: FeedbackVisibility.PRIVATE_TO_RECIPIENT,
  });
  const hidden = await h.feedbacks.create('session', 'other', {
    targetType: FeedbackTargetType.SESSION,
    rating: 4,
    comment: 'Hidden content',
  });
  Object.assign(h.state().feedbacks.find((row) => row.id === hidden.id)!, {
    hiddenAt: new Date(),
    hiddenById: 'admin',
    moderationReason: 'Private moderation reason',
  });
  return {
    ...h,
    ids: {
      session: session.id,
      privateMaster: privateMaster.id,
      publicPlayer: publicPlayer.id,
      unrelated: unrelated.id,
      hidden: hidden.id,
    },
  };
}
