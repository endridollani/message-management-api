import type { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { Types } from 'mongoose';
import type { Connection } from 'mongoose';
import { SearchUnavailableError } from '@app/domain';

import { createApiTestHarness, VALID_API_KEY, type ApiTestHarness } from './api-test-harness';

type SupertestApp = Parameters<typeof request>[0];

type MessageBody = {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
};

type ListBody = {
  data: MessageBody[];
  pagination: {
    limit: number;
    nextCursor: string | null;
    hasMore: boolean;
    sortOrder: 'asc' | 'desc';
  };
};

describe('Messages API contract', () => {
  let harness: ApiTestHarness;
  let app: INestApplication;
  let connection: Connection;

  beforeAll(async () => {
    harness = await createApiTestHarness();
    app = harness.app;
    connection = harness.connection;
  }, 60_000);

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await connection.db?.dropDatabase();
    await connection.syncIndexes();
    harness.searchPort.searchMessages.mockResolvedValue({
      data: [],
      pagination: {
        page: 1,
        limit: 20,
        total: 0,
        totalPages: 0,
      },
    });
  });

  it('creates a message and outbox event atomically', async () => {
    const response = await request(httpServer(app))
      .post('/api/messages')
      .set('x-api-key', VALID_API_KEY)
      .set('x-correlation-id', 'correlation-1')
      .send({
        conversationId: 'conversation-1',
        senderId: 'sender-1',
        content: '  hello world  ',
        metadata: { channel: 'sms' },
      })
      .expect(201);

    const body = response.body as MessageBody;

    expect(body).toMatchObject({
      id: expect.any(String),
      conversationId: 'conversation-1',
      senderId: 'sender-1',
      content: 'hello world',
      timestamp: expect.any(String),
      metadata: { channel: 'sms' },
    });

    const message = await connection.collection('messages').findOne({
      _id: new Types.ObjectId(body.id),
    });
    const messagesCount = await connection.collection('messages').countDocuments();
    const outboxEvent = await connection.collection('outbox_events').findOne();

    expect(message).toMatchObject({
      conversationId: 'conversation-1',
      content: 'hello world',
    });
    expect(messagesCount).toBe(1);
    expect(outboxEvent).toMatchObject({
      eventType: 'message.created',
      eventVersion: 1,
      topic: 'messages.message-created.v1',
      key: 'conversation-1',
      status: 'pending',
      attempts: 0,
      payload: expect.objectContaining({
        correlationId: 'correlation-1',
        payload: expect.objectContaining({
          id: body.id,
          content: 'hello world',
        }),
      }),
    });
  });

  it('rejects missing and invalid API keys', async () => {
    await request(httpServer(app)).post('/api/messages').send({}).expect(401);

    await request(httpServer(app))
      .get('/api/conversations/conversation-1/messages')
      .set('x-api-key', 'wrong')
      .expect(401);
  });

  it('rejects invalid POST bodies', async () => {
    const response = await request(httpServer(app))
      .post('/api/messages')
      .set('x-api-key', VALID_API_KEY)
      .send({
        conversationId: '',
        senderId: 'sender-1',
        content: '',
        extra: 'forbidden',
      })
      .expect(400);

    expect(response.body).toMatchObject({
      statusCode: 400,
      error: 'Bad Request',
      path: '/api/messages',
      correlationId: expect.any(String),
    });
  });

  it('lists conversation messages with cursor pagination', async () => {
    await createMessage(app, 'first');
    await createMessage(app, 'second');
    await createMessage(app, 'third');

    const firstPage = await request(httpServer(app))
      .get('/api/conversations/conversation-1/messages')
      .query({ limit: 2, sortOrder: 'asc' })
      .set('x-api-key', VALID_API_KEY)
      .expect(200);

    const firstPageBody = firstPage.body as ListBody;

    expect(firstPageBody.data.map((message) => message.content)).toEqual(['first', 'second']);
    expect(firstPageBody.pagination).toMatchObject({
      limit: 2,
      hasMore: true,
      sortOrder: 'asc',
      nextCursor: expect.any(String),
    });

    const secondPage = await request(httpServer(app))
      .get('/api/conversations/conversation-1/messages')
      .query({ limit: 2, sortOrder: 'asc', cursor: firstPageBody.pagination.nextCursor })
      .set('x-api-key', VALID_API_KEY)
      .expect(200);

    const secondPageBody = secondPage.body as ListBody;

    expect(secondPageBody.data.map((message) => message.content)).toEqual(['third']);
    expect(secondPageBody.pagination).toMatchObject({
      hasMore: false,
      nextCursor: null,
    });
  });

  it('rejects invalid list params and cursors', async () => {
    await request(httpServer(app))
      .get('/api/conversations/bad id/messages')
      .set('x-api-key', VALID_API_KEY)
      .expect(400);

    await request(httpServer(app))
      .get('/api/conversations/conversation-1/messages')
      .query({ cursor: 'invalid' })
      .set('x-api-key', VALID_API_KEY)
      .expect(400);
  });

  it('searches conversation messages with a mocked search port', async () => {
    harness.searchPort.searchMessages.mockResolvedValueOnce({
      data: [
        {
          id: '64f2d8e7a088f5d3d879c001',
          conversationId: 'conversation-1',
          senderId: 'sender-1',
          content: 'hello search',
          timestamp: new Date('2026-07-03T09:00:00.000Z'),
          score: 1.25,
          metadata: { channel: 'sms' },
        },
      ],
      pagination: {
        page: 2,
        limit: 5,
        total: 11,
        totalPages: 3,
      },
    });

    const response = await request(httpServer(app))
      .get('/api/conversations/conversation-1/messages/search')
      .query({ q: 'hello', page: 2, limit: 5 })
      .set('x-api-key', VALID_API_KEY)
      .expect(200);

    expect(harness.searchPort.searchMessages.mock.calls).toContainEqual([
      {
        conversationId: 'conversation-1',
        q: 'hello',
        page: 2,
        limit: 5,
      },
    ]);
    expect(response.body).toEqual({
      data: [
        {
          id: '64f2d8e7a088f5d3d879c001',
          conversationId: 'conversation-1',
          senderId: 'sender-1',
          content: 'hello search',
          timestamp: '2026-07-03T09:00:00.000Z',
          score: 1.25,
          metadata: { channel: 'sms' },
        },
      ],
      pagination: {
        page: 2,
        limit: 5,
        total: 11,
        totalPages: 3,
      },
    });
  });

  it('rejects invalid search queries', async () => {
    await request(httpServer(app))
      .get('/api/conversations/conversation-1/messages/search')
      .set('x-api-key', VALID_API_KEY)
      .expect(400);

    await request(httpServer(app))
      .get('/api/conversations/conversation-1/messages/search')
      .query({ q: 'term', limit: 51 })
      .set('x-api-key', VALID_API_KEY)
      .expect(400);
  });

  it('maps search unavailability to 503', async () => {
    harness.searchPort.searchMessages.mockRejectedValueOnce(new SearchUnavailableError());

    const response = await request(httpServer(app))
      .get('/api/conversations/conversation-1/messages/search')
      .query({ q: 'term' })
      .set('x-api-key', VALID_API_KEY)
      .expect(503);

    expect(response.body).toMatchObject({
      statusCode: 503,
      error: 'Service Unavailable',
      path: '/api/conversations/conversation-1/messages/search?q=term',
    });
  });
});

describe('API behavior during Elasticsearch outage', () => {
  let harness: ApiTestHarness;
  let app: INestApplication;

  beforeAll(async () => {
    harness = await createApiTestHarness({
      elasticsearchNode: 'http://127.0.0.1:1',
      elasticsearchReadiness: 'down',
      useActualIndexManager: true,
    });
    app = harness.app;
    harness.searchPort.searchMessages.mockRejectedValue(new SearchUnavailableError());
  }, 60_000);

  afterAll(async () => {
    await harness.close();
  });

  it('boots, marks readiness down, keeps create/list available, and returns 503 for search', async () => {
    const readiness = await request(httpServer(app)).get('/health/readiness').expect(503);

    expect(readiness.body).toMatchObject({
      error: {
        elasticsearch: {
          status: 'down',
          alias: 'messages-read',
        },
      },
    });

    await createMessage(app, 'mongo still works');

    const list = await request(httpServer(app))
      .get('/api/conversations/conversation-1/messages')
      .set('x-api-key', VALID_API_KEY)
      .expect(200);

    expect((list.body as ListBody).data.map((message) => message.content)).toEqual([
      'mongo still works',
    ]);

    await request(httpServer(app))
      .get('/api/conversations/conversation-1/messages/search')
      .query({ q: 'mongo' })
      .set('x-api-key', VALID_API_KEY)
      .expect(503);
  });
});

async function createMessage(app: INestApplication, content: string): Promise<void> {
  await request(httpServer(app))
    .post('/api/messages')
    .set('x-api-key', VALID_API_KEY)
    .send({
      conversationId: 'conversation-1',
      senderId: 'sender-1',
      content,
    })
    .expect(201);
}

function httpServer(app: INestApplication): SupertestApp {
  return app.getHttpServer() as SupertestApp;
}
