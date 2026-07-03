import { Inject, Injectable, Logger, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import {
  MESSAGE_CREATED_DLQ_TOPIC,
  MESSAGE_CREATED_SEARCH_INDEXER_GROUP,
  KafkaProducerService,
  KAFKA_CLIENT,
} from '@app/messaging';
import {
  MESSAGE_CREATED_EVENT_TYPE,
  MESSAGE_CREATED_EVENT_VERSION,
  MESSAGE_CREATED_TOPIC,
  MESSAGE_SEARCH,
} from '@app/domain';
import type { MessageCreatedEvent, MessageSearchPort, SearchMessageDocument } from '@app/domain';
import { MetricsService } from '@app/observability';
import type { Consumer, EachMessagePayload, IHeaders, Kafka } from 'kafkajs';

const MAX_INDEX_ATTEMPTS = 5;
const BASE_INDEX_RETRY_DELAY_MS = 250;
const MAX_INDEX_RETRY_DELAY_MS = 8_000;

type ParsedEvent =
  | {
      kind: 'message-created';
      event: MessageCreatedEvent;
    }
  | {
      kind: 'unknown-version';
      eventType: string;
      eventVersion: number;
    };

@Injectable()
export class MessageCreatedConsumer implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(MessageCreatedConsumer.name);
  private consumer?: Consumer;

  constructor(
    @Inject(KAFKA_CLIENT) private readonly kafka: Kafka,
    @Inject(MESSAGE_SEARCH) private readonly messageSearch: MessageSearchPort,
    private readonly producer: KafkaProducerService,
    private readonly metricsService: MetricsService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.consumer = this.kafka.consumer({
      groupId: MESSAGE_CREATED_SEARCH_INDEXER_GROUP,
    });

    await this.consumer.connect();
    await this.consumer.subscribe({
      fromBeginning: false,
      topic: MESSAGE_CREATED_TOPIC,
    });
    void this.consumer
      .run({
        eachMessage: async (payload) => {
          await this.handleMessage(payload);
        },
      })
      .catch((error: unknown) => {
        this.logger.error(
          {
            error: error instanceof Error ? error.message : String(error),
          },
          'Search indexer consumer loop failed',
        );
      });
  }

  async onApplicationShutdown(): Promise<void> {
    if (!this.consumer) {
      return;
    }

    await this.consumer.disconnect();
  }

  async handleMessage(payload: EachMessagePayload): Promise<void> {
    const startedAt = process.hrtime.bigint();
    let parsed: ParsedEvent | undefined;

    try {
      parsed = parseMessageCreatedEvent(payload.message.value);

      if (parsed.kind === 'unknown-version') {
        this.metricsService.recordSearchIndexerSkipped(payload.topic, 'unknown_version');
        this.logger.warn(
          {
            eventType: parsed.eventType,
            eventVersion: parsed.eventVersion,
            offset: payload.message.offset,
            partition: payload.partition,
            topic: payload.topic,
          },
          'Skipping unsupported message-created event version',
        );
        return;
      }

      await this.indexWithRetry(projectMessageCreatedEvent(parsed.event));
      this.metricsService.recordSearchIndexerIndexDuration(
        payload.topic,
        elapsedSeconds(startedAt),
      );
      this.metricsService.recordSearchIndexerIndexed(payload.topic);
    } catch (error) {
      await this.publishToDlq(payload, error, parsed);
    }
  }

  private async indexWithRetry(document: SearchMessageDocument): Promise<void> {
    for (let attempt = 1; attempt <= MAX_INDEX_ATTEMPTS; attempt += 1) {
      try {
        await this.messageSearch.indexMessage(document);
        return;
      } catch (error) {
        if (!isRetryableElasticsearchError(error) || attempt === MAX_INDEX_ATTEMPTS) {
          throw error;
        }

        await delay(calculateIndexRetryDelayMs(attempt));
      }
    }
  }

  private async publishToDlq(
    payload: EachMessagePayload,
    error: unknown,
    parsed: ParsedEvent | undefined,
  ): Promise<void> {
    const reason = error instanceof MalformedMessageError ? 'malformed' : 'indexing_failed';
    const errorMessage = error instanceof Error ? error.message : String(error);

    await this.producer.publishRaw({
      headers: buildDlqHeaders(payload, error, parsed),
      key: decodeKey(payload.message.key),
      topic: MESSAGE_CREATED_DLQ_TOPIC,
      value: payload.message.value,
    });

    this.metricsService.recordSearchIndexerDlq(payload.topic, reason);
    this.logger.warn(
      {
        error: errorMessage,
        offset: payload.message.offset,
        partition: payload.partition,
        reason,
        topic: payload.topic,
      },
      'Published message-created event to DLQ',
    );
  }
}

export class MalformedMessageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MalformedMessageError';
  }
}

export function parseMessageCreatedEvent(value: Buffer | null): ParsedEvent {
  if (!value) {
    throw new MalformedMessageError('Kafka message value is empty');
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(value.toString('utf8')) as unknown;
  } catch (error) {
    throw new MalformedMessageError(error instanceof Error ? error.message : 'Invalid JSON');
  }

  if (!isRecord(decoded)) {
    throw new MalformedMessageError('Event envelope must be an object');
  }

  const eventType = decoded['eventType'];
  const eventVersion = decoded['eventVersion'];

  if (typeof eventType !== 'string' || typeof eventVersion !== 'number') {
    throw new MalformedMessageError('Event envelope type/version are invalid');
  }

  if (eventType !== MESSAGE_CREATED_EVENT_TYPE || eventVersion !== MESSAGE_CREATED_EVENT_VERSION) {
    return {
      kind: 'unknown-version',
      eventType,
      eventVersion,
    };
  }

  assertMessageCreatedEvent(decoded);

  return {
    kind: 'message-created',
    event: decoded,
  };
}

export function projectMessageCreatedEvent(event: MessageCreatedEvent): SearchMessageDocument {
  return {
    id: event.payload.id,
    conversationId: event.payload.conversationId,
    senderId: event.payload.senderId,
    content: event.payload.content,
    timestamp: new Date(event.payload.timestamp),
    ...(event.payload.metadata === undefined ? {} : { metadata: event.payload.metadata }),
  };
}

export function isRetryableElasticsearchError(error: unknown): boolean {
  if (!isRecord(error)) {
    return false;
  }

  const name = typeof error['name'] === 'string' ? error['name'] : '';
  if (name === 'ConnectionError' || name === 'TimeoutError') {
    return true;
  }

  const statusCode = getErrorStatusCode(error);
  return (
    statusCode === 408 || statusCode === 429 || (statusCode !== undefined && statusCode >= 500)
  );
}

export function calculateIndexRetryDelayMs(attempt: number, random = Math.random): number {
  const exponentialDelay = Math.min(
    BASE_INDEX_RETRY_DELAY_MS * 2 ** Math.max(0, attempt - 1),
    MAX_INDEX_RETRY_DELAY_MS,
  );
  const jitterFactor = 0.8 + random() * 0.4;

  return Math.round(exponentialDelay * jitterFactor);
}

function assertMessageCreatedEvent(
  value: Record<string, unknown>,
): asserts value is MessageCreatedEvent {
  if (
    typeof value['eventId'] !== 'string' ||
    typeof value['occurredAt'] !== 'string' ||
    typeof value['correlationId'] !== 'string' ||
    !isRecord(value['payload'])
  ) {
    throw new MalformedMessageError('Event envelope is missing required fields');
  }

  const payload = value['payload'];
  if (
    typeof payload['id'] !== 'string' ||
    typeof payload['conversationId'] !== 'string' ||
    typeof payload['senderId'] !== 'string' ||
    typeof payload['content'] !== 'string' ||
    typeof payload['timestamp'] !== 'string' ||
    Number.isNaN(new Date(payload['timestamp']).getTime())
  ) {
    throw new MalformedMessageError('Event payload is invalid');
  }

  if (payload['metadata'] !== undefined && !isRecord(payload['metadata'])) {
    throw new MalformedMessageError('Event payload metadata must be an object');
  }
}

function buildDlqHeaders(
  payload: EachMessagePayload,
  error: unknown,
  parsed: ParsedEvent | undefined,
): Record<string, string> {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const headers = {
    ...decodeHeaders(payload.message.headers),
    'x-error-class': error instanceof Error ? error.name : 'Error',
    'x-error-message': errorMessage,
    'x-failed-at': new Date().toISOString(),
    'x-original-offset': payload.message.offset,
    'x-original-partition': String(payload.partition),
    'x-original-topic': payload.topic,
  };

  if (parsed?.kind === 'message-created') {
    return {
      ...headers,
      'x-correlation-id': parsed.event.correlationId,
    };
  }

  return headers;
}

type HeaderValue = Buffer | string | Array<Buffer | string> | undefined;

function decodeHeaders(headers: IHeaders | undefined): Record<string, string> {
  if (!headers) {
    return {};
  }

  return Object.fromEntries(
    (Object.entries(headers) as Array<[string, HeaderValue]>).flatMap(([key, value]) => {
      const decoded = decodeHeaderValue(value);
      return decoded === undefined ? [] : [[key, decoded]];
    }),
  );
}

function decodeHeaderValue(value: HeaderValue): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (Array.isArray(value)) {
    const first = value[0];
    return first === undefined ? undefined : decodeHeaderValue(first);
  }

  return Buffer.isBuffer(value) ? value.toString('utf8') : String(value);
}

function decodeKey(key: Buffer | null): string | null {
  return key ? key.toString('utf8') : null;
}

function getErrorStatusCode(error: Record<string, unknown>): number | undefined {
  const meta = error['meta'];
  if (!isRecord(meta)) {
    return undefined;
  }

  const statusCode = meta['statusCode'];
  return typeof statusCode === 'number' ? statusCode : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function elapsedSeconds(startedAt: bigint): number {
  return Number(process.hrtime.bigint() - startedAt) / 1_000_000_000;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
