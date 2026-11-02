import { AuditModule } from '../audit/audit.module';
import { Module } from '@nestjs/common';
import { ParticipationModule } from '../participation/participation.module';
import { PrismaModule } from '../prisma/prisma.module';
import { TablesModule } from '../tables/tables.module';
import {
  AdminOneShotsController,
  OneShotsController,
} from './one-shots.controller';
import { OneShotsService } from './one-shots.service';

@Module({
  imports: [AuditModule, PrismaModule, TablesModule, ParticipationModule],
  controllers: [OneShotsController, AdminOneShotsController],
  providers: [OneShotsService],
})
export class OneShotsModule {}
