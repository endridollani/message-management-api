import { Test } from '@nestjs/testing';

import { ApiModule } from './api.module';

describe('ApiModule', () => {
  it('compiles', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ApiModule],
    }).compile();

    expect(moduleRef).toBeDefined();
    await moduleRef.close();
  });
});
