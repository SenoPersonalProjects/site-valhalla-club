import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { CurrentRequestId } from '../common/http/current-request-id.decorator';
import { CurrentUserId } from '../common/http/current-user-id.decorator';
import {
  AddParticipantDto,
  CancelParticipationDto,
  ParticipantParamsDto,
  RecordAttendanceDto,
  SessionParticipationParamsDto,
} from './participation.dto';
import { ParticipationService } from './participation.service';

@Controller('sessions/:sessionId/participants')
export class ParticipationController {
  constructor(private readonly participation: ParticipationService) {}

  @Get()
  list(
    @Param() params: SessionParticipationParamsDto,
    @CurrentUserId() actorId: string,
    @Query() query: PaginationQueryDto,
  ) {
    return this.participation.list(params.sessionId, actorId, query);
  }

  @Post()
  add(
    @Param() params: SessionParticipationParamsDto,
    @CurrentUserId() actorId: string,
    @Body() dto: AddParticipantDto,
    @CurrentRequestId() requestId: string,
  ) {
    return this.participation.add(
      params.sessionId,
      actorId,
      dto.userId,
      requestId,
    );
  }

  @Patch(':userId/attendance')
  recordAttendance(
    @Param() params: ParticipantParamsDto,
    @CurrentUserId() actorId: string,
    @Body() dto: RecordAttendanceDto,
    @CurrentRequestId() requestId: string,
  ) {
    return this.participation.recordAttendance(
      params.sessionId,
      params.userId,
      actorId,
      dto,
      requestId,
    );
  }

  @Patch(':userId/cancellation')
  cancel(
    @Param() params: ParticipantParamsDto,
    @CurrentUserId() actorId: string,
    @Body() dto: CancelParticipationDto,
    @CurrentRequestId() requestId: string,
  ) {
    return this.participation.cancel(
      params.sessionId,
      params.userId,
      actorId,
      dto.reason,
      requestId,
    );
  }
}
