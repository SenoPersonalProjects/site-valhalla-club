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
  Query,
} from '@nestjs/common';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { Public } from '../auth/public.decorator';
import { CurrentUserId } from '../common/http/current-user-id.decorator';
import { ChangeOneShotStatusDto } from './dto/change-one-shot-status.dto';
import { CreateOneShotDto } from './dto/create-one-shot.dto';
import { CorrectOneShotDto } from './dto/correct-one-shot.dto';
import { ReviewOneShotDto } from './dto/review-one-shot.dto';
import { UpdateOneShotDto } from './dto/update-one-shot.dto';
import { OneShotsService } from './one-shots.service';

@Controller('one-shots')
export class OneShotsController {
  constructor(private readonly oneShotsService: OneShotsService) {}

  @Post()
  create(@CurrentUserId() userId: string, @Body() dto: CreateOneShotDto) {
    return this.oneShotsService.create(userId, dto);
  }

  @Get('public')
  @Public()
  findPublic(@Query() query: PaginationQueryDto) {
    return this.oneShotsService.findPublic(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUserId() userId: string) {
    return this.oneShotsService.findOne(id, userId);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @CurrentUserId() userId: string,
    @Body() dto: UpdateOneShotDto,
  ) {
    return this.oneShotsService.update(id, userId, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('id') id: string,
    @CurrentUserId() userId: string,
  ): Promise<void> {
    return this.oneShotsService.remove(id, userId);
  }

  @Post(':id/publish')
  publish(@Param('id') id: string, @CurrentUserId() userId: string) {
    return this.oneShotsService.publish(id, userId);
  }

  @Patch(':id/status')
  changeStatus(
    @Param('id') id: string,
    @CurrentUserId() userId: string,
    @Body() dto: ChangeOneShotStatusDto,
  ) {
    return this.oneShotsService.changeStatus(id, userId, dto);
  }
}

@Controller('admin/one-shots')
export class AdminOneShotsController {
  constructor(private readonly oneShotsService: OneShotsService) {}

  @Patch(':id/correction')
  correct(
    @Param('id') id: string,
    @CurrentUserId() userId: string,
    @Body() dto: CorrectOneShotDto,
  ) {
    return this.oneShotsService.correct(id, userId, dto);
  }

  @Patch(':id/approval')
  review(
    @Param('id') id: string,
    @CurrentUserId() reviewerId: string,
    @Body() dto: ReviewOneShotDto,
  ) {
    return this.oneShotsService.review(id, reviewerId, dto);
  }
}
