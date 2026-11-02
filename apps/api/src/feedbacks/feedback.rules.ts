import { maxLength } from 'class-validator';
import {
  FeedbackTargetType,
  FeedbackVisibility,
} from '../generated/prisma/enums';
import { badRequest } from '../tables/table-domain.errors';
import {
  DEFAULT_FEEDBACK_VISIBILITY,
  FEEDBACK_COMMENT_MAX_LENGTH,
  FEEDBACK_FORBIDDEN_CHARACTER,
  FEEDBACK_ID_MAX_LENGTH,
  FEEDBACK_RATING_MAX,
  FEEDBACK_RATING_MIN,
} from './feedback.constants';

export function feedbackTarget(
  type: FeedbackTargetType,
  userId?: string | null,
) {
  if (!Object.values(FeedbackTargetType).includes(type)) {
    throw badRequest(
      'FEEDBACK_TARGET_INVALID',
      'Tipo de destinatário inválido',
    );
  }
  if (type === FeedbackTargetType.SESSION) {
    if (userId !== undefined && userId !== null) {
      throw badRequest(
        'FEEDBACK_TARGET_INVALID',
        'Feedback de sessão não possui destinatário individual',
      );
    }
    return { targetType: type, targetUserId: null, targetKey: type };
  }
  if (typeof userId !== 'string' || !userId.trim()) {
    throw badRequest(
      'FEEDBACK_TARGET_USER_REQUIRED',
      'Informe o destinatário do feedback',
    );
  }
  if (
    !maxLength(userId, FEEDBACK_ID_MAX_LENGTH) ||
    userId.includes(FEEDBACK_FORBIDDEN_CHARACTER)
  ) {
    throw badRequest(
      'FEEDBACK_TARGET_INVALID',
      'Identificador do destinatário inválido',
    );
  }
  return {
    targetType: type,
    targetUserId: userId,
    targetKey: `${type}:${userId}`,
  };
}

export function feedbackRating(rating: number): number {
  if (
    !Number.isInteger(rating) ||
    rating < FEEDBACK_RATING_MIN ||
    rating > FEEDBACK_RATING_MAX
  ) {
    throw badRequest(
      'FEEDBACK_RATING_INVALID',
      `A nota deve ser inteira e estar entre ${FEEDBACK_RATING_MIN} e ${FEEDBACK_RATING_MAX}`,
    );
  }
  return rating;
}

export function feedbackComment(comment?: string | null): string | null {
  if (comment === undefined || comment === null) return null;
  if (
    typeof comment !== 'string' ||
    !maxLength(comment, FEEDBACK_COMMENT_MAX_LENGTH) ||
    comment.includes(FEEDBACK_FORBIDDEN_CHARACTER)
  ) {
    throw badRequest(
      'FEEDBACK_COMMENT_INVALID',
      'Comentário inválido ou acima do limite permitido',
    );
  }
  return comment.trim() || null;
}

export function feedbackVisibility(
  visibility?: FeedbackVisibility,
): FeedbackVisibility {
  if (visibility === undefined) return DEFAULT_FEEDBACK_VISIBILITY;
  if (!Object.values(FeedbackVisibility).includes(visibility)) {
    throw badRequest('FEEDBACK_VISIBILITY_INVALID', 'Visibilidade inválida');
  }
  return visibility;
}
