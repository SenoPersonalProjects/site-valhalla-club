import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import {
  OneShotStatus,
  type OneShotStatus as OneShotStatusValue,
} from '../../generated/prisma/enums';

export class ChangeOneShotStatusDto {
  @IsEnum(OneShotStatus)
  status!: OneShotStatusValue;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}
