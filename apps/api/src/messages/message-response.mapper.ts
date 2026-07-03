import type { ListMessagesResult } from '@app/application';
import type { Message } from '@app/domain';
import type { SearchMessagesResult } from '@app/domain';

export type MessageResponse = {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
};

export type ListMessagesResponse = {
  data: MessageResponse[];
  pagination: ListMessagesResult['pagination'];
};

export type SearchMessageResponse = MessageResponse & {
  score: number;
};

export type SearchMessagesResponse = {
  data: SearchMessageResponse[];
  pagination: SearchMessagesResult['pagination'];
};

export function mapMessageResponse(message: Message): MessageResponse {
  return {
    id: message.id,
    conversationId: message.conversationId,
    senderId: message.senderId,
    content: message.content,
    timestamp: message.timestamp.toISOString(),
    ...(message.metadata === undefined ? {} : { metadata: message.metadata }),
  };
}

export function mapListMessagesResponse(result: ListMessagesResult): ListMessagesResponse {
  return {
    data: result.data.map(mapMessageResponse),
    pagination: result.pagination,
  };
}

export function mapSearchMessagesResponse(result: SearchMessagesResult): SearchMessagesResponse {
  return {
    data: result.data.map((message) => ({
      ...mapMessageResponse(message),
      score: message.score,
    })),
    pagination: result.pagination,
  };
}
