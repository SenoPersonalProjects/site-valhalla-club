import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { ADMINISTRATOR_REQUIREMENT } from '../authorization/authorization.policies';
import { RequireRoles } from '../authorization/require-roles.decorator';
import { CurrentUserId } from '../common/http/current-user-id.decorator';
import { CurrentRequestId } from '../common/http/current-request-id.decorator';
import {
  CreateFeedbackDto,
  FeedbackParamsDto,
  FeedbackSessionParamsDto,
  ListFeedbacksDto,
  HideFeedbackDto,
  UpdateFeedbackDto,
} from './feedback.dto';
import { FeedbacksService } from './feedbacks.service';
import { FeedbacksQueryService } from './feedbacks-query.service';
import { FeedbacksManagementService } from './feedbacks-management.service';

@Controller('sessions/:sessionId/feedbacks')
export class FeedbacksController {
  constructor(
    private readonly feedbacks: FeedbacksService,
    private readonly queries: FeedbacksQueryService,
  ) {}

  @Get('public')
  @Public()
  listPublic(
    @Param() params: FeedbackSessionParamsDto,
    @Query() query: ListFeedbacksDto,
  ) {
    return this.queries.listPublic(params.sessionId, query);
  }

  @Get()
  listPersonal(
    @Param() params: FeedbackSessionParamsDto,
    @CurrentUserId() actorId: string,
    @Query() query: ListFeedbacksDto,
  ) {
    return this.queries.listPersonal(params.sessionId, actorId, query);
  }

  @Post()
  create(
    @Param() params: FeedbackSessionParamsDto,
    @CurrentUserId() authorId: string,
    @Body() dto: CreateFeedbackDto,
  ) {
    return this.feedbacks.create(params.sessionId, authorId, dto);
  }
}

@Controller('feedbacks')
export class PersonalFeedbacksController {
  constructor(
    private readonly queries: FeedbacksQueryService,
    private readonly management: FeedbacksManagementService,
  ) {}

  @Patch(':id')
  update(
    @Param() params: FeedbackParamsDto,
    @CurrentUserId() actorId: string,
    @Body() dto: UpdateFeedbackDto,
  ) {
    return this.management.update(params.id, actorId, dto);
  }

  @Get(':id')
  findPersonal(
    @Param() params: FeedbackParamsDto,
    @CurrentUserId() actorId: string,
  ) {
    return this.queries.findPersonal(params.id, actorId);
  }
}

@Controller('admin')
@RequireRoles(ADMINISTRATOR_REQUIREMENT)
export class AdminFeedbacksController {
  constructor(
    private readonly queries: FeedbacksQueryService,
    private readonly management: FeedbacksManagementService,
  ) {}

  @Patch('feedbacks/:id/hide')
  hide(
    @Param() params: FeedbackParamsDto,
    @CurrentUserId() actorId: string,
    @Body() dto: HideFeedbackDto,
    @CurrentRequestId() requestId: string,
  ) {
    return this.management.hide(params.id, actorId, dto, requestId);
  }

  @Get('sessions/:sessionId/feedbacks')
  listAdministrative(
    @Param() params: FeedbackSessionParamsDto,
    @CurrentUserId() actorId: string,
    @Query() query: ListFeedbacksDto,
  ) {
    return this.queries.listAdministrative(params.sessionId, actorId, query);
  }

  @Get('feedbacks/:id')
  findAdministrative(
    @Param() params: FeedbackParamsDto,
    @CurrentUserId() actorId: string,
  ) {
    return this.queries.findAdministrative(params.id, actorId);
  }
}
