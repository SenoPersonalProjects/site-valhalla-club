import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsString,
  Matches,
  MaxLength,
  NotContains,
  ValidateIf,
} from 'class-validator';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { AppealStatus, WarningStatus } from '../generated/prisma/enums';
import {
  SANCTION_MAX_ID_LENGTH,
  SANCTION_MAX_REASON_LENGTH,
} from '../sanctions/sanctions.constants';

export class AppealTargetDto {
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
  sanctionId?: string;
}

export class CreateAppealDto extends AppealTargetDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Matches(/\S/u)
  @NotContains('\0')
  @MaxLength(SANCTION_MAX_REASON_LENGTH)
  justification!: string;
}

export class ReviewAppealDto {
  @IsIn([AppealStatus.APPROVED, AppealStatus.REJECTED])
  decision!: typeof AppealStatus.APPROVED | typeof AppealStatus.REJECTED;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Matches(/\S/u)
  @NotContains('\0')
  @MaxLength(SANCTION_MAX_REASON_LENGTH)
  response!: string;
}

export class OwnAppealFiltersDto extends PaginationQueryDto {
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsEnum(AppealStatus)
  status?: AppealStatus;

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
  sanctionId?: string;
}

export class AdminAppealFiltersDto extends OwnAppealFiltersDto {
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @Matches(/\S/u)
  @NotContains('\0')
  @MaxLength(SANCTION_MAX_ID_LENGTH)
  userId?: string;
}

export class OwnWarningFiltersDto extends PaginationQueryDto {
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsEnum(WarningStatus)
  status?: WarningStatus;
}
