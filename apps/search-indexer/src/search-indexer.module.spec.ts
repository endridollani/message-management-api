import { Test } from '@nestjs/testing';

import { SearchIndexerModule } from './search-indexer.module';

describe('SearchIndexerModule', () => {
  it('compiles', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [SearchIndexerModule],
    }).compile();

    expect(moduleRef).toBeDefined();
    await moduleRef.close();
  });
});
