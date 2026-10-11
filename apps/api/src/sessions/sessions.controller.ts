import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { CurrentUserId } from '../common/http/current-user-id.decorator';
import { ChangeSessionStatusDto } from './dto/change-session-status.dto';
import { CreateSessionDto } from './dto/create-session.dto';
import { UpdateSessionDto } from './dto/update-session.dto';
import { SessionsService } from './sessions.service';

@Controller('campaigns/:campaignId/sessions')
export class CampaignSessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

  @Post()
  create(
    @Param('campaignId') campaignId: string,
    @CurrentUserId() userId: string,
    @Body() dto: CreateSessionDto,
  ) {
    return this.sessionsService.createForCampaign(campaignId, userId, dto);
  }

  @Get()
  findForCampaign(
    @Param('campaignId') campaignId: string,
    @CurrentUserId() userId: string,
  ) {
    return this.sessionsService.findForCampaign(campaignId, userId);
  }
}

@Controller('sessions')
export class SessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUserId() userId: string) {
    return this.sessionsService.findOne(id, userId);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @CurrentUserId() userId: string,
    @Body() dto: UpdateSessionDto,
  ) {
    return this.sessionsService.update(id, userId, dto);
  }

  @Patch(':id/status')
  changeStatus(
    @Param('id') id: string,
    @CurrentUserId() userId: string,
    @Body() dto: ChangeSessionStatusDto,
  ) {
    return this.sessionsService.changeStatus(id, userId, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('id') id: string,
    @CurrentUserId() userId: string,
  ): Promise<void> {
    return this.sessionsService.remove(id, userId);
  }
}
