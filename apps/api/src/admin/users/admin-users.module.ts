import { AuditModule } from '../../audit/audit.module';
import { Module } from '@nestjs/common';
import { AuthorizationModule } from '../../authorization/authorization.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { AdminUsersController } from './admin-users.controller';
import { AdminUsersService } from './admin-users.service';

@Module({
  imports: [AuditModule, PrismaModule, AuthorizationModule],
  controllers: [AdminUsersController],
  providers: [AdminUsersService],
})
export class AdminUsersModule {}
