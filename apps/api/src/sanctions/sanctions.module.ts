import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { PrismaModule } from '../prisma/prisma.module';
import { StructuredLoggerService } from '../observability/structured-logger.service';
import {
  OwnSanctionsController,
  SanctionsController,
} from './sanctions.controller';
import { SanctionsService } from './sanctions.service';
import { SanctionExpirationService } from './sanction-expiration.service';
import { AppealsService } from '../appeals/appeals.service';
import {
  AdminAppealsController,
  OwnAppealsController,
  OwnAppealWarningsController,
} from '../appeals/appeals.controller';

@Module({
  imports: [AuditModule, AuthorizationModule, PrismaModule],
  controllers: [
    SanctionsController,
    OwnSanctionsController,
    AdminAppealsController,
    OwnAppealsController,
    OwnAppealWarningsController,
  ],
  providers: [
    SanctionsService,
    SanctionExpirationService,
    StructuredLoggerService,
    AppealsService,
  ],
})
export class SanctionsModule {}
