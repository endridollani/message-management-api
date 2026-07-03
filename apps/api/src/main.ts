import { RequestMethod, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpAdapterHost } from '@nestjs/core';
import { NestFactory } from '@nestjs/core';
import { CorrelationIdContext } from '@app/observability';
import { json } from 'express';
import { Logger } from 'nestjs-pino';

import { ApiModule } from './api.module';
import { AllExceptionsFilter } from './filters/all-exceptions.filter';
import { setupSwagger } from './swagger';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(ApiModule, {
    bodyParser: false,
    bufferLogs: true,
  });

  app.useLogger(app.get(Logger));
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

  app.enableShutdownHooks();
  setupSwagger(app);

  const configService = app.get(ConfigService);
  const port = configService.get<number>('app.port') ?? 3000;
  await app.listen(port);
}

void bootstrap();
