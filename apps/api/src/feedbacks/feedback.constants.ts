import type { RoleRequirement } from '../authorization/authorization.policies';
import { FeedbackVisibility, SystemRole } from '../generated/prisma/enums';

export const FEEDBACK_RATING_MIN = 0;
export const FEEDBACK_RATING_MAX = 10;
export const FEEDBACK_COMMENT_MAX_LENGTH = 2000;
export const FEEDBACK_MODERATION_REASON_MAX_LENGTH = 1000;
export const FEEDBACK_ID_MAX_LENGTH = 128;
export const FEEDBACK_EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;
// NUL cannot be stored in PostgreSQL text; reject it as invalid input.
export const FEEDBACK_FORBIDDEN_CHARACTER = '\u0000';
export const DEFAULT_FEEDBACK_VISIBILITY = FeedbackVisibility.PUBLIC;

// Any approved account may author feedback; system roles never bypass presence.
export const FEEDBACK_ACCOUNT_REQUIREMENT: RoleRequirement = {
  systemRoles: Object.values(SystemRole),
};

export const FEEDBACK_MAX_OFFSET = 2_147_483_647;
export const FEEDBACK_MAX_PAGE_LIMIT = 50;
