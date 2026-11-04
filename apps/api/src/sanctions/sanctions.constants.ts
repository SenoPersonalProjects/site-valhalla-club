import { SanctionScopeType, SanctionType } from '../generated/prisma/enums';

const general = [SanctionScopeType.GENERAL] as const;
const table = [
  ...general,
  SanctionScopeType.CAMPAIGN,
  SanctionScopeType.SESSION,
];
const activity = [...general, SanctionScopeType.OTHER];

export const SANCTION_SCOPES = {
  [SanctionType.TABLE_CREATION_RESTRICTION]: general,
  [SanctionType.TABLE_PARTICIPATION_RESTRICTION]: table,
  [SanctionType.EVENT_PARTICIPATION_RESTRICTION]: activity,
  [SanctionType.CLUB_ACTIVITY_RESTRICTION]: activity,
  [SanctionType.MASTER_ACTIVITY_RESTRICTION]: table,
  [SanctionType.ACCOUNT_SUSPENSION]: general,
  [SanctionType.EXPULSION]: general,
} satisfies Record<SanctionType, readonly SanctionScopeType[]>;

export const SANCTION_MAX_ID_LENGTH = 128;
export const SANCTION_MAX_REASON_LENGTH = 1_000;
export const SANCTION_MAX_SCOPE_DESCRIPTION_LENGTH = 500;
export const SANCTION_MAX_OFFSET = 2_147_483_647;
export const SANCTION_MAX_PAGE_LIMIT = 50;
export const SANCTION_TRANSACTION_ATTEMPTS = 3;
export const SANCTION_EXPIRATION_INTERVAL_MS = 60_000;
export const SANCTION_EXPIRATION_BATCH_SIZE = 25;
export const SANCTION_TRANSACTION_TIMEOUT_MS = 15_000;
export const SANCTION_ZONED_TIMESTAMP = /T.+(?:Z|[+-]\d{2}:\d{2})$/;
