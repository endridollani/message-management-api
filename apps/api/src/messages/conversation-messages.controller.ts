import { Controller, Get, Param, Query } from '@nestjs/common';
import { ListMessagesService } from '@app/application';

import { ConversationIdParamDto } from './dto/conversation-id-param.dto';
import { ListMessagesQueryDto } from './dto/list-messages-query.dto';
import { ListMessagesResponse, mapListMessagesResponse } from './message-response.mapper';

@Controller('conversations/:conversationId/messages')
export class ConversationMessagesController {
  constructor(private readonly listMessagesService: ListMessagesService) {}

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
}
