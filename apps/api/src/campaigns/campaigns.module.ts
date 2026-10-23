import { AuditModule } from '../audit/audit.module';
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { TablesModule } from '../tables/tables.module';
import {
  AdminCampaignsController,
  CampaignsController,
} from './campaigns.controller';
import { CampaignsService } from './campaigns.service';
import { CampaignInactivityService } from './campaign-inactivity.service';
import { StructuredLoggerService } from '../observability/structured-logger.service';

@Module({
  imports: [AuditModule, PrismaModule, TablesModule],
  controllers: [CampaignsController, AdminCampaignsController],
  providers: [
    CampaignsService,
    CampaignInactivityService,
    StructuredLoggerService,
  ],
  exports: [CampaignsService],
})
export class CampaignsModule {}
