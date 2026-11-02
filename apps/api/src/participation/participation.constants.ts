import { SessionParticipantStatus } from '../generated/prisma/enums';

export const PARTICIPATION_ID_MAX_LENGTH = 128;
export const PARTICIPATION_REASON_MAX_LENGTH = 1000;
export const PARTICIPATION_FORBIDDEN_CHARACTER = '\u0000';
export const PARTICIPATION_MAX_OFFSET = 2_147_483_647;

export const ATTENDANCE_RESULTS = [
  SessionParticipantStatus.ATTENDED,
  SessionParticipantStatus.NO_SHOW,
] as const;

export type AttendanceResult = (typeof ATTENDANCE_RESULTS)[number];
