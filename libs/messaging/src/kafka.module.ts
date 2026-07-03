import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Kafka } from 'kafkajs';

import { KafkaHealthIndicator } from './kafka-health.indicator';
import { KafkaProducerService } from './kafka-producer.service';
import { KafkaTopicInitializer } from './kafka-topic-initializer.service';
import { KAFKA_CLIENT } from './kafka.tokens';

@Module({
  exports: [KAFKA_CLIENT, KafkaHealthIndicator, KafkaProducerService, KafkaTopicInitializer],
  imports: [ConfigModule],
  providers: [
    {
      inject: [ConfigService],
      provide: KAFKA_CLIENT,
      useFactory: (configService: ConfigService) =>
        new Kafka({
          brokers: configService.getOrThrow<string[]>('kafka.brokers'),
          clientId: configService.getOrThrow<string>('kafka.clientId'),
        }),
    },
    KafkaHealthIndicator,
    KafkaProducerService,
    KafkaTopicInitializer,
  ],
})
export class MessagingModule {}
