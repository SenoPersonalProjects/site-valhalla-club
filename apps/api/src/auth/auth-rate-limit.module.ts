import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { Request } from 'express';
import {
  AUTH_RATE_LIMITS,
  AuthRateLimitGuard,
  AuthRateTracker,
} from './auth-rate-limit';

@Module({
  imports: [ConfigModule],
  providers: [AuthRateTracker],
  exports: [AuthRateTracker],
})
class AuthRateTrackerModule {}

@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      imports: [AuthRateTrackerModule],
      inject: [AuthRateTracker],
      useFactory: (tracker: AuthRateTracker) => ({
        setHeaders: false,
        throttlers: [
          {
            name: 'aggregate',
            ...AUTH_RATE_LIMITS.login.aggregate,
            getTracker: () => 'endpoint',
          },
          {
            name: 'individual',
            ...AUTH_RATE_LIMITS.login.individual,
            getTracker: (request, context) =>
              tracker.tracker(
                request as Request,
                context.getHandler().name === 'register' ? 'register' : 'login',
              ),
          },
        ],
      }),
    }),
  ],
  providers: [AuthRateLimitGuard],
  exports: [AuthRateLimitGuard, ThrottlerModule],
})
export class AuthRateLimitModule {}
