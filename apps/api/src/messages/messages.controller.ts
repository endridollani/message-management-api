import { Body, Controller, Post } from '@nestjs/common';
import { CorrelationIdContext } from '@app/observability';
import { CreateMessageService } from '@app/application';

import { CreateMessageDto } from './dto/create-message.dto';
import { mapMessageResponse, MessageResponse } from './message-response.mapper';

@Controller('messages')
export class MessagesController {
  constructor(
    private readonly createMessageService: CreateMessageService,
    private readonly correlationIdContext: CorrelationIdContext,
  ) {}

  @Post()
  async create(@Body() body: CreateMessageDto): Promise<MessageResponse> {
    const message = await this.createMessageService.execute({
      conversationId: body.conversationId,
      senderId: body.senderId,
      content: body.content,
      correlationId: this.correlationIdContext.getCorrelationId() ?? 'unknown',
      ...(body.metadata === undefined ? {} : { metadata: body.metadata }),
    });

    return mapMessageResponse(message);
  }
}
