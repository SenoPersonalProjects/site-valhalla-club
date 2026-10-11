import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { TablesModule } from '../tables/tables.module';
import {
  CampaignSessionsController,
  SessionsController,
} from './sessions.controller';
import { SessionsService } from './sessions.service';

@Module({
  imports: [PrismaModule, TablesModule],
  controllers: [CampaignSessionsController, SessionsController],
  providers: [SessionsService],
})
export class SessionsModule {}
