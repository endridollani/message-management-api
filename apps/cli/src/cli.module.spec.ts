import { Test } from '@nestjs/testing';

describe('CliModule', () => {
  const previousEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...previousEnv };
  });

  it('compiles without command-specific infrastructure env vars', async () => {
    delete process.env['ELASTICSEARCH_NODE'];
    delete process.env['KAFKA_BROKERS'];
    delete process.env['MONGODB_URI'];
    process.env['LOG_LEVEL'] = 'silent';
    process.env['NODE_ENV'] = 'test';

    const { CliModule } = await import('./cli.module');
    const moduleRef = await Test.createTestingModule({
      imports: [CliModule],
    }).compile();

    expect(moduleRef).toBeDefined();
    await moduleRef.close();
  });
});
