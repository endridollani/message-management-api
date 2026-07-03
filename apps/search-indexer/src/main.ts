import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';

import { SearchIndexerModule } from './search-indexer.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(SearchIndexerModule, {
    bufferLogs: true,
  });

  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();

  const configService = app.get(ConfigService);
  const port = configService.get<number>('searchIndexer.healthPort') ?? 3002;
  await app.listen(port);
}

void bootstrap();
