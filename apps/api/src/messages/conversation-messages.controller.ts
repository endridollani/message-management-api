import { Controller, Get, Param, Query } from '@nestjs/common';
import { ListMessagesService, SearchMessagesService } from '@app/application';

import { ConversationIdParamDto } from './dto/conversation-id-param.dto';
import { ListMessagesQueryDto } from './dto/list-messages-query.dto';
import { SearchMessagesQueryDto } from './dto/search-messages-query.dto';
import {
  ListMessagesResponse,
  mapListMessagesResponse,
  mapSearchMessagesResponse,
  SearchMessagesResponse,
} from './message-response.mapper';

@Controller('conversations/:conversationId/messages')
export class ConversationMessagesController {
  constructor(
    private readonly listMessagesService: ListMessagesService,
    private readonly searchMessagesService: SearchMessagesService,
  ) {}

  @Get()
  async list(
    @Param() params: ConversationIdParamDto,
    @Query() query: ListMessagesQueryDto,
  ): Promise<ListMessagesResponse> {
    const result = await this.listMessagesService.execute({
      conversationId: params.conversationId,
      ...(query.limit === undefined ? {} : { limit: query.limit }),
      ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
      ...(query.sortOrder === undefined ? {} : { sortOrder: query.sortOrder }),
    });

    return mapListMessagesResponse(result);
  }

  @Get('search')
  async search(
    @Param() params: ConversationIdParamDto,
    @Query() query: SearchMessagesQueryDto,
  ): Promise<SearchMessagesResponse> {
    const result = await this.searchMessagesService.execute({
      conversationId: params.conversationId,
      q: query.q,
      ...(query.page === undefined ? {} : { page: query.page }),
      ...(query.limit === undefined ? {} : { limit: query.limit }),
    });

    return mapSearchMessagesResponse(result);
  }
}
