import {
  IsIn,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { AUDIT_ENTITY } from './audit.constants';

export class ListAuditLogsDto extends PaginationQueryDto {
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  actorId?: string;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsIn(Object.values(AUDIT_ENTITY))
  entityType?: (typeof AUDIT_ENTITY)[keyof typeof AUDIT_ENTITY];

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  entityId?: string;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @Matches(/^[A-Za-z0-9._:-]{1,128}$/)
  requestId?: string;
}
