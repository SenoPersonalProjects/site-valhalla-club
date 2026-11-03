import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsString,
  Matches,
  MaxLength,
  NotContains,
  ValidateIf,
} from 'class-validator';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { WarningSeverity, WarningStatus } from '../generated/prisma/enums';
import {
  WARNING_MAX_ID_LENGTH,
  WARNING_MAX_REASON_LENGTH,
} from './warnings.constants';

export class WarningIdParamsDto {
  @IsString()
  @Matches(/\S/u)
  @NotContains('\0')
  @MaxLength(WARNING_MAX_ID_LENGTH)
  id!: string;
}

export class WarningUserParamsDto {
  @IsString()
  @Matches(/\S/u)
  @NotContains('\0')
  @MaxLength(WARNING_MAX_ID_LENGTH)
  userId!: string;
}

class WarningReasonDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Matches(/\S/u)
  @NotContains('\0')
  @MaxLength(WARNING_MAX_REASON_LENGTH)
  reason!: string;
}

export class ReverseWarningDto extends WarningReasonDto {}

export class CreateWarningDto extends WarningReasonDto {
  @IsString()
  @Matches(/\S/u)
  @NotContains('\0')
  @MaxLength(WARNING_MAX_ID_LENGTH)
  userId!: string;

  @IsString()
  @Matches(/\S/u)
  @NotContains('\0')
  @MaxLength(WARNING_MAX_ID_LENGTH)
  categoryId!: string;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @Matches(/\S/u)
  @NotContains('\0')
  @MaxLength(WARNING_MAX_ID_LENGTH)
  reportId?: string;

  @IsEnum(WarningSeverity)
  severity!: WarningSeverity;
}

export class ListWarningsDto extends PaginationQueryDto {
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @Matches(/\S/u)
  @NotContains('\0')
  @MaxLength(WARNING_MAX_ID_LENGTH)
  userId?: string;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @Matches(/\S/u)
  @NotContains('\0')
  @MaxLength(WARNING_MAX_ID_LENGTH)
  categoryId?: string;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsEnum(WarningSeverity)
  severity?: WarningSeverity;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsEnum(WarningStatus)
  status?: WarningStatus;
}
