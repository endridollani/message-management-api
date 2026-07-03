import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiSecurity,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ListMessagesService, SearchMessagesService } from '@app/application';

import { ConversationIdParamDto } from './dto/conversation-id-param.dto';
import { ListMessagesQueryDto } from './dto/list-messages-query.dto';
import { ListMessagesResponseDto, SearchMessagesResponseDto } from './dto/message-response.dto';
import { SearchMessagesQueryDto } from './dto/search-messages-query.dto';
import {
  ListMessagesResponse,
  mapListMessagesResponse,
  mapSearchMessagesResponse,
  SearchMessagesResponse,
} from './message-response.mapper';
import { ErrorResponseDto } from '../openapi/error-response.dto';
import { API_KEY_SECURITY_NAME } from '../swagger';

@ApiTags('Messages')
@ApiSecurity(API_KEY_SECURITY_NAME)
@Controller('conversations/:conversationId/messages')
export class ConversationMessagesController {
  constructor(
    private readonly listMessagesService: ListMessagesService,
    private readonly searchMessagesService: SearchMessagesService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'List conversation messages',
    description: 'Returns cursor-paginated messages from MongoDB for one conversation.',
  })
  @ApiParam({
    name: 'conversationId',
    example: 'conversation-1',
    description: 'Opaque conversation identifier.',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    schema: { default: 20, maximum: 100, minimum: 1, type: 'integer' },
  })
  @ApiQuery({
    name: 'cursor',
    required: false,
    schema: { type: 'string' },
    description: 'Opaque cursor returned as pagination.nextCursor by a previous list response.',
  })
  @ApiQuery({
    name: 'sortOrder',
    required: false,
    schema: { default: 'desc', enum: ['asc', 'desc'], type: 'string' },
  })
  @ApiOkResponse({
    description: 'Conversation messages page.',
    type: ListMessagesResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Invalid conversation id, query parameter, or cursor.',
    type: ErrorResponseDto,
  })
  @ApiUnauthorizedResponse({
    description: 'Missing or invalid x-api-key.',
    type: ErrorResponseDto,
  })
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
  @ApiOperation({
    summary: 'Search conversation messages',
    description:
      'Searches indexed message content in Elasticsearch for one conversation. Results are eventually consistent with message creation.',
  })
  @ApiParam({
    name: 'conversationId',
    example: 'conversation-1',
    description: 'Opaque conversation identifier.',
  })
  @ApiQuery({
    name: 'q',
    required: true,
    schema: { maxLength: 256, type: 'string' },
    example: 'hello',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    schema: { default: 1, maximum: 100, minimum: 1, type: 'integer' },
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    schema: { default: 20, maximum: 50, minimum: 1, type: 'integer' },
  })
  @ApiOkResponse({
    description: 'Search results page.',
    type: SearchMessagesResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Invalid conversation id or search query parameter.',
    type: ErrorResponseDto,
  })
  @ApiUnauthorizedResponse({
    description: 'Missing or invalid x-api-key.',
    type: ErrorResponseDto,
  })
  @ApiServiceUnavailableResponse({
    description: 'Elasticsearch search is unavailable.',
    type: ErrorResponseDto,
  })
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
