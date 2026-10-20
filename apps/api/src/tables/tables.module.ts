import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { TableActorsService } from './table-actors.service';
import { TablesController } from './tables.controller';
import { TablesService } from './tables.service';

@Module({
  imports: [PrismaModule],
  controllers: [TablesController],
  providers: [TableActorsService, TablesService],
  exports: [TableActorsService],
})
export class TablesModule {}
