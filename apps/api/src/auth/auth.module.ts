import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from '../prisma/prisma.module';
import { TablesModule } from '../tables/tables.module';
import { jwtConfiguration } from './auth.config';
import {
  AuthController,
  RegistrationReviewController,
} from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';

@Module({
  imports: [
    PrismaModule,
    TablesModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: jwtConfiguration,
    }),
  ],
  controllers: [AuthController, RegistrationReviewController],
  providers: [
    AuthService,
    PasswordService,
    AuthGuard,
    { provide: APP_GUARD, useExisting: AuthGuard },
  ],
  exports: [JwtModule],
})
export class AuthModule {}
