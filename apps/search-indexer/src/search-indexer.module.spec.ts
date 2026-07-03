import { Test } from '@nestjs/testing';

describe('SearchIndexerModule', () => {
  beforeEach(() => {
    process.env = {
      ...process.env,
      ELASTICSEARCH_NODE: 'http://localhost:9200',
      KAFKA_BROKERS: 'localhost:9094',
      KAFKA_CLIENT_ID: 'message-management-api',
      LOG_LEVEL: 'silent',
      NODE_ENV: 'test',
    };
  });

  it('compiles', async () => {
    const { SearchIndexerModule } = await import('./search-indexer.module');
    const moduleRef = await Test.createTestingModule({
      imports: [SearchIndexerModule],
    }).compile();

    expect(moduleRef).toBeDefined();
    await moduleRef.close();
  });
});
