import { Test } from '@nestjs/testing';

describe('CliModule', () => {
  const previousEnv = {
    ELASTICSEARCH_NODE: process.env['ELASTICSEARCH_NODE'],
    KAFKA_BROKERS: process.env['KAFKA_BROKERS'],
    MONGODB_URI: process.env['MONGODB_URI'],
  };

  beforeEach(() => {
    process.env['ELASTICSEARCH_NODE'] = 'http://localhost:9200';
    process.env['KAFKA_BROKERS'] = 'localhost:9094';
    process.env['MONGODB_URI'] =
      'mongodb://localhost:27017/message_management?replicaSet=rs0&directConnection=true';
  });

  afterEach(() => {
    restoreEnv('ELASTICSEARCH_NODE', previousEnv.ELASTICSEARCH_NODE);
    restoreEnv('KAFKA_BROKERS', previousEnv.KAFKA_BROKERS);
    restoreEnv('MONGODB_URI', previousEnv.MONGODB_URI);
  });

  it('compiles', async () => {
    const { CliModule } = await import('./cli.module');
    const moduleRef = await Test.createTestingModule({
      imports: [CliModule],
    }).compile();

    expect(moduleRef).toBeDefined();
    await moduleRef.close();
  });
});

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
    return;
  }

  process.env[name] = value;
}
