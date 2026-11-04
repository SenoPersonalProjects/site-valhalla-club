import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsISO8601,
  IsString,
  Matches,
  MaxLength,
  NotContains,
  ValidateIf,
} from 'class-validator';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import {
  SanctionScopeType,
  SanctionStatus,
  SanctionType,
} from '../generated/prisma/enums';
import {
  SANCTION_MAX_ID_LENGTH,
  SANCTION_MAX_REASON_LENGTH,
  SANCTION_MAX_SCOPE_DESCRIPTION_LENGTH,
  SANCTION_ZONED_TIMESTAMP,
} from './sanctions.constants';

export class SanctionIdParamsDto {
  @IsString()
  @Matches(/\S/u)
  @NotContains('\0')
  @MaxLength(SANCTION_MAX_ID_LENGTH)
  id!: string;
}

export class SanctionFiltersDto extends PaginationQueryDto {
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @Matches(/\S/u)
  @NotContains('\0')
  @MaxLength(SANCTION_MAX_ID_LENGTH)
  userId?: string;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsEnum(SanctionType)
  type?: SanctionType;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsEnum(SanctionStatus)
  status?: SanctionStatus;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsEnum(SanctionScopeType)
  scopeType?: SanctionScopeType;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @Matches(/\S/u)
  @NotContains('\0')
  @MaxLength(SANCTION_MAX_ID_LENGTH)
  campaignId?: string;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @Matches(/\S/u)
  @NotContains('\0')
  @MaxLength(SANCTION_MAX_ID_LENGTH)
  sessionId?: string;
}

export class OwnSanctionFiltersDto extends PaginationQueryDto {
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsEnum(SanctionType)
  type?: SanctionType;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsEnum(SanctionStatus)
  status?: SanctionStatus;
}

export class CreateSanctionDto {
  @IsString()
  @Matches(/\S/u)
  @NotContains('\0')
  @MaxLength(SANCTION_MAX_ID_LENGTH)
  userId!: string;

  @IsEnum(SanctionType)
  type!: SanctionType;

  @IsEnum(SanctionScopeType)
  scopeType: SanctionScopeType = SanctionScopeType.GENERAL;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Matches(/\S/u)
  @NotContains('\0')
  @MaxLength(SANCTION_MAX_REASON_LENGTH)
  reason!: string;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @Matches(/\S/u)
  @NotContains('\0')
  @MaxLength(SANCTION_MAX_ID_LENGTH)
  reportId?: string;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @Matches(/\S/u)
  @NotContains('\0')
  @MaxLength(SANCTION_MAX_ID_LENGTH)
  warningId?: string;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @Matches(/\S/u)
  @NotContains('\0')
  @MaxLength(SANCTION_MAX_ID_LENGTH)
  campaignId?: string;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @Matches(/\S/u)
  @NotContains('\0')
  @MaxLength(SANCTION_MAX_ID_LENGTH)
  sessionId?: string;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Matches(/\S/u)
  @NotContains('\0')
  @MaxLength(SANCTION_MAX_SCOPE_DESCRIPTION_LENGTH)
  scopeDescription?: string;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsISO8601({ strict: true, strictSeparator: true })
  @Matches(SANCTION_ZONED_TIMESTAMP)
  startsAt?: string;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsISO8601({ strict: true, strictSeparator: true })
  @Matches(SANCTION_ZONED_TIMESTAMP)
  endsAt?: string;
}

export class ReverseSanctionDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Matches(/\S/u)
  @NotContains('\0')
  @MaxLength(SANCTION_MAX_REASON_LENGTH)
  reason!: string;
}
