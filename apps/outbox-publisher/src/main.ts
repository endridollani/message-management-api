import { NestFactory } from '@nestjs/core';

import { OutboxPublisherModule } from './outbox-publisher.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(OutboxPublisherModule);
  app.enableShutdownHooks();
}

void bootstrap();
