import { INestApplication, RequestMethod, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpAdapterHost } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { getConnectionToken } from '@nestjs/mongoose';
import { MESSAGE_SEARCH } from '@app/domain';
import type { MessageSearchPort } from '@app/domain';
import { CorrelationIdContext } from '@app/observability';
import { ElasticsearchHealthIndicator, IndexManagerService } from '@app/search';
import { json } from 'express';
import { Connection } from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { createHash } from 'node:crypto';

import { AllExceptionsFilter } from '../../apps/api/src/filters/all-exceptions.filter';
import { setupSwagger } from '../../apps/api/src/swagger';

export const VALID_API_KEY = 'valid-api-key';
const API_KEY_HASH = createHash('sha256').update(VALID_API_KEY).digest('hex');

export type ApiTestHarness = {
  app: INestApplication;
  moduleRef: TestingModule;
  connection: Connection;
  replSet: MongoMemoryReplSet;
  searchPort: jest.Mocked<MessageSearchPort>;
  close: () => Promise<void>;
};

export async function createApiTestHarness(): Promise<ApiTestHarness> {
  const replSet = await MongoMemoryReplSet.create({
    replSet: {
      count: 1,
      storageEngine: 'wiredTiger',
    },
  });

  process.env = {
    ...process.env,
    API_KEYS: `local:${API_KEY_HASH}`,
    ELASTICSEARCH_NODE: 'http://localhost:9200',
    LOG_LEVEL: 'silent',
    MONGODB_URI: replSet.getUri('message_management'),
    NODE_ENV: 'test',
    PORT: '0',
  };

  const { ApiModule } = await import('../../apps/api/src/api.module');
  const searchPort: jest.Mocked<MessageSearchPort> = {
    indexMessage: jest.fn(),
    searchMessages: jest.fn().mockResolvedValue({
      data: [],
      pagination: {
        page: 1,
        limit: 20,
        total: 0,
        totalPages: 0,
      },
    }),
  };
  const moduleRef = await Test.createTestingModule({
    imports: [ApiModule],
  })
    .overrideProvider(MESSAGE_SEARCH)
    .useValue(searchPort)
    .overrideProvider(IndexManagerService)
    .useValue({
      ensureMessagesIndex: jest.fn(),
      onModuleInit: jest.fn(),
    })
    .overrideProvider(ElasticsearchHealthIndicator)
    .useValue({
      isReadReady: jest.fn().mockReturnValue({
        elasticsearch: {
          alias: 'messages-read',
          status: 'up',
        },
      }),
    })
    .compile();
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
  setupSwagger(app);

  await app.init();

  const connection = moduleRef.get<Connection>(getConnectionToken());
  const configService = moduleRef.get(ConfigService);

  expect(configService.get('mongodb.uri')).toBe(replSet.getUri('message_management'));

  return {
    app,
    moduleRef,
    connection,
    replSet,
    searchPort,
    close: async () => {
      await app.close();
      await replSet.stop();
    },
  };
}
