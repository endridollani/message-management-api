import { Body, Controller, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiOperation,
  ApiSecurity,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CorrelationIdContext } from '@app/observability';
import { CreateMessageService } from '@app/application';

import { CreateMessageDto } from './dto/create-message.dto';
import { MessageResponseDto } from './dto/message-response.dto';
import { mapMessageResponse, MessageResponse } from './message-response.mapper';
import { ErrorResponseDto } from '../openapi/error-response.dto';
import { API_KEY_SECURITY_NAME } from '../swagger';

@ApiTags('Messages')
@ApiSecurity(API_KEY_SECURITY_NAME)
@Controller('messages')
export class MessagesController {
  constructor(
    private readonly createMessageService: CreateMessageService,
    private readonly correlationIdContext: CorrelationIdContext,
  ) {}

  @Post()
  @ApiOperation({
    summary: 'Create a message',
    description:
      'Persists a message and a pending message.created v1 outbox event in one MongoDB transaction.',
  })
  @ApiCreatedResponse({
    description: 'Message created.',
    type: MessageResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Validation failed for the request body.',
    type: ErrorResponseDto,
  })
  @ApiUnauthorizedResponse({
    description: 'Missing or invalid x-api-key.',
    type: ErrorResponseDto,
  })
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
