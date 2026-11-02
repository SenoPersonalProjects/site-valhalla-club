import { Module } from '@nestjs/common';
import { AuthorizationModule } from '../authorization/authorization.module';
import { AuditModule } from '../audit/audit.module';
import { PrismaModule } from '../prisma/prisma.module';
import { TablesModule } from '../tables/tables.module';
import {
  AdminFeedbacksController,
  FeedbacksController,
  PersonalFeedbacksController,
} from './feedbacks.controller';
import { FeedbacksService } from './feedbacks.service';
import { FeedbacksQueryService } from './feedbacks-query.service';
import { FeedbacksManagementService } from './feedbacks-management.service';

@Module({
  imports: [PrismaModule, AuthorizationModule, TablesModule, AuditModule],
  controllers: [
    FeedbacksController,
    PersonalFeedbacksController,
    AdminFeedbacksController,
  ],
  providers: [
    FeedbacksService,
    FeedbacksQueryService,
    FeedbacksManagementService,
  ],
})
export class FeedbacksModule {}
