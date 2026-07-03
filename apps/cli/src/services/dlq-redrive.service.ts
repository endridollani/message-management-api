import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kafka, Partitioners } from 'kafkajs';
import type { Consumer, EachMessagePayload, KafkaMessage, Producer } from 'kafkajs';

import { MESSAGE_CREATED_TOPIC } from '@app/domain';
import { MESSAGE_CREATED_DLQ_TOPIC } from '@app/messaging';

const DLQ_REDRIVE_GROUP = 'message-management-api.cli.dlq-redrive';

export type DlqRedriveInput = {
  dryRun: boolean;
  idleTimeoutMs: number;
  limit: number;
};

export type DlqRedriveResult = {
  consumedCount: number;
  republishedCount: number;
  committedCount: number;
  stopReason: 'idle-timeout' | 'limit-reached';
};

@Injectable()
export class DlqRedriveService {
  constructor(private readonly configService: ConfigService) {}

  async redrive(input: DlqRedriveInput): Promise<DlqRedriveResult> {
    const kafka = new Kafka({
      brokers: this.configService.getOrThrow<string[]>('kafka.brokers'),
      clientId: this.configService.getOrThrow<string>('kafka.clientId'),
    });
    const consumer = kafka.consumer({ groupId: DLQ_REDRIVE_GROUP });
    const producer = kafka.producer({
      allowAutoTopicCreation: false,
      createPartitioner: Partitioners.DefaultPartitioner,
    });

    let consumedCount = 0;
    let republishedCount = 0;
    let committedCount = 0;
    let stopReason: DlqRedriveResult['stopReason'] = 'idle-timeout';

    await consumer.connect();
    if (!input.dryRun) {
      await producer.connect();
    }

    try {
      await consumer.subscribe({
        fromBeginning: true,
        topic: MESSAGE_CREATED_DLQ_TOPIC,
      });

      await this.consumeUntilDone({
        consumer,
        handlePayload: async (payload) => {
          consumedCount += 1;

          if (!input.dryRun) {
            await republishDlqMessage(producer, payload.message);
            republishedCount += 1;
            await consumer.commitOffsets([
              {
                offset: nextOffset(payload.message.offset),
                partition: payload.partition,
                topic: payload.topic,
              },
            ]);
            committedCount += 1;
          }

          if (consumedCount >= input.limit) {
            stopReason = 'limit-reached';
            return true;
          }

          return false;
        },
        idleTimeoutMs: input.idleTimeoutMs,
      });
    } finally {
      await Promise.all([
        consumer.disconnect().catch(() => undefined),
        producer.disconnect().catch(() => undefined),
      ]);
    }

    return {
      committedCount,
      consumedCount,
      republishedCount,
      stopReason,
    };
  }

  private consumeUntilDone(input: {
    consumer: Consumer;
    handlePayload: (payload: EachMessagePayload) => Promise<boolean>;
    idleTimeoutMs: number;
  }): Promise<void> {
    return new Promise((resolve, reject) => {
      let done = false;
      let idleTimer: NodeJS.Timeout | undefined;

      const finish = (error?: unknown): void => {
        if (done) {
          return;
        }

        done = true;
        if (idleTimer) {
          clearTimeout(idleTimer);
        }

        input.consumer
          .stop()
          .catch(() => undefined)
          .finally(() => {
            if (error) {
              reject(toError(error));
              return;
            }

            resolve();
          });
      };

      const resetIdleTimer = (): void => {
        if (idleTimer) {
          clearTimeout(idleTimer);
        }

        idleTimer = setTimeout(() => {
          finish();
        }, input.idleTimeoutMs);
      };

      resetIdleTimer();
      input.consumer
        .run({
          autoCommit: false,
          eachMessage: async (payload) => {
            resetIdleTimer();
            const shouldStop = await input.handlePayload(payload);

            if (shouldStop) {
              finish();
            }
          },
        })
        .catch((error: unknown) => {
          finish(error);
        });
    });
  }
}

async function republishDlqMessage(producer: Producer, message: KafkaMessage): Promise<void> {
  await producer.send({
    acks: -1,
    messages: [
      {
        key: message.key,
        value: message.value,
      },
    ],
    topic: MESSAGE_CREATED_TOPIC,
  });
}

function nextOffset(offset: string): string {
  return (BigInt(offset) + 1n).toString();
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
