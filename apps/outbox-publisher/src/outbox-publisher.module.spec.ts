import { Test } from '@nestjs/testing';

import { OutboxPublisherModule } from './outbox-publisher.module';

describe('OutboxPublisherModule', () => {
  it('compiles', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [OutboxPublisherModule],
    }).compile();

    expect(moduleRef).toBeDefined();
    await moduleRef.close();
  });
});
