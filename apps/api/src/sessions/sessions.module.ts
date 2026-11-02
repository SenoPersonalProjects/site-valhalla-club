import { Module } from '@nestjs/common';
import { ParticipationModule } from '../participation/participation.module';
import { PrismaModule } from '../prisma/prisma.module';
import { TablesModule } from '../tables/tables.module';
import {
  CampaignSessionsController,
  SessionsController,
} from './sessions.controller';
import { SessionsService } from './sessions.service';

@Module({
  imports: [PrismaModule, TablesModule, ParticipationModule],
  controllers: [CampaignSessionsController, SessionsController],
  providers: [SessionsService],
})
export class SessionsModule {}
