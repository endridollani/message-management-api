import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckResult, HealthCheckService } from '@nestjs/terminus';
import { KafkaHealthIndicator } from '@app/messaging';
import { RuntimeHealthIndicator } from '@app/observability';
import { MongoHealthIndicator } from '@app/persistence';

@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly runtimeHealthIndicator: RuntimeHealthIndicator,
    private readonly mongoHealthIndicator: MongoHealthIndicator,
    private readonly kafkaHealthIndicator: KafkaHealthIndicator,
  ) {}

  @Get('liveness')
  @HealthCheck()
  liveness(): Promise<HealthCheckResult> {
    return this.health.check([() => this.runtimeHealthIndicator.isLive('outbox-publisher')]);
  }

  @Get('readiness')
  @HealthCheck()
  readiness(): Promise<HealthCheckResult> {
    return this.health.check([
      () => this.runtimeHealthIndicator.isReady('outbox-publisher', ['mongodb', 'kafka']),
      () => this.mongoHealthIndicator.isReady(),
      () => this.kafkaHealthIndicator.isReady(),
    ]);
  }
}
