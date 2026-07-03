import type { INestApplication } from '@nestjs/common';
import * as request from 'supertest';

import { API_KEY_SECURITY_NAME } from '../../apps/api/src/swagger';
import { createApiTestHarness, type ApiTestHarness } from './api-test-harness';

type SupertestApp = Parameters<typeof request>[0];

type OpenApiDocument = {
  info: {
    title: string;
    description: string;
    version: string;
  };
  paths: Record<
    string,
    Record<
      string,
      {
        security?: Array<Record<string, string[]>>;
      }
    >
  >;
  components?: {
    securitySchemes?: Record<string, unknown>;
  };
};

describe('OpenAPI documentation', () => {
  let harness: ApiTestHarness;
  let app: INestApplication;

  beforeAll(async () => {
    harness = await createApiTestHarness();
    app = harness.app;
  }, 60_000);

  afterAll(async () => {
    await harness.close();
  });

  it('serves Swagger UI at /docs without an API key', async () => {
    const response = await request(httpServer(app)).get('/docs').expect(200);

    expect(response.text).toContain('swagger-ui');
    expect(response.text).toContain('Message Management API Docs');
  });

  it('serves OpenAPI JSON at /docs-json with API-key security on protected endpoints', async () => {
    const response = await request(httpServer(app)).get('/docs-json').expect(200);
    const document = response.body as OpenApiDocument;

    expect(document.info).toMatchObject({
      title: 'Message Management API',
      description: 'Transactional outbox message API with Kafka indexing and Elasticsearch search',
      version: '1.0.0',
    });
    expect(document.components?.securitySchemes).toHaveProperty(API_KEY_SECURITY_NAME);
    expect(document.paths['/api/messages']?.['post']?.security).toContainEqual({
      [API_KEY_SECURITY_NAME]: [],
    });
    expect(
      document.paths['/api/conversations/{conversationId}/messages']?.['get']?.security,
    ).toContainEqual({ [API_KEY_SECURITY_NAME]: [] });
    expect(
      document.paths['/api/conversations/{conversationId}/messages/search']?.['get']?.security,
    ).toContainEqual({ [API_KEY_SECURITY_NAME]: [] });
    expect(document.paths['/health/liveness']).toBeDefined();
    expect(document.paths['/health/readiness']).toBeDefined();
    expect(document.paths['/metrics']).toBeDefined();
  });
});

function httpServer(app: INestApplication): SupertestApp {
  return app.getHttpServer() as SupertestApp;
}
