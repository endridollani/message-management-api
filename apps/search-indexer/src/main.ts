import { NestFactory } from '@nestjs/core';

import { SearchIndexerModule } from './search-indexer.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(SearchIndexerModule);
  app.enableShutdownHooks();
}

void bootstrap();
