import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';

import { OutboxPublisherModule } from './outbox-publisher.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(OutboxPublisherModule, {
    bufferLogs: true,
  });

  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();

  const configService = app.get(ConfigService);
  const port = configService.get<number>('outbox.healthPort') ?? 3001;
  await app.listen(port);
}

void bootstrap();
