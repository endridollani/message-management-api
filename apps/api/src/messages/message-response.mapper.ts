import type { ListMessagesResult } from '@app/application';
import type { Message } from '@app/domain';

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
