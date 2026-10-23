import { IsEnum, ValidateIf } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import {
  AccountStatus,
  ClubRole,
  SystemRole,
} from '../../generated/prisma/enums';

export class ListAdminUsersDto extends PaginationQueryDto {
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsEnum(AccountStatus)
  status?: AccountStatus;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsEnum(SystemRole)
  systemRole?: SystemRole;
}

export class ChangeSystemRoleDto {
  @IsEnum(SystemRole)
  systemRole!: SystemRole;
}

export class GrantClubRoleDto {
  @IsEnum(ClubRole)
  role!: ClubRole;
}

export class RemoveClubRoleDto {}
