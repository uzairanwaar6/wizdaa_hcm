import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import configuration from './config/configuration';
import { buildTypeOrmOptions } from './database/database.config';
import { AllExceptionsFilter } from './filters/all-exceptions.filter';
import { RequestLoggerMiddleware } from './middlewares/request-logger.middleware';
import { HealthModule } from './routes/health.module';
import { BalancesModule } from './routes/balances.module';
import { TimeOffModule } from './routes/time-off.module';
import { HcmModule } from './routes/hcm.module';
import { SyncModule } from './routes/sync.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: buildTypeOrmOptions,
    }),
    HealthModule,
    HcmModule,
    BalancesModule,
    TimeOffModule,
    SyncModule,
  ],
  providers: [
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestLoggerMiddleware).forRoutes('*');
  }
}
