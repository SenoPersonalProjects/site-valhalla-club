import {
  AccountStatus,
  ApprovalStatus,
  ClubRole,
  SystemRole,
  SessionParticipantStatus,
} from '../generated/prisma/enums';

export const AUDIT_ACTION = {
  USER_REGISTRATION_REVIEWED: 'USER_REGISTRATION_REVIEWED',
  USER_SYSTEM_ROLE_CHANGED: 'USER_SYSTEM_ROLE_CHANGED',
  USER_CLUB_ROLE_GRANTED: 'USER_CLUB_ROLE_GRANTED',
  USER_CLUB_ROLE_REMOVED: 'USER_CLUB_ROLE_REMOVED',
  CAMPAIGN_APPROVAL_REVIEWED: 'CAMPAIGN_APPROVAL_REVIEWED',
  ONE_SHOT_APPROVAL_REVIEWED: 'ONE_SHOT_APPROVAL_REVIEWED',
  ONE_SHOT_CORRECTED: 'ONE_SHOT_CORRECTED',
  SESSION_PARTICIPANT_ADDED: 'SESSION_PARTICIPANT_ADDED',
  SESSION_PARTICIPATION_CANCELLED: 'SESSION_PARTICIPATION_CANCELLED',
  SESSION_ATTENDANCE_RECORDED: 'SESSION_ATTENDANCE_RECORDED',
  SESSION_COMPLETED: 'SESSION_COMPLETED',
  FEEDBACK_HIDDEN: 'FEEDBACK_HIDDEN',
} as const;

export const AUDIT_ENTITY = {
  USER: 'USER',
  CAMPAIGN: 'CAMPAIGN',
  ONE_SHOT: 'ONE_SHOT',
  SESSION: 'SESSION',
  SESSION_PARTICIPANT: 'SESSION_PARTICIPANT',
  FEEDBACK: 'FEEDBACK',
} as const;

type ReviewMetadata = {
  changed: boolean;
  fromApprovalStatus: ApprovalStatus;
  toApprovalStatus: ApprovalStatus;
};
type RoleMetadata = { changed: boolean; role: ClubRole };
type AuditEvents = {
  FEEDBACK_HIDDEN: {
    entityType: 'FEEDBACK';
    metadata: { changed: boolean; sessionId: string };
  };
  SESSION_PARTICIPANT_ADDED: {
    entityType: 'SESSION_PARTICIPANT';
    metadata: { changed: boolean; sessionId: string };
  };
  SESSION_PARTICIPATION_CANCELLED: {
    entityType: 'SESSION_PARTICIPANT';
    metadata: { changed: boolean; sessionId: string };
  };
  SESSION_ATTENDANCE_RECORDED: {
    entityType: 'SESSION_PARTICIPANT';
    metadata: {
      changed: boolean;
      sessionId: string;
      fromStatus: SessionParticipantStatus;
      toStatus: SessionParticipantStatus;
      correction: boolean;
    };
  };
  SESSION_COMPLETED: {
    entityType: 'SESSION';
    metadata: { attendedPlayers: number; absentPlayers: number };
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
