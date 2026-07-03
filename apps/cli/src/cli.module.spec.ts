import { Test } from '@nestjs/testing';

import { CliModule } from './cli.module';

describe('CliModule', () => {
  it('compiles', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [CliModule],
    }).compile();

    expect(moduleRef).toBeDefined();
    await moduleRef.close();
  });
});
