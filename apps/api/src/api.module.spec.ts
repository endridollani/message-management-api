import { Test } from '@nestjs/testing';

const originalEnv = process.env;
const sha256Hash = 'a'.repeat(64);

describe('ApiModule', () => {
  beforeEach(() => {
    jest.resetModules();
    process.env = {
      ...originalEnv,
      API_KEYS: `local:${sha256Hash}`,
      ELASTICSEARCH_NODE: 'http://localhost:9200',
      LOG_LEVEL: 'silent',
      MONGODB_URI: 'mongodb://localhost:27017/message_management?replicaSet=rs0',
      NODE_ENV: 'test',
      PORT: '0',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('compiles', async () => {
    const { ApiModule } = await import('./api.module');
    const moduleRef = await Test.createTestingModule({
      imports: [ApiModule],
    }).compile();

    expect(moduleRef).toBeDefined();
    await moduleRef.close();
  });
});
