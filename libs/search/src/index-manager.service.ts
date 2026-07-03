import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ElasticsearchService } from '@nestjs/elasticsearch';

import {
  MESSAGES_PHYSICAL_INDEX,
  MESSAGES_READ_ALIAS,
  MESSAGES_WRITE_ALIAS,
} from './search.constants';
import { messagesV1IndexDefinition } from './mappings/messages-v1.mapping';

@Injectable()
export class IndexManagerService implements OnModuleInit {
  private readonly logger = new Logger(IndexManagerService.name);

  constructor(private readonly elasticsearch: ElasticsearchService) {}

  async onModuleInit(): Promise<void> {
    await this.ensureMessagesIndex();
  }

  async ensureMessagesIndex(): Promise<void> {
    const exists = await this.elasticsearch.indices.exists({
      index: MESSAGES_PHYSICAL_INDEX,
    });

    if (!exists) {
      await this.createMessagesIndex();
    }

    await this.ensureAliases();
  }

  private async createMessagesIndex(): Promise<void> {
    try {
      await this.elasticsearch.indices.create({
        index: MESSAGES_PHYSICAL_INDEX,
        ...messagesV1IndexDefinition,
      });
      this.logger.log({ index: MESSAGES_PHYSICAL_INDEX }, 'Created Elasticsearch index');
    } catch (error) {
      if (isResourceAlreadyExistsError(error)) {
        return;
      }

      throw error;
    }
  }

  private async ensureAliases(): Promise<void> {
    const [readAliasExists, writeAliasExists] = await Promise.all([
      this.elasticsearch.indices.existsAlias({ name: MESSAGES_READ_ALIAS }),
      this.elasticsearch.indices.existsAlias({ name: MESSAGES_WRITE_ALIAS }),
    ]);

    const actions = [
      ...(readAliasExists
        ? []
        : [
            {
              add: {
                alias: MESSAGES_READ_ALIAS,
                index: MESSAGES_PHYSICAL_INDEX,
              },
            },
          ]),
      ...(writeAliasExists
        ? []
        : [
            {
              add: {
                alias: MESSAGES_WRITE_ALIAS,
                index: MESSAGES_PHYSICAL_INDEX,
                is_write_index: true,
              },
            },
          ]),
    ];

    if (actions.length === 0) {
      return;
    }

    await this.elasticsearch.indices.updateAliases({ actions });
  }
}

function isResourceAlreadyExistsError(error: unknown): boolean {
  if (!isErrorWithMeta(error)) {
    return false;
  }

  return (
    error.meta.statusCode === 400 &&
    error.meta.body.error.type === 'resource_already_exists_exception'
  );
}

function isErrorWithMeta(error: unknown): error is {
  meta: { statusCode?: number; body: { error: { type?: string } } };
} {
  if (typeof error !== 'object' || error === null || !('meta' in error)) {
    return false;
  }

  const meta = (error as { meta?: unknown }).meta;
  if (typeof meta !== 'object' || meta === null || !('body' in meta)) {
    return false;
  }

  const body = (meta as { body?: unknown }).body;
  if (typeof body !== 'object' || body === null || !('error' in body)) {
    return false;
  }

  const bodyError = (body as { error?: unknown }).error;
  return typeof bodyError === 'object' && bodyError !== null;
}
