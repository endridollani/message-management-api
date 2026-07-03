import { Client } from '@elastic/elasticsearch';
import { Injectable, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  MESSAGES_READ_ALIAS,
  MESSAGES_WRITE_ALIAS,
  messagesV1IndexDefinition,
} from '@app/search';

export type EsReindexInput = {
  dryRun: boolean;
  targetIndex?: string;
};

export type EsReindexResult = {
  aliasesSwapped: boolean;
  previousWriteIndices: string[];
  sourceCount: number;
  sourceIndices: string[];
  targetCount?: number;
  targetIndex: string;
};

type CountResponse = {
  count: number;
};

type ReindexResponse = {
  failures?: unknown[];
};

@Injectable()
export class EsReindexService implements OnApplicationShutdown {
  private client?: Client;

  constructor(private readonly configService: ConfigService) {}

  async onApplicationShutdown(): Promise<void> {
    if (this.client) {
      await this.client.close();
    }
  }

  async reindex(input: EsReindexInput): Promise<EsReindexResult> {
    const client = this.getClient();
    const [sourceIndices, previousWriteIndices] = await Promise.all([
      getAliasIndices(client, MESSAGES_READ_ALIAS),
      getAliasIndices(client, MESSAGES_WRITE_ALIAS),
    ]);

    if (sourceIndices.length === 0) {
      throw new Error(`Alias ${MESSAGES_READ_ALIAS} does not point at any index.`);
    }

    const targetIndex = normalizeTargetIndex(input.targetIndex, sourceIndices);
    const sourceCount = await countDocuments(client, MESSAGES_READ_ALIAS);
    const targetExists = await client.indices.exists({ index: targetIndex });

    if (input.dryRun) {
      return {
        aliasesSwapped: false,
        previousWriteIndices,
        sourceCount,
        sourceIndices,
        targetIndex,
      };
    }

    if (targetExists) {
      throw new Error(`Target index already exists: ${targetIndex}`);
    }

    await client.indices.create({
      index: targetIndex,
      ...messagesV1IndexDefinition,
    });

    const reindexResponse = (await client.reindex({
      conflicts: 'proceed',
      dest: {
        index: targetIndex,
      },
      refresh: true,
      source: {
        index: MESSAGES_READ_ALIAS,
      },
      wait_for_completion: true,
    })) as ReindexResponse;

    if (reindexResponse.failures && reindexResponse.failures.length > 0) {
      throw new Error(`Elasticsearch reindex reported ${reindexResponse.failures.length} failures.`);
    }

    const targetCount = await countDocuments(client, targetIndex);

    if (targetCount !== sourceCount) {
      throw new Error(
        `Reindex count verification failed: source=${sourceCount}, target=${targetCount}.`,
      );
    }

    await client.indices.updateAliases({
      actions: buildAliasSwapActions({
        previousReadIndices: sourceIndices,
        previousWriteIndices,
        targetIndex,
      }),
    });

    return {
      aliasesSwapped: true,
      previousWriteIndices,
      sourceCount,
      sourceIndices,
      targetCount,
      targetIndex,
    };
  }

  private getClient(): Client {
    if (!this.client) {
      this.client = new Client({
        node: this.configService.getOrThrow<string>('elasticsearch.node'),
      });
    }

    return this.client;
  }
}

type AliasLookupResponse = Record<string, unknown>;

async function getAliasIndices(client: Client, alias: string): Promise<string[]> {
  try {
    const response = (await client.indices.getAlias({ name: alias })) as AliasLookupResponse;
    return Object.keys(response).sort();
  } catch (error) {
    if (isElasticsearchNotFound(error)) {
      return [];
    }

    throw error;
  }
}

async function countDocuments(client: Client, index: string): Promise<number> {
  const response = (await client.count({ index })) as CountResponse;
  return response.count;
}

function normalizeTargetIndex(targetIndex: string | undefined, sourceIndices: string[]): string {
  if (targetIndex && /^messages-v[1-9]\d*$/.test(targetIndex)) {
    return targetIndex;
  }

  if (targetIndex && /^v[1-9]\d*$/.test(targetIndex)) {
    return `messages-${targetIndex}`;
  }

  if (targetIndex && /^[1-9]\d*$/.test(targetIndex)) {
    return `messages-v${targetIndex}`;
  }

  if (targetIndex) {
    throw new Error('Target index must look like v2, 2, or messages-v2.');
  }

  return `messages-v${nextIndexVersion(sourceIndices)}`;
}

function nextIndexVersion(indices: string[]): number {
  const versions = indices.flatMap((index) => {
    const match = /^messages-v([1-9]\d*)$/.exec(index);
    return match?.[1] === undefined ? [] : [Number(match[1])];
  });

  return Math.max(1, ...versions) + 1;
}

type AliasSwapInput = {
  previousReadIndices: string[];
  previousWriteIndices: string[];
  targetIndex: string;
};

type AliasAction =
  | { remove: { alias: string; index: string } }
  | { add: { alias: string; index: string; is_write_index?: boolean } };

function buildAliasSwapActions(input: AliasSwapInput): AliasAction[] {
  const actions: AliasAction[] = [];

  for (const index of input.previousReadIndices) {
    actions.push({
      remove: {
        alias: MESSAGES_READ_ALIAS,
        index,
      },
    });
  }

  for (const index of input.previousWriteIndices) {
    actions.push({
      remove: {
        alias: MESSAGES_WRITE_ALIAS,
        index,
      },
    });
  }

  actions.push(
    {
      add: {
        alias: MESSAGES_READ_ALIAS,
        index: input.targetIndex,
      },
    },
    {
      add: {
        alias: MESSAGES_WRITE_ALIAS,
        index: input.targetIndex,
        is_write_index: true,
      },
    },
  );

  return actions;
}

function isElasticsearchNotFound(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('meta' in error)) {
    return false;
  }

  const meta = (error as { meta?: { statusCode?: number } }).meta;
  return meta?.statusCode === 404;
}
