import { Inject, Injectable } from '@nestjs/common';

import { MESSAGE_SEARCH, SearchUnavailableError } from '@app/domain';
import type { MessageSearchPort, SearchMessagesResult } from '@app/domain';

export type SearchMessagesCommand = {
  conversationId: string;
  q: string;
  page?: number;
  limit?: number;
};

@Injectable()
export class SearchMessagesService {
  constructor(
    @Inject(MESSAGE_SEARCH)
    private readonly messageSearch: MessageSearchPort,
  ) {}

  async execute(command: SearchMessagesCommand): Promise<SearchMessagesResult> {
    try {
      return await this.messageSearch.searchMessages({
        conversationId: command.conversationId,
        q: command.q,
        page: command.page ?? 1,
        limit: command.limit ?? 20,
      });
    } catch (error) {
      if (error instanceof SearchUnavailableError) {
        throw error;
      }

      throw new SearchUnavailableError();
    }
  }
}
