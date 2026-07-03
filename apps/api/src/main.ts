import { NestFactory } from '@nestjs/core';

import { ApiModule } from './api.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(ApiModule);
  app.enableShutdownHooks();

  const port = process.env['PORT'] ?? 3000;
  await app.listen(port);
}

void bootstrap();
