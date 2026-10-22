import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
  ValidationPipe,
  BadRequestException,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { CampaignsModule } from './campaigns/campaigns.module';
import { OneShotsModule } from './one-shots/one-shots.module';
import { ApiExceptionFilter } from './observability/api-exception.filter';
import { HttpLoggingInterceptor } from './observability/http-logging.interceptor';
import { RequestIdMiddleware } from './observability/request-id.middleware';
import { StructuredLoggerService } from './observability/structured-logger.service';
import { PrismaModule } from './prisma/prisma.module';
import { SessionsModule } from './sessions/sessions.module';
import { TablesModule } from './tables/tables.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    TablesModule,
    CampaignsModule,
    SessionsModule,
    OneShotsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    StructuredLoggerService,
    {
      provide: APP_INTERCEPTOR,
      useClass: HttpLoggingInterceptor,
    },
    {
      provide: APP_FILTER,
      useClass: ApiExceptionFilter,
    },
    {
      provide: APP_PIPE,
      useFactory: () =>
        new ValidationPipe({
          transform: true,
          whitelist: true,
          forbidNonWhitelisted: true,
          // Constraint messages may echo attacker-controlled property names.
          exceptionFactory: () =>
            new BadRequestException({
              code: 'BAD_REQUEST',
              message: 'Dados de entrada inválidos',
            }),
        }),
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes({
      path: '{*path}',
      method: RequestMethod.ALL,
    });
  }
}
