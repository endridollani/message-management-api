import { DynamicModule, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { createRuntimeValidationSchema } from './env/runtime-validation.schema';

export type MessageManagementRuntime = 'api' | 'outbox-publisher' | 'search-indexer' | 'cli';

@Module({})
export class MessageManagementConfigModule {
  static forRuntime(runtime: MessageManagementRuntime): DynamicModule {
    return {
      module: MessageManagementConfigModule,
      imports: [
        ConfigModule.forRoot({
          cache: true,
          envFilePath: ['.env'],
          isGlobal: true,
          load: [() => buildRuntimeConfig(runtime)],
          validationOptions: {
            abortEarly: false,
            allowUnknown: true,
          },
          validationSchema: createRuntimeValidationSchema(runtime),
        }),
      ],
      exports: [ConfigModule],
    };
  }
}

function buildRuntimeConfig(runtime: MessageManagementRuntime): Record<string, unknown> {
  return {
    app: {
      apiKeys: parseApiKeys(process.env['API_KEYS']),
      logLevel: process.env['LOG_LEVEL'] ?? 'info',
      nodeEnv: process.env['NODE_ENV'] ?? 'development',
      port: numberFromEnv('PORT', 3000),
      runtime,
    },
    elasticsearch: {
      node: process.env['ELASTICSEARCH_NODE'],
    },
    kafka: {
      brokers: parseCsv(process.env['KAFKA_BROKERS']),
      clientId: process.env['KAFKA_CLIENT_ID'] ?? 'message-management-api',
    },
    mongodb: {
      uri: process.env['MONGODB_URI'],
    },
    outbox: {
      batchSize: numberFromEnv('OUTBOX_BATCH_SIZE', 50),
      healthPort: numberFromEnv('OUTBOX_HEALTH_PORT', 3001),
      lockTimeoutMs: numberFromEnv('OUTBOX_LOCK_TIMEOUT_MS', 30_000),
      maxAttempts: numberFromEnv('OUTBOX_MAX_ATTEMPTS', 10),
      pollIntervalMs: numberFromEnv('OUTBOX_POLL_INTERVAL_MS', 500),
    },
    searchIndexer: {
      healthPort: numberFromEnv('INDEXER_HEALTH_PORT', 3002),
    },
  };
}

function numberFromEnv(name: string, defaultValue: number): number {
  const value = process.env[name];
  return value === undefined ? defaultValue : Number(value);
}

function parseCsv(value: string | undefined): string[] {
  return value
    ? value
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean)
    : [];
}

function parseApiKeys(value: string | undefined): Array<{ name: string; hash: string }> {
  return value
    ? value.split(',').map((entry) => {
        const [name, hash] = entry.split(':');
        return {
          name: name ?? '',
          hash: hash ?? '',
        };
      })
    : [];
}
