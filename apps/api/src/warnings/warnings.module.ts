import { Module } from '@nestjs/common';
import { AuthorizationModule } from '../authorization/authorization.module';
import { AuditModule } from '../audit/audit.module';
import { PrismaModule } from '../prisma/prisma.module';
import { StructuredLoggerService } from '../observability/structured-logger.service';
import { DisciplinaryCategoriesController } from './disciplinary-categories.controller';
import { DisciplinaryCategoriesService } from './disciplinary-categories.service';
import {
  UserWarningsController,
  WarningsController,
} from './warnings.controller';
import { WarningsService } from './warnings.service';
import { WarningExpirationService } from './warning-expiration.service';

@Module({
  imports: [PrismaModule, AuthorizationModule, AuditModule],
  controllers: [
    DisciplinaryCategoriesController,
    WarningsController,
    UserWarningsController,
  ],
  providers: [
    DisciplinaryCategoriesService,
    WarningsService,
    WarningExpirationService,
    StructuredLoggerService,
  ],
})
export class WarningsModule {}
