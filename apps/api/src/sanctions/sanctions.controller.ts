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
  CreateSanctionDto,
  ReverseSanctionDto,
  SanctionFiltersDto,
  SanctionIdParamsDto,
} from './sanctions.dto';
import { SanctionsService } from './sanctions.service';
import { AllowDisciplinaryAccess } from '../auth/disciplinary-access.decorator';
import { OwnSanctionFiltersDto } from './sanctions.dto';

@Controller('admin/sanctions')
@RequireRoles(ADMINISTRATOR_REQUIREMENT)
export class SanctionsController {
  constructor(private readonly sanctions: SanctionsService) {}

  @Post()
  create(
    @CurrentUserId() actorId: string,
    @Body() dto: CreateSanctionDto,
    @CurrentRequestId() requestId: string,
  ) {
    return this.sanctions.create(actorId, dto, requestId);
  }

  @Get()
  list(@CurrentUserId() actorId: string, @Query() query: SanctionFiltersDto) {
    return this.sanctions.list(actorId, query);
  }

  @Get(':id')
  findOne(
    @CurrentUserId() actorId: string,
    @Param() params: SanctionIdParamsDto,
  ) {
    return this.sanctions.findOne(actorId, params.id);
  }

  @Patch(':id/reversal')
  reverse(
    @CurrentUserId() actorId: string,
    @Param() params: SanctionIdParamsDto,
    @Body() dto: ReverseSanctionDto,
    @CurrentRequestId() requestId: string,
  ) {
    return this.sanctions.reverse(actorId, params.id, dto, requestId);
  }
}

@Controller('account/sanctions')
export class OwnSanctionsController {
  constructor(private readonly sanctions: SanctionsService) {}

  @Get()
  @AllowDisciplinaryAccess()
  list(@CurrentUserId() userId: string, @Query() query: OwnSanctionFiltersDto) {
    return this.sanctions.listOwn(userId, query);
  }

  @Get(':id')
  @AllowDisciplinaryAccess()
  findOne(
    @CurrentUserId() userId: string,
    @Param() params: SanctionIdParamsDto,
  ) {
    return this.sanctions.findOwn(userId, params.id);
  }
}
