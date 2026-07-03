import type { JsonObject, Message } from '../message';

export type SearchMessageDocument = {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  timestamp: Date;
  metadata?: JsonObject;
};

export type SearchMessagesQuery = {
  conversationId: string;
  q: string;
  page: number;
  limit: number;
};

export type SearchMessageHit = Message & {
  score: number;
};

export type SearchMessagesResult = {
  data: SearchMessageHit[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

export interface MessageSearchPort {
  indexMessage(document: SearchMessageDocument): Promise<void>;
  searchMessages(query: SearchMessagesQuery): Promise<SearchMessagesResult>;
}
