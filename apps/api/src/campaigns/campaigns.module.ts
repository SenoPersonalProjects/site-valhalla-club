import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { TablesModule } from '../tables/tables.module';
import {
  AdminCampaignsController,
  CampaignsController,
} from './campaigns.controller';
import { CampaignsService } from './campaigns.service';

@Module({
  imports: [PrismaModule, TablesModule],
  controllers: [CampaignsController, AdminCampaignsController],
  providers: [CampaignsService],
  exports: [CampaignsService],
})
export class CampaignsModule {}
