import { CurrentRequestId } from '../common/http/current-request-id.decorator';
import { RequireRoles } from '../authorization/require-roles.decorator';
import {
  ADMINISTRATOR_REQUIREMENT,
  MASTER_REQUIREMENT,
} from '../authorization/authorization.policies';
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
import { CampaignsService } from './campaigns.service';
import { ChangeCampaignStatusDto } from './dto/change-campaign-status.dto';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { ReviewCampaignDto } from './dto/review-campaign.dto';
import { UpdateCampaignDto } from './dto/update-campaign.dto';

@Controller('campaigns')
export class CampaignsController {
  constructor(private readonly campaignsService: CampaignsService) {}

  @Post()
  @RequireRoles(MASTER_REQUIREMENT)
  create(@CurrentUserId() userId: string, @Body() dto: CreateCampaignDto) {
    return this.campaignsService.create(userId, dto);
  }

  @Get('public')
  @Public()
  findPublic(@Query() query: PaginationQueryDto) {
    return this.campaignsService.findPublic(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUserId() userId: string) {
    return this.campaignsService.findOne(id, userId);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @CurrentUserId() userId: string,
    @Body() dto: UpdateCampaignDto,
  ) {
    return this.campaignsService.update(id, userId, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('id') id: string,
    @CurrentUserId() userId: string,
  ): Promise<void> {
    return this.campaignsService.remove(id, userId);
  }

  @Post(':id/publish')
  publish(@Param('id') id: string, @CurrentUserId() userId: string) {
    return this.campaignsService.publish(id, userId);
  }

  @Patch(':id/status')
  changeStatus(
    @Param('id') id: string,
    @CurrentUserId() userId: string,
    @Body() dto: ChangeCampaignStatusDto,
  ) {
    return this.campaignsService.changeStatus(id, userId, dto);
  }
}

@Controller('admin/campaigns')
@RequireRoles(ADMINISTRATOR_REQUIREMENT)
export class AdminCampaignsController {
  constructor(private readonly campaignsService: CampaignsService) {}

  @Patch(':id/approval')
  review(
    @Param('id') id: string,
    @CurrentUserId() reviewerId: string,
    @Body() dto: ReviewCampaignDto,
    @CurrentRequestId() requestId: string,
  ) {
    return this.campaignsService.review(id, reviewerId, dto, requestId);
  }
}
