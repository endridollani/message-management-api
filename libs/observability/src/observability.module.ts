import { Global, MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TerminusModule } from '@nestjs/terminus';
import { LoggerModule } from 'nestjs-pino';

import { CorrelationIdContext } from './correlation/correlation-id-context.service';
import { CorrelationIdMiddleware } from './correlation/correlation-id.middleware';
import { RuntimeHealthIndicator } from './health/runtime-health.indicator';
import { createPinoLoggerParams } from './logger/pino-options.factory';
import { MetricsModule } from './metrics/metrics.module';

@Global()
@Module({
  exports: [
    CorrelationIdContext,
    CorrelationIdMiddleware,
    LoggerModule,
    MetricsModule,
    RuntimeHealthIndicator,
    TerminusModule,
  ],
  imports: [
    LoggerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: createPinoLoggerParams,
    }),
    MetricsModule,
    TerminusModule,
  ],
  providers: [CorrelationIdContext, CorrelationIdMiddleware, RuntimeHealthIndicator],
})
export class ObservabilityModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
  }
}
