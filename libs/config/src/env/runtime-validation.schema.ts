import * as Joi from 'joi';

import type { MessageManagementRuntime } from '../message-management-config.module';

const ENVIRONMENTS = ['development', 'test', 'production'] as const;
const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;
const API_KEYS_PATTERN = /^[A-Za-z0-9_.-]+:[a-fA-F0-9]{64}(,[A-Za-z0-9_.-]+:[a-fA-F0-9]{64})*$/;

const baseSchema = {
  NODE_ENV: Joi.string()
    .valid(...ENVIRONMENTS)
    .default('development'),
  LOG_LEVEL: Joi.string()
    .valid(...LOG_LEVELS)
    .default('info'),
};

const apiSchema = {
  PORT: Joi.number().port().default(3000),
  API_KEYS: Joi.string().pattern(API_KEYS_PATTERN).required(),
  MONGODB_URI: Joi.string()
    .uri({ scheme: ['mongodb', 'mongodb+srv'] })
    .required(),
  ELASTICSEARCH_NODE: Joi.string()
    .uri({ scheme: ['http', 'https'] })
    .required(),
};

const mongoSchema = {
  MONGODB_URI: Joi.string()
    .uri({ scheme: ['mongodb', 'mongodb+srv'] })
    .required(),
};

const kafkaSchema = {
  KAFKA_BROKERS: Joi.string()
    .custom((value: string, helpers) => {
      const brokers = value
        .split(',')
        .map((broker) => broker.trim())
        .filter(Boolean);

      if (brokers.length === 0 || brokers.some((broker) => !broker.includes(':'))) {
        return helpers.error('any.invalid');
      }

      return brokers.join(',');
    }, 'comma-separated host:port list')
    .required(),
  KAFKA_CLIENT_ID: Joi.string().trim().min(1).default('message-management-api'),
};

const elasticsearchSchema = {
  ELASTICSEARCH_NODE: Joi.string()
    .uri({ scheme: ['http', 'https'] })
    .required(),
};

const outboxTuningSchema = {
  OUTBOX_POLL_INTERVAL_MS: Joi.number().integer().min(100).default(500),
  OUTBOX_BATCH_SIZE: Joi.number().integer().min(1).max(500).default(50),
  OUTBOX_MAX_ATTEMPTS: Joi.number().integer().min(1).max(100).default(10),
  OUTBOX_LOCK_TIMEOUT_MS: Joi.number().integer().min(1_000).default(30_000),
  OUTBOX_HEALTH_PORT: Joi.number().port().default(3001),
};

const indexerSchema = {
  INDEXER_HEALTH_PORT: Joi.number().port().default(3002),
};

export function createRuntimeValidationSchema(runtime: MessageManagementRuntime): Joi.ObjectSchema {
  const schemaByRuntime: Record<MessageManagementRuntime, Joi.SchemaMap> = {
    api: {
      ...baseSchema,
      ...apiSchema,
    },
    'outbox-publisher': {
      ...baseSchema,
      ...mongoSchema,
      ...kafkaSchema,
      ...outboxTuningSchema,
    },
    'search-indexer': {
      ...baseSchema,
      ...kafkaSchema,
      ...elasticsearchSchema,
      ...indexerSchema,
    },
    cli: {
      ...baseSchema,
      ...mongoSchema,
      ...kafkaSchema,
      ...elasticsearchSchema,
      ...outboxTuningSchema,
      ...indexerSchema,
    },
  };

  return Joi.object(schemaByRuntime[runtime]);
}
