import { TestingModule, Test } from '@nestjs/testing';
import type { Response } from 'express';

const originalEnv = process.env;
const sha256Hash = 'a'.repeat(64);

describe('Health and metrics controllers', () => {
  let moduleRef: TestingModule;

  beforeEach(async () => {
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

    const { ApiModule } = await import('../api.module');
    moduleRef = await Test.createTestingModule({
      imports: [ApiModule],
    }).compile();
  });

  afterEach(async () => {
    await moduleRef.close();
    process.env = originalEnv;
  });

  it('reports process liveness', async () => {
    const { HealthController } = await import('./health.controller');
    const healthController = moduleRef.get(HealthController);

    const response = await healthController.liveness();

    expect(response.status).toBe('ok');
    expect(response.details).toMatchObject({
      process: {
        status: 'up',
      },
    });
  });

  it('reports runtime readiness placeholder', async () => {
    const { HealthController } = await import('./health.controller');
    const healthController = moduleRef.get(HealthController);

    const response = await healthController.readiness();

    expect(response.status).toBe('ok');
    expect(response.details).toMatchObject({
      runtime: {
        status: 'up',
      },
    });
  });

  it('renders prometheus metrics', async () => {
    const { MetricsController } = await import('../metrics/metrics.controller');
    const metricsController = moduleRef.get(MetricsController);
    const response = {
      type: jest.fn(),
    };

    const body = await metricsController.metrics(response as unknown as Response);

    expect(response.type).toHaveBeenCalledWith('text/plain; version=0.0.4; charset=utf-8');
    expect(body).toContain('message_management_process_cpu_user_seconds_total');
  });
});
