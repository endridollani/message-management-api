import { Inject, Injectable } from '@nestjs/common';
import {
  HealthCheckError,
  HealthIndicatorResult,
  HealthIndicatorService,
} from '@nestjs/terminus';
import type { Kafka } from 'kafkajs';

import { MESSAGE_CREATED_TOPIC } from '@app/domain';

import { KAFKA_CLIENT } from './kafka.tokens';

@Injectable()
export class KafkaHealthIndicator {
  constructor(
    @Inject(KAFKA_CLIENT) private readonly kafka: Kafka,
    private readonly healthIndicatorService: HealthIndicatorService,
  ) {}

  async isReady(): Promise<HealthIndicatorResult<'kafka'>> {
    const indicator = this.healthIndicatorService.check('kafka');
    const admin = this.kafka.admin();

    try {
      await admin.connect();
      await admin.fetchTopicMetadata({ topics: [MESSAGE_CREATED_TOPIC] });

      return indicator.up({ topics: [MESSAGE_CREATED_TOPIC] });
    } catch (error) {
      throw new HealthCheckError(
        'Kafka is not ready',
        indicator.down({
          error: error instanceof Error ? error.message : String(error),
          topics: [MESSAGE_CREATED_TOPIC],
        }),
      );
    } finally {
      await admin.disconnect().catch(() => undefined);
    }
  }
}
