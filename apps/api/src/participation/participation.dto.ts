import {
  IsIn,
  IsString,
  Matches,
  MaxLength,
  NotContains,
  ValidateIf,
} from 'class-validator';
import {
  ATTENDANCE_RESULTS,
  type AttendanceResult,
  PARTICIPATION_ID_MAX_LENGTH,
  PARTICIPATION_REASON_MAX_LENGTH,
  PARTICIPATION_FORBIDDEN_CHARACTER,
} from './participation.constants';

export class SessionParticipationParamsDto {
  @IsString()
  @Matches(/\S/)
  @MaxLength(PARTICIPATION_ID_MAX_LENGTH)
  @NotContains(PARTICIPATION_FORBIDDEN_CHARACTER)
  sessionId!: string;
}

export class ParticipantParamsDto extends SessionParticipationParamsDto {
  @IsString()
  @Matches(/\S/)
  @MaxLength(PARTICIPATION_ID_MAX_LENGTH)
  @NotContains(PARTICIPATION_FORBIDDEN_CHARACTER)
  userId!: string;
}

export class AddParticipantDto {
  @IsString()
  @Matches(/\S/)
  @MaxLength(PARTICIPATION_ID_MAX_LENGTH)
  @NotContains(PARTICIPATION_FORBIDDEN_CHARACTER)
  userId!: string;
}

export class RecordAttendanceDto {
  @IsIn(ATTENDANCE_RESULTS)
  status!: AttendanceResult;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @Matches(/\S/)
  @MaxLength(PARTICIPATION_REASON_MAX_LENGTH)
  @NotContains(PARTICIPATION_FORBIDDEN_CHARACTER)
  reason?: string;
}

export class CancelParticipationDto {
  @IsString()
  @Matches(/\S/)
  @MaxLength(PARTICIPATION_REASON_MAX_LENGTH)
  @NotContains(PARTICIPATION_FORBIDDEN_CHARACTER)
  reason!: string;
}
