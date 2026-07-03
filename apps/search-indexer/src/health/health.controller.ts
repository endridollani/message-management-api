import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckResult, HealthCheckService } from '@nestjs/terminus';
import { KafkaHealthIndicator } from '@app/messaging';
import { RuntimeHealthIndicator } from '@app/observability';
import { ElasticsearchHealthIndicator } from '@app/search';

@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly runtimeHealthIndicator: RuntimeHealthIndicator,
    private readonly kafkaHealthIndicator: KafkaHealthIndicator,
    private readonly elasticsearchHealthIndicator: ElasticsearchHealthIndicator,
  ) {}

  @Get('liveness')
  @HealthCheck()
  liveness(): Promise<HealthCheckResult> {
    return this.health.check([() => this.runtimeHealthIndicator.isLive('search-indexer')]);
  }

  @Get('readiness')
  @HealthCheck()
  readiness(): Promise<HealthCheckResult> {
    return this.health.check([
      () => this.runtimeHealthIndicator.isReady('search-indexer', ['kafka', 'elasticsearch']),
      () => this.kafkaHealthIndicator.isReady(),
      () => this.elasticsearchHealthIndicator.isWriteReady(),
    ]);
  }
}
