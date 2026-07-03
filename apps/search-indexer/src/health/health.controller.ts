import { Controller, Get } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckError,
  HealthCheckResult,
  HealthCheckService,
  HealthIndicatorResult,
  HealthIndicatorService,
} from '@nestjs/terminus';
import { KafkaHealthIndicator, MESSAGE_CREATED_SEARCH_INDEXER_GROUP } from '@app/messaging';
import { RuntimeHealthIndicator } from '@app/observability';
import { ElasticsearchHealthIndicator } from '@app/search';

import { MessageCreatedConsumer } from '../message-created.consumer';

@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly healthIndicatorService: HealthIndicatorService,
    private readonly runtimeHealthIndicator: RuntimeHealthIndicator,
    private readonly kafkaHealthIndicator: KafkaHealthIndicator,
    private readonly elasticsearchHealthIndicator: ElasticsearchHealthIndicator,
    private readonly messageCreatedConsumer: MessageCreatedConsumer,
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
      () => this.consumerRunnerReady(),
    ]);
  }

  private consumerRunnerReady(): HealthIndicatorResult<'consumer'> {
    const indicator = this.healthIndicatorService.check('consumer');

    if (this.messageCreatedConsumer.isRunning()) {
      return indicator.up({ group: MESSAGE_CREATED_SEARCH_INDEXER_GROUP });
    }

    throw new HealthCheckError(
      'Search indexer consumer is not running',
      indicator.down({ group: MESSAGE_CREATED_SEARCH_INDEXER_GROUP }),
    );
  }
}
