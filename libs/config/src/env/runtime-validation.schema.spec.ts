import { createRuntimeValidationSchema } from './runtime-validation.schema';

const sha256Hash = 'a'.repeat(64);

describe('createRuntimeValidationSchema', () => {
  it('requires api-only operational settings for the api runtime', () => {
    const result = createRuntimeValidationSchema('api').validate(
      {
        API_KEYS: `local:${sha256Hash}`,
        ELASTICSEARCH_NODE: 'http://localhost:9200',
        MONGODB_URI: 'mongodb://localhost:27017/message_management?replicaSet=rs0',
      },
      { allowUnknown: true },
    );

    expect(result.error).toBeUndefined();
    expect(result.value).toMatchObject({
      LOG_LEVEL: 'info',
      NODE_ENV: 'development',
      PORT: 3000,
    });
  });

  it('rejects malformed API key config', () => {
    const result = createRuntimeValidationSchema('api').validate(
      {
        API_KEYS: 'local:not-a-hash',
        ELASTICSEARCH_NODE: 'http://localhost:9200',
        MONGODB_URI: 'mongodb://localhost:27017/message_management?replicaSet=rs0',
      },
      { allowUnknown: true },
    );

    expect(result.error?.message).toContain('API_KEYS');
  });

  it('validates worker-specific Kafka config independently from API keys', () => {
    const result = createRuntimeValidationSchema('search-indexer').validate(
      {
        ELASTICSEARCH_NODE: 'http://localhost:9200',
        KAFKA_BROKERS: 'localhost:9094,kafka:9092',
      },
      { allowUnknown: true },
    );

    expect(result.error).toBeUndefined();
  });

  it('does not require command-specific infrastructure config at CLI bootstrap', () => {
    const result = createRuntimeValidationSchema('cli').validate(
      {
        NODE_ENV: 'test',
      },
      { allowUnknown: true },
    );

    expect(result.error).toBeUndefined();
  });

  it('still validates CLI infrastructure config when provided', () => {
    const result = createRuntimeValidationSchema('cli').validate(
      {
        KAFKA_BROKERS: 'not-a-broker',
        NODE_ENV: 'test',
      },
      { allowUnknown: true },
    );

    expect(result.error?.message).toContain('KAFKA_BROKERS');
  });
});
