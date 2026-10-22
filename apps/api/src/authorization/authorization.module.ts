import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthorizationGuard } from './authorization.guard';
import { AuthorizationService } from './authorization.service';

@Module({
  imports: [PrismaModule],
  providers: [AuthorizationService, AuthorizationGuard],
  exports: [AuthorizationService, AuthorizationGuard],
})
export class AuthorizationModule {}
