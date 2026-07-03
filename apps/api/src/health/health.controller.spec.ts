import type { Response } from 'express';

import { createApiTestHarness, type ApiTestHarness } from '../../../../test/e2e/api-test-harness';

describe('Health and metrics controllers', () => {
  let harness: ApiTestHarness;

  beforeAll(async () => {
    harness = await createApiTestHarness();
  }, 60_000);

  afterAll(async () => {
    await harness.close();
  });

  it('reports process liveness', async () => {
    const { HealthController } = await import('./health.controller');
    const healthController = harness.moduleRef.get(HealthController);

    const response = await healthController.liveness();

    expect(response.status).toBe('ok');
    expect(response.details).toMatchObject({
      process: {
        status: 'up',
      },
    });
  });

  it('reports runtime and MongoDB readiness', async () => {
    const { HealthController } = await import('./health.controller');
    const healthController = harness.moduleRef.get(HealthController);

    const response = await healthController.readiness();

    expect(response.status).toBe('ok');
    expect(response.details).toMatchObject({
      runtime: {
        status: 'up',
      },
      mongodb: {
        status: 'up',
      },
    });
  });

  it('renders prometheus metrics', async () => {
    const { MetricsController } = await import('../metrics/metrics.controller');
    const metricsController = harness.moduleRef.get(MetricsController);
    const response = {
      type: jest.fn(),
    };

    const body = await metricsController.metrics(response as unknown as Response);

    expect(response.type).toHaveBeenCalledWith('text/plain; version=0.0.4; charset=utf-8');
    expect(body).toContain('message_management_process_cpu_user_seconds_total');
  });
});
