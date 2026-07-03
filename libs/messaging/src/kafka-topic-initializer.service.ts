import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { Kafka } from 'kafkajs';

import { KAFKA_TOPIC_DEFINITIONS } from './kafka.constants';
import { KAFKA_CLIENT } from './kafka.tokens';

@Injectable()
export class KafkaTopicInitializer implements OnModuleInit {
  private readonly logger = new Logger(KafkaTopicInitializer.name);

  constructor(@Inject(KAFKA_CLIENT) private readonly kafka: Kafka) {}

  async onModuleInit(): Promise<void> {
    await this.initializeTopics();
  }

  async initializeTopics(): Promise<void> {
    const admin = this.kafka.admin();
    await admin.connect();

    try {
      const existingTopics = new Set(await admin.listTopics());
      const missingTopics = KAFKA_TOPIC_DEFINITIONS.filter(
        (definition) => !existingTopics.has(definition.topic),
      );

      if (missingTopics.length === 0) {
        this.logger.log({
          created: false,
          topics: KAFKA_TOPIC_DEFINITIONS.map((definition) => definition.topic),
        });
        return;
      }

      const created = await admin.createTopics({
        topics: missingTopics.map((definition) => ({
          numPartitions: definition.numPartitions,
          topic: definition.topic,
        })),
        waitForLeaders: true,
      });

      this.logger.log({
        created,
        topics: missingTopics.map((definition) => definition.topic),
      });
    } finally {
      await admin.disconnect();
    }
  }
}
