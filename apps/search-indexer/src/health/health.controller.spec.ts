import { HealthController } from './health.controller';

describe('Search indexer health controller', () => {
  it('reports readiness when the consumer runner is active', async () => {
    const controller = createController({ consumerRunning: true });

    await expect(controller.readiness()).resolves.toMatchObject({
      status: 'ok',
      details: {
        consumer: {
          status: 'up',
        },
      },
    });
  });

  it('fails readiness when the consumer runner is stopped', async () => {
    const controller = createController({ consumerRunning: false });

    await expect(controller.readiness()).rejects.toThrow('Search indexer consumer is not running');
  });
});

function createController(input: { consumerRunning: boolean }): HealthController {
  return new HealthController(
    {
      check: jest.fn(async (indicators: Array<() => unknown>) => {
        const results = await Promise.all(indicators.map((indicator) => indicator()));
        const details = Object.assign({}, ...results);

        return {
          status: 'ok',
          info: details,
          error: {},
          details,
        };
      }),
    } as never,
    {
      check: jest.fn((key: string) => ({
        down: (details: Record<string, unknown>) => ({
          [key]: {
            status: 'down',
            ...details,
          },
        }),
        up: (details: Record<string, unknown>) => ({
          [key]: {
            status: 'up',
            ...details,
          },
        }),
      })),
    } as never,
    {
      isReady: jest.fn().mockReturnValue({
        runtime: {
          status: 'up',
        },
      }),
    } as never,
    {
      isReady: jest.fn().mockResolvedValue({
        kafka: {
          status: 'up',
        },
      }),
    } as never,
    {
      isWriteReady: jest.fn().mockResolvedValue({
        elasticsearch: {
          status: 'up',
        },
      }),
    } as never,
    {
      isRunning: jest.fn().mockReturnValue(input.consumerRunning),
    } as never,
  );
}
