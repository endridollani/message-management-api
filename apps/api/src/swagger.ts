import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { OpenAPIObject } from '@nestjs/swagger';

export const API_KEY_SECURITY_NAME = 'x-api-key';

export function createOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('Message Management API')
    .setDescription('Transactional outbox message API with Kafka indexing and Elasticsearch search')
    .setVersion('1.0.0')
    .addApiKey(
      {
        description: 'Raw API key supplied by trusted internal service callers.',
        in: 'header',
        name: 'x-api-key',
        type: 'apiKey',
      },
      API_KEY_SECURITY_NAME,
    )
    .build();

  return SwaggerModule.createDocument(app, config);
}

export function setupSwagger(app: INestApplication): void {
  const document = createOpenApiDocument(app);

  SwaggerModule.setup('docs', app, document, {
    customSiteTitle: 'Message Management API Docs',
    jsonDocumentUrl: 'docs-json',
    raw: ['json'],
  });
}
