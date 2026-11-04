import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { AllowDisciplinaryAccess } from '../auth/disciplinary-access.decorator';
import { ADMINISTRATOR_REQUIREMENT } from '../authorization/authorization.policies';
import { RequireRoles } from '../authorization/require-roles.decorator';
import { CurrentRequestId } from '../common/http/current-request-id.decorator';
import { CurrentUserId } from '../common/http/current-user-id.decorator';
import { SanctionIdParamsDto } from '../sanctions/sanctions.dto';
import {
  AdminAppealFiltersDto,
  CreateAppealDto,
  OwnAppealFiltersDto,
  OwnWarningFiltersDto,
  ReviewAppealDto,
} from './appeals.dto';
import { AppealsService } from './appeals.service';

@Controller('account/appeals')
@AllowDisciplinaryAccess()
export class OwnAppealsController {
  constructor(private readonly appeals: AppealsService) {}

  @Post()
  create(
    @CurrentUserId() userId: string,
    @Body() dto: CreateAppealDto,
    @CurrentRequestId() requestId: string,
  ) {
    return this.appeals.create(userId, dto, requestId);
  }

  @Get()
  list(@CurrentUserId() userId: string, @Query() query: OwnAppealFiltersDto) {
    return this.appeals.listOwn(userId, query);
  }

  @Get(':id')
  findOne(
    @CurrentUserId() userId: string,
    @Param() params: SanctionIdParamsDto,
  ) {
    return this.appeals.findOwn(userId, params.id);
  }
}

@Controller('admin/appeals')
@RequireRoles(ADMINISTRATOR_REQUIREMENT)
export class AdminAppealsController {
  constructor(private readonly appeals: AppealsService) {}

  @Get()
  list(
    @CurrentUserId() actorId: string,
    @Query() query: AdminAppealFiltersDto,
  ) {
    return this.appeals.listAdmin(actorId, query);
  }

  @Get(':id')
  findOne(
    @CurrentUserId() actorId: string,
    @Param() params: SanctionIdParamsDto,
  ) {
    return this.appeals.findAdmin(actorId, params.id);
  }

  @Patch(':id/review')
  review(
    @CurrentUserId() actorId: string,
    @Param() params: SanctionIdParamsDto,
    @Body() dto: ReviewAppealDto,
    @CurrentRequestId() requestId: string,
  ) {
    return this.appeals.review(actorId, params.id, dto, requestId);
  }
}

@Controller('account/warnings')
@AllowDisciplinaryAccess()
export class OwnAppealWarningsController {
  constructor(private readonly appeals: AppealsService) {}

  @Get()
  list(@CurrentUserId() userId: string, @Query() query: OwnWarningFiltersDto) {
    return this.appeals.listWarningsOwn(userId, query);
  }

  @Get(':id')
  findOne(
    @CurrentUserId() userId: string,
    @Param() params: SanctionIdParamsDto,
  ) {
    return this.appeals.findWarningOwn(userId, params.id);
  }
}
