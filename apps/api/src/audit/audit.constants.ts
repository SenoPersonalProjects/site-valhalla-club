import {
  AccountStatus,
  ApprovalStatus,
  ClubRole,
  SystemRole,
  SanctionType,
  SanctionScopeType,
  SanctionStatus,
  WarningStatus,
  AppealStatus,
} from '../generated/prisma/enums';

export const AUDIT_ACTION = {
  USER_REGISTRATION_REVIEWED: 'USER_REGISTRATION_REVIEWED',
  USER_SYSTEM_ROLE_CHANGED: 'USER_SYSTEM_ROLE_CHANGED',
  USER_CLUB_ROLE_GRANTED: 'USER_CLUB_ROLE_GRANTED',
  USER_CLUB_ROLE_REMOVED: 'USER_CLUB_ROLE_REMOVED',
  CAMPAIGN_APPROVAL_REVIEWED: 'CAMPAIGN_APPROVAL_REVIEWED',
  ONE_SHOT_APPROVAL_REVIEWED: 'ONE_SHOT_APPROVAL_REVIEWED',
  ONE_SHOT_CORRECTED: 'ONE_SHOT_CORRECTED',
  SANCTION_CREATED: 'SANCTION_CREATED',
  SANCTION_REVERSED: 'SANCTION_REVERSED',
  SANCTION_EXPIRED: 'SANCTION_EXPIRED',
  WARNING_REVERSED: 'WARNING_REVERSED',
  APPEAL_SUBMITTED: 'APPEAL_SUBMITTED',
  APPEAL_REVIEWED: 'APPEAL_REVIEWED',
} as const;

export const AUDIT_ENTITY = {
  USER: 'USER',
  CAMPAIGN: 'CAMPAIGN',
  ONE_SHOT: 'ONE_SHOT',
  SANCTION: 'SANCTION',
  WARNING: 'WARNING',
  APPEAL: 'APPEAL',
} as const;

type ReviewMetadata = {
  changed: boolean;
  fromApprovalStatus: ApprovalStatus;
  toApprovalStatus: ApprovalStatus;
};
type RoleMetadata = { changed: boolean; role: ClubRole };
type AuditEvents = {
  APPEAL_SUBMITTED: {
    entityType: 'APPEAL';
    metadata: {
      changed: true;
      targetType: 'WARNING' | 'SANCTION';
      sequence: number;
    };
  };
  APPEAL_REVIEWED: {
    entityType: 'APPEAL';
    metadata: {
      changed: boolean;
      targetType: 'WARNING' | 'SANCTION';
      sequence: number;
      fromStatus: AppealStatus;
      toStatus: 'APPROVED' | 'REJECTED';
    };
  };
  WARNING_REVERSED: {
    entityType: 'WARNING';
    metadata: {
      changed: boolean;
      fromStatus: WarningStatus;
      toStatus: 'REVERSED';
    };
  };
  SANCTION_REVERSED: {
    entityType: 'SANCTION';
    metadata: {
      changed: boolean;
      fromStatus: SanctionStatus;
      toStatus: 'REVERSED';
    };
  };
  SANCTION_EXPIRED: {
    entityType: 'SANCTION';
    metadata: { changed: true; fromStatus: 'ACTIVE'; toStatus: 'EXPIRED' };
  };
  SANCTION_CREATED: {
    entityType: 'SANCTION';
    metadata: {
      changed: true;
      type: SanctionType;
      scopeType: SanctionScopeType;
      hasReport: boolean;
      hasWarning: boolean;
    };
  };
  USER_REGISTRATION_REVIEWED: {
    entityType: 'USER';
    metadata: {
      changed: boolean;
      fromStatus: AccountStatus;
      toStatus: AccountStatus;
    };
  };
  USER_SYSTEM_ROLE_CHANGED: {
    entityType: 'USER';
    metadata: {
      changed: boolean;
      fromSystemRole: SystemRole;
      toSystemRole: SystemRole;
    };
  };
  USER_CLUB_ROLE_GRANTED: { entityType: 'USER'; metadata: RoleMetadata };
  USER_CLUB_ROLE_REMOVED: { entityType: 'USER'; metadata: RoleMetadata };
  CAMPAIGN_APPROVAL_REVIEWED: {
    entityType: 'CAMPAIGN';
    metadata: ReviewMetadata;
  };
  ONE_SHOT_APPROVAL_REVIEWED: {
    entityType: 'ONE_SHOT';
    metadata: ReviewMetadata;
  };
  ONE_SHOT_CORRECTED: {
    entityType: 'ONE_SHOT';
    metadata: {
      changed: boolean;
      fields: (
        | 'gameSystemId'
        | 'scheduledAt'
        | 'approvalStatus'
        | 'status'
        | 'review'
      )[];
    };
  };
};

export type AuditEvent = {
  [Action in keyof AuditEvents]: {
    action: Action;
    actorId: string | null;
    entityId: string;
    requestId?: string | null;
  } & AuditEvents[Action];
}[keyof AuditEvents];
