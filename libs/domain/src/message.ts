export type JsonObject = Record<string, unknown>;

export type Message = {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  timestamp: Date;
  metadata?: JsonObject;
};

export type CreateMessageInput = {
  conversationId: string;
  senderId: string;
  content: string;
  timestamp: Date;
  metadata?: JsonObject;
};

export type MessageSortOrder = 'asc' | 'desc';

export type MessagePageCursor = {
  id: string;
  timestamp: Date;
};

export type ListMessagesQuery = {
  conversationId: string;
  limit: number;
  sortOrder: MessageSortOrder;
  after?: MessagePageCursor;
};
