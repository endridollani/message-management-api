import { SearchUnavailableError } from '@app/domain';

import { EsMessageSearch, projectMessageDocument } from './es-message-search';
import { MESSAGES_READ_ALIAS, MESSAGES_WRITE_ALIAS } from './search.constants';

describe('EsMessageSearch', () => {
  it('indexes through the write alias using the message id and mapped fields only', async () => {
    const elasticsearch = {
      index: jest.fn().mockResolvedValue({}),
      search: jest.fn(),
    };
    const service = new EsMessageSearch(elasticsearch as never);

    await service.indexMessage({
      id: 'message-1',
      conversationId: 'conversation-1',
      senderId: 'sender-1',
      content: 'hello world',
      timestamp: new Date('2026-07-03T09:00:00.000Z'),
      metadata: { channel: 'sms' },
    });

    expect(elasticsearch.index).toHaveBeenCalledWith({
      document: {
        id: 'message-1',
        conversationId: 'conversation-1',
        senderId: 'sender-1',
        content: 'hello world',
        timestamp: '2026-07-03T09:00:00.000Z',
        metadata: { channel: 'sms' },
      },
      id: 'message-1',
      index: MESSAGES_WRITE_ALIAS,
    });
  });

  it('queries through the read alias and maps hits with scores and total pages', async () => {
    const elasticsearch = {
      index: jest.fn(),
      search: jest.fn().mockResolvedValue({
        hits: {
          total: { value: 12 },
          hits: [
            {
              _score: 2.5,
              _source: {
                id: 'message-1',
                conversationId: 'conversation-1',
                senderId: 'sender-1',
                content: 'hello world',
                timestamp: '2026-07-03T09:00:00.000Z',
              },
            },
          ],
        },
      }),
    };
    const service = new EsMessageSearch(elasticsearch as never);

    const result = await service.searchMessages({
      conversationId: 'conversation-1',
      q: 'hello world',
      page: 2,
      limit: 5,
    });

    expect(elasticsearch.search).toHaveBeenCalledWith({
      from: 5,
      index: MESSAGES_READ_ALIAS,
      query: {
        bool: {
          filter: [
            {
              term: {
                conversationId: 'conversation-1',
              },
            },
          ],
          must: [
            {
              match: {
                content: {
                  operator: 'and',
                  query: 'hello world',
                },
              },
            },
          ],
        },
      },
      size: 5,
      sort: [{ _score: { order: 'desc' } }, { timestamp: { order: 'desc' } }],
      track_total_hits: true,
    });
    expect(result).toEqual({
      data: [
        {
          id: 'message-1',
          conversationId: 'conversation-1',
          senderId: 'sender-1',
          content: 'hello world',
          timestamp: new Date('2026-07-03T09:00:00.000Z'),
          score: 2.5,
        },
      ],
      pagination: {
        page: 2,
        limit: 5,
        total: 12,
        totalPages: 3,
      },
    });
  });

  it('wraps search client errors as unavailable', async () => {
    const elasticsearch = {
      index: jest.fn(),
      search: jest.fn().mockRejectedValue(new Error('connect ECONNREFUSED')),
    };
    const service = new EsMessageSearch(elasticsearch as never);

    await expect(
      service.searchMessages({
        conversationId: 'conversation-1',
        q: 'hello',
        page: 1,
        limit: 20,
      }),
    ).rejects.toBeInstanceOf(SearchUnavailableError);
  });
});

describe('projectMessageDocument', () => {
  it('returns only explicitly mapped Elasticsearch fields', () => {
    expect(
      projectMessageDocument({
        id: 'message-1',
        conversationId: 'conversation-1',
        senderId: 'sender-1',
        content: 'hello world',
        timestamp: new Date('2026-07-03T09:00:00.000Z'),
      }),
    ).toEqual({
      id: 'message-1',
      conversationId: 'conversation-1',
      senderId: 'sender-1',
      content: 'hello world',
      timestamp: '2026-07-03T09:00:00.000Z',
    });
  });
});
