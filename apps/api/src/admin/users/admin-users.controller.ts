import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseEnumPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ADMINISTRATOR_REQUIREMENT } from '../../authorization/authorization.policies';
import { RequireRoles } from '../../authorization/require-roles.decorator';
import { CurrentUserId } from '../../common/http/current-user-id.decorator';
import { ClubRole } from '../../generated/prisma/enums';
import {
  ChangeSystemRoleDto,
  GrantClubRoleDto,
  ListAdminUsersDto,
  RemoveClubRoleDto,
} from './admin-users.dto';
import { AdminUsersService } from './admin-users.service';

@Controller('admin/users')
@RequireRoles(ADMINISTRATOR_REQUIREMENT)
export class AdminUsersController {
  constructor(private readonly users: AdminUsersService) {}

  @Get()
  list(@CurrentUserId() actorId: string, @Query() query: ListAdminUsersDto) {
    return this.users.list(actorId, query);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUserId() actorId: string) {
    return this.users.findOne(id, actorId);
  }

  @Patch(':id/system-role')
  changeSystemRole(
    @Param('id') id: string,
    @CurrentUserId() actorId: string,
    @Body() dto: ChangeSystemRoleDto,
  ) {
    return this.users.changeSystemRole(id, actorId, dto.systemRole);
  }

  @Post(':id/club-roles')
  @HttpCode(200)
  grantClubRole(
    @Param('id') id: string,
    @CurrentUserId() actorId: string,
    @Body() dto: GrantClubRoleDto,
  ) {
    return this.users.grantClubRole(id, actorId, dto.role);
  }

  @Delete(':id/club-roles/:role')
  @HttpCode(204)
  removeClubRole(
    @Param('id') id: string,
    @CurrentUserId() actorId: string,
    @Param('role', new ParseEnumPipe(ClubRole)) role: ClubRole,
    @Body() _dto: RemoveClubRoleDto,
  ) {
    return this.users.removeClubRole(id, actorId, role);
  }
}
