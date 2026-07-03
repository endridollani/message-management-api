import { NestFactory } from '@nestjs/core';

import { CliModule } from './cli.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(CliModule);
  app.enableShutdownHooks();
  await app.close();
}

void bootstrap();
