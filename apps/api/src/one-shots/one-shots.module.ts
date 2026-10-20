import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { TablesModule } from '../tables/tables.module';
import {
  AdminOneShotsController,
  OneShotsController,
} from './one-shots.controller';
import { OneShotsService } from './one-shots.service';

@Module({
  imports: [PrismaModule, TablesModule],
  controllers: [OneShotsController, AdminOneShotsController],
  providers: [OneShotsService],
})
export class OneShotsModule {}
