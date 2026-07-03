import { createApiTestHarness, type ApiTestHarness } from '../../../test/e2e/api-test-harness';

describe('ApiModule', () => {
  let harness: ApiTestHarness;

  afterEach(async () => {
    await harness.close();
  });

  it('compiles', async () => {
    harness = await createApiTestHarness();

    expect(harness.moduleRef).toBeDefined();
  }, 60_000);
});
