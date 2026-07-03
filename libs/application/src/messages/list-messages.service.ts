import { Inject, Injectable } from '@nestjs/common';

import { MESSAGE_REPOSITORY } from '@app/domain';
import type { Message, MessageRepositoryPort, MessageSortOrder } from '@app/domain';

import { decodeMessageCursor, encodeMessageCursor } from '../cursor/message-cursor';

export type ListMessagesQuery = {
  conversationId: string;
  limit?: number;
  cursor?: string;
  sortOrder?: MessageSortOrder;
};

export type ListMessagesResult = {
  data: Message[];
  pagination: {
    limit: number;
    nextCursor: string | null;
    hasMore: boolean;
    sortOrder: MessageSortOrder;
  };
};

@Injectable()
export class ListMessagesService {
  constructor(
    @Inject(MESSAGE_REPOSITORY)
    private readonly messageRepository: MessageRepositoryPort,
  ) {}

  async execute(query: ListMessagesQuery): Promise<ListMessagesResult> {
    const limit = query.limit ?? 20;
    const sortOrder = query.sortOrder ?? 'desc';
    const after = query.cursor ? decodeMessageCursor(query.cursor, sortOrder) : undefined;
    const messages = await this.messageRepository.listByConversation({
      conversationId: query.conversationId,
      limit: limit + 1,
      sortOrder,
      ...(after === undefined ? {} : { after }),
    });
    const page = messages.slice(0, limit);
    const hasMore = messages.length > limit;

    return {
      data: page,
      pagination: {
        limit,
        nextCursor: getNextCursor(page, sortOrder, hasMore),
        hasMore,
        sortOrder,
      },
    };
  }
}

function getNextCursor(
  page: Message[],
  sortOrder: MessageSortOrder,
  hasMore: boolean,
): string | null {
  if (!hasMore) {
    return null;
  }

  const lastMessage = page.at(-1);
  return lastMessage ? encodeMessageCursor(lastMessage, sortOrder) : null;
}
