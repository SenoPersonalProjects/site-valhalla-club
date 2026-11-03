import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ADMINISTRATOR_REQUIREMENT } from '../authorization/authorization.policies';
import { RequireRoles } from '../authorization/require-roles.decorator';
import { CurrentRequestId } from '../common/http/current-request-id.decorator';
import { CurrentUserId } from '../common/http/current-user-id.decorator';
import {
  CreateWarningDto,
  ListWarningsDto,
  ReverseWarningDto,
  WarningIdParamsDto,
  WarningUserParamsDto,
} from './warnings.dto';
import { WarningsService } from './warnings.service';

@Controller('admin/warnings')
@RequireRoles(ADMINISTRATOR_REQUIREMENT)
export class WarningsController {
  constructor(private readonly warnings: WarningsService) {}

  @Post()
  create(
    @CurrentUserId() actorId: string,
    @Body() dto: CreateWarningDto,
    @CurrentRequestId() requestId: string,
  ) {
    return this.warnings.create(actorId, dto, requestId);
  }

  @Get()
  list(@CurrentUserId() actorId: string, @Query() query: ListWarningsDto) {
    return this.warnings.list(actorId, query);
  }

  @Get(':id')
  findOne(
    @CurrentUserId() actorId: string,
    @Param() params: WarningIdParamsDto,
  ) {
    return this.warnings.findOne(actorId, params.id);
  }

  @Patch(':id/reversal')
  reverse(
    @CurrentUserId() actorId: string,
    @Param() params: WarningIdParamsDto,
    @Body() dto: ReverseWarningDto,
    @CurrentRequestId() requestId: string,
  ) {
    return this.warnings.reverse(actorId, params.id, dto.reason, requestId);
  }
}

@Controller('admin/users/:userId/warnings')
@RequireRoles(ADMINISTRATOR_REQUIREMENT)
export class UserWarningsController {
  constructor(private readonly warnings: WarningsService) {}

  @Get('summary')
  summary(
    @CurrentUserId() actorId: string,
    @Param() params: WarningUserParamsDto,
  ) {
    return this.warnings.summary(actorId, params.userId);
  }
}
