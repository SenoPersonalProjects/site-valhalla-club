import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import {
  SessionStatus,
  type SessionStatus as SessionStatusValue,
} from '../../generated/prisma/enums';

export class ChangeSessionStatusDto {
  @IsEnum(SessionStatus)
  status!: SessionStatusValue;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}
