import { HttpAdapterHost } from '@nestjs/core';
import { INestApplication, RequestMethod, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { Kafka, KafkaMessage } from 'kafkajs';
import type { EachMessagePayload, IHeaders } from 'kafkajs';
import { Connection, Model } from 'mongoose';
import { createHash, randomUUID } from 'node:crypto';
import { json } from 'express';
import * as request from 'supertest';

import { AllExceptionsFilter } from '../../apps/api/src/filters/all-exceptions.filter';
import { PublisherService } from '../../apps/outbox-publisher/src/publisher.service';
import { DlqRedriveService } from '../../apps/cli/src/services/dlq-redrive.service';
import { EsReindexService } from '../../apps/cli/src/services/es-reindex.service';
import {
  clearSearchDocuments,
  ensureKafkaTopics,
  IntegrationInfrastructure,
  poll,
  resetElasticsearch,
  startIntegrationInfrastructure,
  waitForConsumerGroup,
  waitForSearchDocument,
} from './testcontainers-harness';
import { CorrelationIdContext } from '@app/observability';
import {
  MESSAGE_CREATED_EVENT_TYPE,
  MESSAGE_CREATED_EVENT_VERSION,
  MESSAGE_CREATED_TOPIC,
  OUTBOX_REPOSITORY,
} from '@app/domain';
import type {
  CreateOutboxEventInput,
  MessageCreatedEvent,
  OutboxRepositoryPort,
} from '@app/domain';
import { KafkaProducerService, MESSAGE_CREATED_DLQ_TOPIC } from '@app/messaging';
import { MESSAGES_READ_ALIAS, MESSAGES_WRITE_ALIAS } from '@app/search';
import { MessageManagementConfigModule } from '@app/config';
import { ObservabilityModule } from '@app/observability';
import {
  MongoOutboxRepository,
  OUTBOX_EVENT_MODEL_NAME,
  OutboxEventEntity,
  PersistenceModule,
} from '@app/persistence';
import { CreateMessageService } from '@app/application';

const API_KEY = 'integration-api-key';
const API_KEY_HASH = createHash('sha256').update(API_KEY).digest('hex');

type SupertestApp = Parameters<typeof request>[0];

type MessageResponse = {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
};

type SearchResponse = {
  data: Array<MessageResponse & { score: number }>;
};

let apiApp: INestApplication;
let mongoConnection: Connection;

describe('message pipeline integration', () => {
  let infra: IntegrationInfrastructure;
  let indexerModule: TestingModule;

  beforeAll(async () => {
    infra = await startIntegrationInfrastructure();
    configureEnvironment(infra);
    await ensureKafkaTopics(infra.kafka);
    await resetElasticsearch(infra.elasticsearch);

    indexerModule = await createSearchIndexerContext();
    await waitForConsumerGroup(infra.kafka);
    apiApp = await createApiApplication();
    mongoConnection = apiApp.get<Connection>(getConnectionToken());
  }, 240_000);

  afterAll(async () => {
    await apiApp?.close();
    await indexerModule?.close();
    await infra?.stop();
  });

  beforeEach(async () => {
    await mongoConnection.db?.dropDatabase();
    await mongoConnection.syncIndexes();
    await clearSearchDocuments(infra.elasticsearch);
  });

  it('writes a message and outbox event atomically through HTTP', async () => {
    const response = await createHttpMessage({
      content: 'atomic write check',
      conversationId: 'conversation-atomic',
      correlationId: 'correlation-atomic',
    });
    const body = response.body as MessageResponse;

    const [messageCount, outboxEvent] = await Promise.all([
      mongoConnection.collection('messages').countDocuments(),
      mongoConnection.collection('outbox_events').findOne(),
    ]);

    expect(messageCount).toBe(1);
    expect(outboxEvent).toMatchObject({
      eventType: MESSAGE_CREATED_EVENT_TYPE,
      eventVersion: MESSAGE_CREATED_EVENT_VERSION,
      key: 'conversation-atomic',
      status: 'pending',
      payload: expect.objectContaining({
        correlationId: 'correlation-atomic',
        payload: expect.objectContaining({
          id: body.id,
          content: 'atomic write check',
        }),
      }),
    });
  });

  it('rolls back message and outbox writes when the transaction aborts', async () => {
    const rollbackModule = await createRollbackProbeModule();

    try {
      await expect(
        rollbackModule.get(CreateMessageService).execute({
          content: 'should roll back',
          conversationId: 'conversation-rollback',
          correlationId: 'correlation-rollback',
          senderId: 'sender-1',
        }),
      ).rejects.toThrow('forced outbox failure');

      await expect(mongoConnection.collection('messages').countDocuments()).resolves.toBe(0);
      await expect(mongoConnection.collection('outbox_events').countDocuments()).resolves.toBe(0);
    } finally {
      await rollbackModule.close();
    }
  });

  it('publishes pending outbox events to Kafka and marks them published', async () => {
    const response = await createHttpMessage({
      content: 'publish me',
      conversationId: 'conversation-publish',
      correlationId: 'correlation-publish',
    });
    const created = response.body as MessageResponse;
    const outboxEvent = await readOnlyOutboxEvent();
    const observed = consumeMatchingMessage(
      infra.kafka,
      MESSAGE_CREATED_TOPIC,
      (message) => parseKafkaJson<MessageCreatedEvent>(message)?.eventId === outboxEvent.eventId,
    );
    const outboxModule = await createOutboxPublisherContext();

    try {
      const kafkaMessage = await observed;
      const payload = parseKafkaJson<MessageCreatedEvent>(kafkaMessage);

      expect(kafkaMessage.key?.toString('utf8')).toBe('conversation-publish');
      expect(payload).toMatchObject({
        eventId: outboxEvent.eventId,
        eventType: MESSAGE_CREATED_EVENT_TYPE,
        eventVersion: MESSAGE_CREATED_EVENT_VERSION,
        payload: expect.objectContaining({
          id: created.id,
          content: 'publish me',
        }),
      });

      await poll(async () => {
        const row = await mongoConnection.collection('outbox_events').findOne({
          eventId: outboxEvent.eventId,
        });
        return row?.['status'] === 'published' ? row : undefined;
      });
    } finally {
      await outboxModule.close();
    }
  });

  it('leaves publish failures retryable with attempts and nextAttemptAt updated', async () => {
    await createHttpMessage({
      content: 'retry me',
      conversationId: 'conversation-retry',
      correlationId: 'correlation-retry',
    });
    const outboxEvent = await readOnlyOutboxEvent();
    const publisherModule = await createPublisherFailureProbeModule();

    try {
      const publisher = publisherModule.get(PublisherService);
      const claimed = await poll(async () => {
        const count = await publisher.runOnce();
        return count === 1 ? count : undefined;
      });

      expect(claimed).toBe(1);
      const updated = await mongoConnection.collection('outbox_events').findOne({
        eventId: outboxEvent.eventId,
      });

      expect(updated).toMatchObject({
        attempts: 1,
        status: 'pending',
        lastError: 'forced publish failure',
      });
      expect(updated?.['nextAttemptAt']).toBeInstanceOf(Date);
      expect((updated?.['nextAttemptAt'] as Date).getTime()).toBeGreaterThan(Date.now());
    } finally {
      await publisherModule.close();
    }
  });

  it('indexes Kafka message.created events into Elasticsearch', async () => {
    const event = buildMessageCreatedEvent({
      content: 'direct index searchable',
      conversationId: 'conversation-indexer',
      id: uniqueMessageId(),
    });

    await produceKafkaJson(infra.kafka, MESSAGE_CREATED_TOPIC, event.payload.conversationId, event);

    const document = await waitForSearchDocument(infra.elasticsearch, event.payload.id);

    expect(document).toMatchObject({
      id: event.payload.id,
      conversationId: 'conversation-indexer',
      content: 'direct index searchable',
    });
  });

  it('handles duplicate event delivery idempotently', async () => {
    const event = buildMessageCreatedEvent({
      content: 'duplicate index searchable',
      conversationId: 'conversation-duplicate',
      id: uniqueMessageId(),
    });

    await produceKafkaJson(infra.kafka, MESSAGE_CREATED_TOPIC, event.payload.conversationId, event);
    await produceKafkaJson(infra.kafka, MESSAGE_CREATED_TOPIC, event.payload.conversationId, event);
    await waitForSearchDocument(infra.elasticsearch, event.payload.id);
    await infra.elasticsearch.indices.refresh({ index: MESSAGES_READ_ALIAS });

    const count = await infra.elasticsearch.count({
      index: MESSAGES_READ_ALIAS,
      query: {
        term: {
          id: event.payload.id,
        },
      },
    });

    expect(count.count).toBe(1);
  });

  it('redrives DLQ records back to the main topic', async () => {
    const event = buildMessageCreatedEvent({
      content: 'redriven from dlq',
      conversationId: 'conversation-dlq-redrive',
      id: uniqueMessageId(),
    });
    const observed = consumeMatchingMessage(
      infra.kafka,
      MESSAGE_CREATED_TOPIC,
      (message) => parseKafkaJson<MessageCreatedEvent>(message)?.eventId === event.eventId,
    );

    await produceKafkaJson(infra.kafka, MESSAGE_CREATED_DLQ_TOPIC, event.payload.conversationId, event);

    const cliModule = await createCliContext();
    try {
      const result = await cliModule.get(DlqRedriveService).redrive({
        dryRun: false,
        idleTimeoutMs: 5_000,
        limit: 1,
      });

      expect(result).toMatchObject({
        committedCount: 1,
        consumedCount: 1,
        republishedCount: 1,
      });
      await expect(observed).resolves.toEqual(expect.objectContaining({ value: expect.any(Buffer) }));
      await waitForSearchDocument(infra.elasticsearch, event.payload.id);
    } finally {
      await cliModule.close();
    }
  });

  it('sends poison Kafka events to the DLQ with error headers', async () => {
    const poisonKey = `poison-${randomUUID()}`;
    const observed = consumeMatchingMessage(
      infra.kafka,
      MESSAGE_CREATED_DLQ_TOPIC,
      (message) => message.key?.toString('utf8') === poisonKey,
    );

    await produceKafkaRaw(infra.kafka, MESSAGE_CREATED_TOPIC, poisonKey, '{not-valid-json');
    const dlqMessage = await observed;
    const headers = decodeHeaders(dlqMessage.headers);

    expect(dlqMessage.value?.toString('utf8')).toBe('{not-valid-json');
    expect(headers).toMatchObject({
      'x-error-class': 'MalformedMessageError',
      'x-original-topic': MESSAGE_CREATED_TOPIC,
    });
    expect(headers['x-error-message']).toContain('JSON');
  });

  it('runs HTTP create through outbox, Kafka, indexer, Elasticsearch, and search API', async () => {
    const outboxModule = await createOutboxPublisherContext();

    try {
      const response = await createHttpMessage({
        content: 'end to end searchable token',
        conversationId: 'conversation-e2e',
        correlationId: 'correlation-e2e',
      });
      const created = response.body as MessageResponse;

      await poll(async () => {
        await infra.elasticsearch.indices.refresh({ index: MESSAGES_READ_ALIAS });
        const search = await request(httpServer(apiApp))
          .get('/api/conversations/conversation-e2e/messages/search')
          .query({ q: 'searchable token', limit: 10 })
          .set('x-api-key', API_KEY);

        if (search.status !== 200) {
          return undefined;
        }

        const body = search.body as SearchResponse;
        const hit = body.data.find((candidate) => candidate.id === created.id);
        return hit?.conversationId === 'conversation-e2e' ? hit : undefined;
      }, 30_000);

      const otherConversationSearch = await request(httpServer(apiApp))
        .get('/api/conversations/other-conversation/messages/search')
        .query({ q: 'searchable token', limit: 10 })
        .set('x-api-key', API_KEY)
        .expect(200);

      expect((otherConversationSearch.body as SearchResponse).data).toEqual([]);
    } finally {
      await outboxModule.close();
    }
  });

  it('reindexes Elasticsearch into a target index and swaps read/write aliases safely', async () => {
    const messageId = uniqueMessageId();
    await infra.elasticsearch.index({
      document: {
        content: 'reindex target document',
        conversationId: 'conversation-reindex',
        id: messageId,
        senderId: 'sender-1',
        timestamp: new Date().toISOString(),
      },
      id: messageId,
      index: MESSAGES_WRITE_ALIAS,
      refresh: 'wait_for',
    });

    const cliModule = await createCliContext();
    try {
      const result = await cliModule.get(EsReindexService).reindex({
        dryRun: false,
        targetIndex: 'messages-v2',
      });

      expect(result).toMatchObject({
        aliasesSwapped: true,
        sourceCount: 1,
        targetCount: 1,
        targetIndex: 'messages-v2',
      });

      const [readAlias, writeAlias] = await Promise.all([
        infra.elasticsearch.indices.getAlias({ name: MESSAGES_READ_ALIAS }),
        infra.elasticsearch.indices.getAlias({ name: MESSAGES_WRITE_ALIAS }),
      ]);

      expect(Object.keys(readAlias)).toEqual(['messages-v2']);
      expect(Object.keys(writeAlias)).toEqual(['messages-v2']);
      await expect(waitForSearchDocument(infra.elasticsearch, messageId)).resolves.toMatchObject({
        id: messageId,
      });
    } finally {
      await cliModule.close();
    }
  });
});

function configureEnvironment(infra: IntegrationInfrastructure): void {
  process.env = {
    ...process.env,
    API_KEYS: `integration:${API_KEY_HASH}`,
    ELASTICSEARCH_NODE: infra.elasticsearchNode,
    INDEXER_HEALTH_PORT: '0',
    KAFKA_BROKERS: infra.kafkaBrokers.join(','),
    KAFKA_CLIENT_ID: 'message-management-api-integration',
    LOG_LEVEL: 'silent',
    MONGODB_URI: infra.mongodbUri,
    NODE_ENV: 'test',
    OUTBOX_BATCH_SIZE: '10',
    OUTBOX_HEALTH_PORT: '0',
    OUTBOX_LOCK_TIMEOUT_MS: '1000',
    OUTBOX_MAX_ATTEMPTS: '3',
    OUTBOX_POLL_INTERVAL_MS: '100',
    PORT: '0',
  };
}

async function createApiApplication(): Promise<INestApplication> {
  const { ApiModule } = await import('../../apps/api/src/api.module');
  const moduleRef = await Test.createTestingModule({
    imports: [ApiModule],
  }).compile();
  const app = moduleRef.createNestApplication({
    bodyParser: false,
    bufferLogs: true,
  });

  app.use(json({ limit: '100kb' }));
  app.setGlobalPrefix('api', {
    exclude: [
      { method: RequestMethod.ALL, path: 'health/(.*)' },
      { method: RequestMethod.GET, path: 'metrics' },
    ],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: false,
      },
      whitelist: true,
    }),
  );
  app.useGlobalFilters(
    new AllExceptionsFilter(app.get(HttpAdapterHost), app.get(CorrelationIdContext)),
  );

  await app.init();
  return app;
}

async function createSearchIndexerContext(): Promise<TestingModule> {
  const { SearchIndexerModule } = await import('../../apps/search-indexer/src/search-indexer.module');
  const moduleRef = await Test.createTestingModule({
    imports: [SearchIndexerModule],
  }).compile();
  await moduleRef.init();
  return moduleRef;
}

async function createOutboxPublisherContext(): Promise<TestingModule> {
  const { OutboxPublisherModule } = await import(
    '../../apps/outbox-publisher/src/outbox-publisher.module'
  );
  const moduleRef = await Test.createTestingModule({
    imports: [OutboxPublisherModule],
  }).compile();
  await moduleRef.init();
  return moduleRef;
}

async function createCliContext(): Promise<TestingModule> {
  const { CliModule } = await import('../../apps/cli/src/cli.module');
  const moduleRef = await Test.createTestingModule({
    imports: [CliModule],
  }).compile();
  await moduleRef.init();
  return moduleRef;
}

async function createRollbackProbeModule(): Promise<TestingModule> {
  const moduleRef = await Test.createTestingModule({
    imports: [
      MessageManagementConfigModule.forRuntime('api'),
      ObservabilityModule,
      PersistenceModule,
    ],
    providers: [
      CreateMessageService,
      {
        inject: [getModelToken(OUTBOX_EVENT_MODEL_NAME)],
        provide: OUTBOX_REPOSITORY,
        useFactory: (outboxModel: Model<OutboxEventEntity>): OutboxRepositoryPort => {
          const outboxRepository = new MongoOutboxRepository(outboxModel);

          return {
            claimPublishable: (input) => outboxRepository.claimPublishable(input),
            getPendingStats: () => outboxRepository.getPendingStats(),
            markFailed: (input) => outboxRepository.markFailed(input),
            markPublished: (input) => outboxRepository.markPublished(input),
            scheduleRetry: (input) => outboxRepository.scheduleRetry(input),
            create: async (input: CreateOutboxEventInput, session) => {
              await outboxRepository.create(input, session);
              throw new Error('forced outbox failure');
            },
          };
        },
      },
    ],
  }).compile();
  await moduleRef.init();
  return moduleRef;
}

async function createPublisherFailureProbeModule(): Promise<TestingModule> {
  const moduleRef = await Test.createTestingModule({
    imports: [
      MessageManagementConfigModule.forRuntime('outbox-publisher'),
      ObservabilityModule,
      PersistenceModule,
    ],
    providers: [
      PublisherService,
      {
        provide: KafkaProducerService,
        useValue: {
          publishJson: jest.fn().mockRejectedValue(new Error('forced publish failure')),
        },
      },
    ],
  }).compile();
  return moduleRef;
}

async function createHttpMessage(input: {
  content: string;
  conversationId: string;
  correlationId: string;
}): Promise<request.Response> {
  return request(httpServer(apiApp))
    .post('/api/messages')
    .set('x-api-key', API_KEY)
    .set('x-correlation-id', input.correlationId)
    .send({
      content: input.content,
      conversationId: input.conversationId,
      senderId: 'sender-1',
    })
    .expect(201);
}

async function readOnlyOutboxEvent(): Promise<{
  eventId: string;
  id: string;
  status: string;
}> {
  const outboxEvent = await mongoConnection.collection('outbox_events').findOne();
  if (!outboxEvent) {
    throw new Error('Expected an outbox event');
  }

  return {
    eventId: String(outboxEvent['eventId']),
    id: String(outboxEvent._id),
    status: String(outboxEvent['status']),
  };
}

function buildMessageCreatedEvent(input: {
  content: string;
  conversationId: string;
  id: string;
}): MessageCreatedEvent {
  const now = new Date().toISOString();

  return {
    correlationId: `correlation-${randomUUID()}`,
    eventId: randomUUID(),
    eventType: MESSAGE_CREATED_EVENT_TYPE,
    eventVersion: MESSAGE_CREATED_EVENT_VERSION,
    occurredAt: now,
    payload: {
      content: input.content,
      conversationId: input.conversationId,
      id: input.id,
      senderId: 'sender-1',
      timestamp: now,
    },
  };
}

async function produceKafkaJson(
  kafka: Kafka,
  topic: string,
  key: string,
  payload: unknown,
): Promise<void> {
  await produceKafkaRaw(kafka, topic, key, JSON.stringify(payload));
}

async function produceKafkaRaw(
  kafka: Kafka,
  topic: string,
  key: string,
  value: string,
): Promise<void> {
  const producer = kafka.producer();
  await producer.connect();

  try {
    await producer.send({
      acks: -1,
      messages: [{ key, value }],
      topic,
    });
  } finally {
    await producer.disconnect();
  }
}

async function consumeMatchingMessage(
  kafka: Kafka,
  topic: string,
  predicate: (message: KafkaMessage) => boolean,
  timeoutMs = 30_000,
): Promise<KafkaMessage> {
  const consumer = kafka.consumer({
    groupId: `message-management-api.integration.${randomUUID()}`,
  });
  await consumer.connect();

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error: Error | undefined, message?: KafkaMessage): void => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);
      void consumer.stop().catch(() => undefined);
      void consumer.disconnect().catch(() => undefined);

      if (error) {
        reject(error);
        return;
      }

      if (!message) {
        reject(new Error(`Kafka consumer finished without a message on ${topic}`));
        return;
      }

      resolve(message);
    };

    const timeout = setTimeout(() => {
      finish(new Error(`Timed out waiting for Kafka message on ${topic}`));
    }, timeoutMs);

    consumer
      .subscribe({ fromBeginning: true, topic })
      .then(() =>
        consumer.run({
          eachMessage: (payload: EachMessagePayload) => {
            if (!predicate(payload.message)) {
              return Promise.resolve();
            }

            finish(undefined, payload.message);
            return Promise.resolve();
          },
        }),
      )
      .catch((error: unknown) => {
        finish(error instanceof Error ? error : new Error(String(error)));
      });
  });
}

function parseKafkaJson<T>(message: KafkaMessage): T | undefined {
  if (!message.value) {
    return undefined;
  }

  try {
    return JSON.parse(message.value.toString('utf8')) as T;
  } catch {
    return undefined;
  }
}

function decodeHeaders(headers: IHeaders | undefined): Record<string, string> {
  if (!headers) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(headers).flatMap(([key, value]) => {
      if (value === undefined) {
        return [];
      }

      const first = Array.isArray(value) ? value[0] : value;
      if (first === undefined) {
        return [];
      }

      return [[key, Buffer.isBuffer(first) ? first.toString('utf8') : String(first)]];
    }),
  );
}

function uniqueMessageId(): string {
  return randomUUID().replaceAll('-', '');
}

function httpServer(app: INestApplication): SupertestApp {
  return app.getHttpServer() as SupertestApp;
}
