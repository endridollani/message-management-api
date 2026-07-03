import { IndexManagerService } from './index-manager.service';
import {
  MESSAGES_PHYSICAL_INDEX,
  MESSAGES_READ_ALIAS,
  MESSAGES_WRITE_ALIAS,
} from './search.constants';
import { messagesV1IndexDefinition } from './mappings/messages-v1.mapping';

describe('IndexManagerService', () => {
  it('creates the messages index and aliases when missing', async () => {
    const elasticsearch = mockElasticsearch({
      exists: jest.fn().mockResolvedValue(false),
    });
    const service = new IndexManagerService(elasticsearch as never);

    await service.ensureMessagesIndex();

    expect(elasticsearch.indices.create).toHaveBeenCalledWith({
      index: MESSAGES_PHYSICAL_INDEX,
      ...messagesV1IndexDefinition,
    });
    expect(elasticsearch.indices.updateAliases).toHaveBeenCalledWith({
      actions: [
        {
          add: {
            alias: MESSAGES_READ_ALIAS,
            index: MESSAGES_PHYSICAL_INDEX,
          },
        },
        {
          add: {
            alias: MESSAGES_WRITE_ALIAS,
            index: MESSAGES_PHYSICAL_INDEX,
            is_write_index: true,
          },
        },
      ],
    });
  });

  it('only ensures aliases when the index already exists', async () => {
    const elasticsearch = mockElasticsearch({
      exists: jest.fn().mockResolvedValue(true),
    });
    const service = new IndexManagerService(elasticsearch as never);

    await service.ensureMessagesIndex();

    expect(elasticsearch.indices.create).not.toHaveBeenCalled();
    expect(elasticsearch.indices.updateAliases).toHaveBeenCalledTimes(1);
  });

  it('treats concurrent create races as idempotent', async () => {
    const elasticsearch = mockElasticsearch({
      create: jest.fn().mockRejectedValue({
        meta: {
          statusCode: 400,
          body: {
            error: {
              type: 'resource_already_exists_exception',
            },
          },
        },
      }),
      exists: jest.fn().mockResolvedValue(false),
    });
    const service = new IndexManagerService(elasticsearch as never);

    await expect(service.ensureMessagesIndex()).resolves.toBeUndefined();
    expect(elasticsearch.indices.updateAliases).toHaveBeenCalledTimes(1);
  });
});

function mockElasticsearch(overrides: {
  create?: jest.Mock;
  exists?: jest.Mock;
  updateAliases?: jest.Mock;
}) {
  return {
    indices: {
      create: overrides.create ?? jest.fn().mockResolvedValue({}),
      exists: overrides.exists ?? jest.fn().mockResolvedValue(false),
      updateAliases: overrides.updateAliases ?? jest.fn().mockResolvedValue({}),
    },
  };
}
