import type { JsonObject, Message } from '../message';

export const MESSAGE_CREATED_EVENT_TYPE = 'message.created';
export const MESSAGE_CREATED_EVENT_VERSION = 1;
export const MESSAGE_CREATED_TOPIC = 'messages.message-created.v1';

export type MessageCreatedEvent = {
  eventId: string;
  eventType: typeof MESSAGE_CREATED_EVENT_TYPE;
  eventVersion: typeof MESSAGE_CREATED_EVENT_VERSION;
  occurredAt: string;
  correlationId: string;
  payload: {
    id: string;
    conversationId: string;
    senderId: string;
    content: string;
    timestamp: string;
    metadata?: JsonObject;
  };
};

export function toMessageCreatedEventPayload(message: Message): MessageCreatedEvent['payload'] {
  return {
    id: message.id,
    conversationId: message.conversationId,
    senderId: message.senderId,
    content: message.content,
    timestamp: message.timestamp.toISOString(),
    ...(message.metadata === undefined ? {} : { metadata: message.metadata }),
  };
}
