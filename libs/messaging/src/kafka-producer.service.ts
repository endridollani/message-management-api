import {
  Inject,
  Injectable,
  Logger,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import { Partitioners } from 'kafkajs';
import type { IHeaders, Kafka, Producer } from 'kafkajs';

import { KAFKA_CLIENT } from './kafka.tokens';

export type PublishJsonMessageInput = {
  topic: string;
  key: string;
  payload: unknown;
  headers?: Record<string, string>;
};

@Injectable()
export class KafkaProducerService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(KafkaProducerService.name);
  private producer?: Producer;
  private connected = false;

  constructor(@Inject(KAFKA_CLIENT) private readonly kafka: Kafka) {}

  async onModuleInit(): Promise<void> {
    this.producer = this.kafka.producer({
      allowAutoTopicCreation: false,
      createPartitioner: Partitioners.DefaultPartitioner,
    });
    await this.producer.connect();
    this.connected = true;
    this.logger.log('Kafka producer connected');
  }

  async onApplicationShutdown(): Promise<void> {
    if (!this.producer || !this.connected) {
      return;
    }

    await this.producer.disconnect();
    this.connected = false;
    this.logger.log('Kafka producer disconnected');
  }

  isReady(): boolean {
    return this.connected;
  }

  async publishJson(input: PublishJsonMessageInput): Promise<void> {
    if (!this.producer || !this.connected) {
      throw new Error('Kafka producer is not connected');
    }

    await this.producer.send({
      acks: -1,
      messages: [
        {
          headers: encodeHeaders(input.headers),
          key: input.key,
          value: JSON.stringify(input.payload),
        },
      ],
      topic: input.topic,
    });
  }
}

function encodeHeaders(headers: Record<string, string> | undefined): IHeaders | undefined {
  if (!headers) {
    return undefined;
  }

  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key, Buffer.from(value)]),
  );
}
