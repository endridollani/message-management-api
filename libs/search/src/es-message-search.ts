import { Injectable } from '@nestjs/common';
import { ElasticsearchService } from '@nestjs/elasticsearch';

import { SearchUnavailableError } from '@app/domain';
import type {
  MessageSearchPort,
  SearchMessageDocument,
  SearchMessagesQuery,
  SearchMessagesResult,
} from '@app/domain';

import { MESSAGES_READ_ALIAS, MESSAGES_WRITE_ALIAS } from './search.constants';

type EsMessageDocument = {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
};

type EsSearchHit = {
  _score?: number | null;
  _source?: EsMessageDocument;
};

type EsSearchResponse = {
  hits: {
    total?: number | { value: number };
    hits: EsSearchHit[];
  };
};

@Injectable()
export class EsMessageSearch implements MessageSearchPort {
  constructor(private readonly elasticsearch: ElasticsearchService) {}

  async indexMessage(document: SearchMessageDocument): Promise<void> {
    const body = projectMessageDocument(document);

    await this.elasticsearch.index({
      document: body,
      id: document.id,
      index: MESSAGES_WRITE_ALIAS,
    });
  }

  async searchMessages(query: SearchMessagesQuery): Promise<SearchMessagesResult> {
    try {
      const response = (await this.elasticsearch.search<EsMessageDocument>({
        from: (query.page - 1) * query.limit,
        index: MESSAGES_READ_ALIAS,
        query: {
          bool: {
            filter: [
              {
                term: {
                  conversationId: query.conversationId,
                },
              },
            ],
            must: [
              {
                match: {
                  content: {
                    operator: 'and',
                    query: query.q,
                  },
                },
              },
            ],
          },
        },
        size: query.limit,
        sort: [{ _score: { order: 'desc' } }, { timestamp: { order: 'desc' } }],
        track_total_hits: true,
      })) as EsSearchResponse;

      const total = getTotalHits(response.hits.total);

      return {
        data: response.hits.hits.flatMap((hit) => mapHit(hit)),
        pagination: {
          page: query.page,
          limit: query.limit,
          total,
          totalPages: Math.ceil(total / query.limit),
        },
      };
    } catch (error) {
      throw new SearchUnavailableError(
        error instanceof Error ? error.message : 'Search is temporarily unavailable',
      );
    }
  }
}

export function projectMessageDocument(document: SearchMessageDocument): EsMessageDocument {
  return {
    id: document.id,
    conversationId: document.conversationId,
    senderId: document.senderId,
    content: document.content,
    timestamp: document.timestamp.toISOString(),
    ...(document.metadata === undefined ? {} : { metadata: document.metadata }),
  };
}

function mapHit(hit: EsSearchHit): SearchMessagesResult['data'] {
  if (!hit._source) {
    return [];
  }

  return [
    {
      id: hit._source.id,
      conversationId: hit._source.conversationId,
      senderId: hit._source.senderId,
      content: hit._source.content,
      timestamp: new Date(hit._source.timestamp),
      score: hit._score ?? 0,
      ...(hit._source.metadata === undefined ? {} : { metadata: hit._source.metadata }),
    },
  ];
}

function getTotalHits(total: EsSearchResponse['hits']['total']): number {
  if (typeof total === 'number') {
    return total;
  }

  return total?.value ?? 0;
}
