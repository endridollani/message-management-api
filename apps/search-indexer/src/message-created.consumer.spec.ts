import type { EachMessagePayload } from 'kafkajs';

import { MESSAGE_CREATED_TOPIC } from '@app/domain';
import type { MessageCreatedEvent, MessageSearchPort } from '@app/domain';
import { MESSAGE_CREATED_DLQ_TOPIC } from '@app/messaging';
import type { KafkaProducerService } from '@app/messaging';
import type { MetricsService } from '@app/observability';

import {
  MessageCreatedConsumer,
  calculateIndexRetryDelayMs,
  parseMessageCreatedEvent,
  projectMessageCreatedEvent,
} from './message-created.consumer';

describe('MessageCreatedConsumer', () => {
  let search: jest.Mocked<MessageSearchPort>;
  let producer: jest.Mocked<Pick<KafkaProducerService, 'publishRaw'>>;
  let metrics: jest.Mocked<
    Pick<
      MetricsService,
      | 'recordSearchIndexerDlq'
      | 'recordSearchIndexerIndexDuration'
      | 'recordSearchIndexerIndexed'
      | 'recordSearchIndexerSkipped'
    >
  >;
  let consumer: MessageCreatedConsumer;

  beforeEach(() => {
    search = {
      indexMessage: jest.fn().mockResolvedValue(undefined),
      searchMessages: jest.fn(),
    };
    producer = {
      publishRaw: jest.fn().mockResolvedValue(undefined),
    };
    metrics = {
      recordSearchIndexerDlq: jest.fn(),
      recordSearchIndexerIndexDuration: jest.fn(),
      recordSearchIndexerIndexed: jest.fn(),
      recordSearchIndexerSkipped: jest.fn(),
    };
    consumer = new MessageCreatedConsumer(
      { consumer: jest.fn() } as never,
      search,
      producer as unknown as KafkaProducerService,
      metrics as unknown as MetricsService,
    );
  });

  it('subscribes from the beginning for partitions without committed offsets', async () => {
    const kafkaConsumer = mockKafkaConsumer();
    const kafka = {
      consumer: jest.fn().mockReturnValue(kafkaConsumer),
    };
    consumer = new MessageCreatedConsumer(
      kafka as never,
      search,
      producer as unknown as KafkaProducerService,
      metrics as unknown as MetricsService,
    );

    await consumer.onModuleInit();

    expect(consumer.isRunning()).toBe(true);

    await consumer.onApplicationShutdown();

    expect(kafkaConsumer.subscribe.mock.calls).toEqual([
      [
        {
          fromBeginning: true,
          topic: MESSAGE_CREATED_TOPIC,
        },
      ],
    ]);
    expect(consumer.isRunning()).toBe(false);
  });

  it('keeps readiness healthy for restartable consumer crashes', async () => {
    const kafkaConsumer = mockKafkaConsumer();
    const kafka = {
      consumer: jest.fn().mockReturnValue(kafkaConsumer),
    };
    consumer = new MessageCreatedConsumer(
      kafka as never,
      search,
      producer as unknown as KafkaProducerService,
      metrics as unknown as MetricsService,
    );

    await consumer.onModuleInit();
    kafkaConsumer.emitCrash({ restart: true });

    expect(consumer.isRunning()).toBe(true);
  });

  it('marks readiness unhealthy when a non-restartable consumer crash stops the runner', async () => {
    const kafkaConsumer = mockKafkaConsumer();
    const kafka = {
      consumer: jest.fn().mockReturnValue(kafkaConsumer),
    };
    consumer = new MessageCreatedConsumer(
      kafka as never,
      search,
      producer as unknown as KafkaProducerService,
      metrics as unknown as MetricsService,
    );

    await consumer.onModuleInit();
    kafkaConsumer.emitCrash({ restart: false });

    expect(consumer.isRunning()).toBe(false);
  });

  it('indexes valid message-created events with only mapped fields', async () => {
    const event = buildEvent();
    const payload = buildPayload(Buffer.from(JSON.stringify({ ...event, extra: 'ignored' })));

    await consumer.handleMessage(payload);

    expect(search.indexMessage.mock.calls).toEqual([
      [
        {
          id: 'message-1',
          conversationId: 'conversation-1',
          senderId: 'sender-1',
          content: 'hello world',
          timestamp: new Date('2026-07-03T09:00:00.000Z'),
          metadata: { channel: 'sms' },
        },
      ],
    ]);
    expect(producer.publishRaw.mock.calls).toHaveLength(0);
    expect(metrics.recordSearchIndexerIndexed.mock.calls).toEqual([[MESSAGE_CREATED_TOPIC]]);
    expect(metrics.recordSearchIndexerIndexDuration.mock.calls).toEqual([
      [MESSAGE_CREATED_TOPIC, expect.any(Number)],
    ]);
  });

  it('skips unsupported event versions', async () => {
    const payload = buildPayload(
      Buffer.from(
        JSON.stringify({
          eventId: 'event-1',
          eventType: 'message.created',
          eventVersion: 2,
        }),
      ),
    );

    await consumer.handleMessage(payload);

    expect(search.indexMessage.mock.calls).toHaveLength(0);
    expect(producer.publishRaw.mock.calls).toHaveLength(0);
    expect(metrics.recordSearchIndexerSkipped.mock.calls).toEqual([
      [MESSAGE_CREATED_TOPIC, 'unknown_version'],
    ]);
  });

  it('publishes malformed events to the DLQ', async () => {
    const raw = Buffer.from('{not-json');
    const payload = buildPayload(raw);

    await consumer.handleMessage(payload);

    expect(search.indexMessage.mock.calls).toHaveLength(0);
    expect(producer.publishRaw.mock.calls).toEqual([
      [
        {
          headers: expect.objectContaining({
            'x-error-class': 'MalformedMessageError',
            'x-original-topic': MESSAGE_CREATED_TOPIC,
            'x-original-partition': '0',
            'x-original-offset': '42',
          }),
          key: 'conversation-1',
          topic: MESSAGE_CREATED_DLQ_TOPIC,
          value: raw,
        },
      ],
    ]);
    expect(metrics.recordSearchIndexerDlq.mock.calls).toEqual([
      [MESSAGE_CREATED_TOPIC, 'malformed'],
    ]);
  });

  it('retries retryable Elasticsearch errors before succeeding', async () => {
    jest.useFakeTimers();
    search.indexMessage
      .mockRejectedValueOnce(elasticsearchError(503))
      .mockRejectedValueOnce(elasticsearchError(429))
      .mockResolvedValueOnce(undefined);

    const promise = consumer.handleMessage(buildPayload(Buffer.from(JSON.stringify(buildEvent()))));
    await jest.advanceTimersByTimeAsync(10_000);
    await promise;

    expect(search.indexMessage.mock.calls).toHaveLength(3);
    expect(producer.publishRaw.mock.calls).toHaveLength(0);
    jest.useRealTimers();
  });

  it('publishes exhausted retryable Elasticsearch errors to the DLQ', async () => {
    jest.useFakeTimers();
    search.indexMessage.mockRejectedValue(elasticsearchError(503));

    const raw = Buffer.from(JSON.stringify(buildEvent()));
    const promise = consumer.handleMessage(buildPayload(raw));
    await jest.advanceTimersByTimeAsync(60_000);
    await promise;

    expect(search.indexMessage.mock.calls).toHaveLength(5);
    expect(producer.publishRaw.mock.calls).toEqual([
      [
        expect.objectContaining({
          headers: expect.objectContaining({
            'x-error-class': 'Error',
            'x-correlation-id': 'correlation-1',
          }),
          topic: MESSAGE_CREATED_DLQ_TOPIC,
          value: raw,
        }),
      ],
    ]);
    expect(metrics.recordSearchIndexerDlq.mock.calls).toEqual([
      [MESSAGE_CREATED_TOPIC, 'indexing_failed'],
    ]);
    jest.useRealTimers();
  });

  it('publishes non-retryable Elasticsearch errors to the DLQ without retrying', async () => {
    search.indexMessage.mockRejectedValueOnce(elasticsearchError(400));
    const raw = Buffer.from(JSON.stringify(buildEvent()));

    await consumer.handleMessage(buildPayload(raw));

    expect(search.indexMessage.mock.calls).toHaveLength(1);
    expect(producer.publishRaw.mock.calls).toEqual([
      [
        expect.objectContaining({
          topic: MESSAGE_CREATED_DLQ_TOPIC,
          value: raw,
        }),
      ],
    ]);
  });

  it('handles duplicate events idempotently by indexing the same document id', async () => {
    const raw = Buffer.from(JSON.stringify(buildEvent()));

    await consumer.handleMessage(buildPayload(raw));
    await consumer.handleMessage(buildPayload(raw, '43'));

    expect(search.indexMessage.mock.calls).toEqual([
      [expect.objectContaining({ id: 'message-1' })],
      [expect.objectContaining({ id: 'message-1' })],
    ]);
  });
});

describe('message-created parsing and projection', () => {
  it('parses and projects a valid event', () => {
    const event = buildEvent();
    const parsed = parseMessageCreatedEvent(Buffer.from(JSON.stringify(event)));

    expect(parsed).toEqual({
      kind: 'message-created',
      event,
    });
    expect(projectMessageCreatedEvent(event)).toEqual({
      id: 'message-1',
      conversationId: 'conversation-1',
      senderId: 'sender-1',
      content: 'hello world',
      timestamp: new Date('2026-07-03T09:00:00.000Z'),
      metadata: { channel: 'sms' },
    });
  });

  it('calculates bounded exponential retry delay with jitter', () => {
    expect(calculateIndexRetryDelayMs(1, () => 0)).toBe(200);
    expect(calculateIndexRetryDelayMs(20, () => 1)).toBe(9600);
  });
});

function buildEvent(): MessageCreatedEvent {
  return {
    eventId: 'event-1',
    eventType: 'message.created',
    eventVersion: 1,
    occurredAt: '2026-07-03T09:00:00.000Z',
    correlationId: 'correlation-1',
    payload: {
      id: 'message-1',
      conversationId: 'conversation-1',
      senderId: 'sender-1',
      content: 'hello world',
      timestamp: '2026-07-03T09:00:00.000Z',
      metadata: { channel: 'sms' },
    },
  };
}

function buildPayload(value: Buffer, offset = '42'): EachMessagePayload {
  return {
    topic: MESSAGE_CREATED_TOPIC,
    partition: 0,
    heartbeat: jest.fn(),
    pause: jest.fn(),
    message: {
      attributes: 0,
      headers: {
        existing: Buffer.from('header'),
      },
      key: Buffer.from('conversation-1'),
      offset,
      timestamp: '1783078800000',
      value,
    },
  };
}

function mockKafkaConsumer() {
  const listeners = new Map<string, Array<(event: never) => void>>();
  const consumer = {
    connect: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
    events: {
      CRASH: 'consumer.crash',
      STOP: 'consumer.stop',
    },
    on: jest.fn((eventName: string, listener: (event: never) => void) => {
      listeners.set(eventName, [...(listeners.get(eventName) ?? []), listener]);
      return jest.fn();
    }),
    run: jest.fn().mockResolvedValue(undefined),
    subscribe: jest.fn().mockResolvedValue(undefined),
    emitCrash(input: { restart: boolean }) {
      for (const listener of listeners.get('consumer.crash') ?? []) {
        listener({
          payload: {
            error: new Error('consumer crashed'),
            groupId: 'message-management-api.search-indexer',
            restart: input.restart,
          },
        } as never);
      }
    },
  };

  return consumer;
}

function elasticsearchError(statusCode: number): Error {
  return Object.assign(new Error(`Elasticsearch ${statusCode}`), {
    meta: {
      statusCode,
    },
  });
}
