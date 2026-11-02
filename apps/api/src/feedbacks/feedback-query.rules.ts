import { Prisma } from '../generated/prisma/client';
import {
  ApprovalStatus,
  CampaignStatus,
  FeedbackTargetType,
  FeedbackVisibility,
  OneShotStatus,
  SessionStatus,
} from '../generated/prisma/enums';
import { badRequest } from '../tables/table-domain.errors';
import {
  FEEDBACK_MAX_OFFSET,
  FEEDBACK_MAX_PAGE_LIMIT,
} from './feedback.constants';
import { ListFeedbacksDto } from './feedback.dto';

export function feedbackOffset(query: ListFeedbacksDto): number {
  const skip = (query.page - 1) * query.limit;
  if (
    !Number.isSafeInteger(query.page) ||
    query.page < 1 ||
    !Number.isSafeInteger(query.limit) ||
    query.limit < 1 ||
    query.limit > FEEDBACK_MAX_PAGE_LIMIT ||
    !Number.isSafeInteger(skip) ||
    skip > FEEDBACK_MAX_OFFSET ||
    (query.targetType !== undefined &&
      !Object.values(FeedbackTargetType).includes(query.targetType))
  ) {
    throw badRequest('BAD_REQUEST', 'Paginação ou filtro de feedback inválido');
  }
  return skip;
}

export function personalFeedbackScope(
  actorId: string,
): Prisma.FeedbackWhereInput {
  return {
    hiddenAt: null,
    OR: [{ authorId: actorId }, { targetUserId: actorId }],
  };
}

export function publicFeedbackScope(): Prisma.FeedbackWhereInput {
  return {
    visibility: FeedbackVisibility.PUBLIC,
    hiddenAt: null,
    session: {
      is: {
        status: SessionStatus.COMPLETED,
        OR: [
          {
            campaignId: { not: null },
            oneShotId: null,
            campaign: {
              is: {
                status: CampaignStatus.ACTIVE,
                approvalStatus: ApprovalStatus.APPROVED,
              },
            },
          },
          {
            campaignId: null,
            oneShotId: { not: null },
            // Closed one-shots have feedback only after completion. Their public
            // feedback history must not require reopening the table as SCHEDULED.
            oneShot: {
              is: {
                status: OneShotStatus.COMPLETED,
                approvalStatus: ApprovalStatus.APPROVED,
              },
            },
          },
        ],
      },
    },
  };
}
