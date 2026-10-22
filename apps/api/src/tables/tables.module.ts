import { AuthorizationModule } from '../authorization/authorization.module';
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { TableActorsService } from './table-actors.service';
import { TableRulesService } from './table-rules.service';
import { TablesController } from './tables.controller';
import { TablesService } from './tables.service';

@Module({
  imports: [PrismaModule, AuthorizationModule],
  controllers: [TablesController],
  providers: [TableActorsService, TableRulesService, TablesService],
  exports: [TableActorsService, TableRulesService],
})
export class TablesModule {}
