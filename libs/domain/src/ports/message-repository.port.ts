import type { ClientSession } from 'mongoose';

import type { CreateMessageInput, ListMessagesQuery, Message } from '../message';

export interface MessageRepositoryPort {
  create(input: CreateMessageInput, session: ClientSession): Promise<Message>;
  listByConversation(query: ListMessagesQuery): Promise<Message[]>;
}
