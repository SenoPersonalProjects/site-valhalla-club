import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PrismaModule } from '../prisma/prisma.module';
import { TablesModule } from '../tables/tables.module';
import { ParticipationController } from './participation.controller';
import { ParticipationService } from './participation.service';

@Module({
  imports: [AuditModule, PrismaModule, TablesModule],
  controllers: [ParticipationController],
  providers: [ParticipationService],
  exports: [ParticipationService],
})
export class ParticipationModule {}
