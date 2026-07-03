import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { ClientSession, QueryFilter } from 'mongoose';

import type {
  CreateMessageInput,
  ListMessagesQuery,
  Message,
  MessageRepositoryPort,
} from '@app/domain';

import { MESSAGE_MODEL_NAME, MessageEntity } from '../schemas/message.schema';

@Injectable()
export class MongoMessageRepository implements MessageRepositoryPort {
  constructor(
    @InjectModel(MESSAGE_MODEL_NAME)
    private readonly messageModel: Model<MessageEntity>,
  ) {}

  async create(input: CreateMessageInput, session: ClientSession): Promise<Message> {
    const [created] = await this.messageModel.create([input], { session });

    if (!created) {
      throw new Error('Message insert did not return a document');
    }

    return mapMessageDocument(created);
  }

  async listByConversation(query: ListMessagesQuery): Promise<Message[]> {
    const filter: QueryFilter<MessageEntity> = {
      conversationId: query.conversationId,
    };

    if (query.after) {
      const cursorId = new Types.ObjectId(query.after.id);
      const comparison = query.sortOrder === 'desc' ? '$lt' : '$gt';
      filter.$or = [
        { timestamp: { [comparison]: query.after.timestamp } },
        {
          timestamp: query.after.timestamp,
          _id: { [comparison]: cursorId },
        },
      ];
    }

    const sortDirection = query.sortOrder === 'desc' ? -1 : 1;
    const documents = await this.messageModel
      .find(filter)
      .sort({ timestamp: sortDirection, _id: sortDirection })
      .limit(query.limit)
      .lean()
      .exec();

    return documents.map((document) => ({
      id: document._id.toString(),
      conversationId: document.conversationId,
      senderId: document.senderId,
      content: document.content,
      timestamp: document.timestamp,
      ...(document.metadata === undefined ? {} : { metadata: document.metadata }),
    }));
  }
}

function mapMessageDocument(document: MessageEntity): Message {
  return {
    id: document._id.toString(),
    conversationId: document.conversationId,
    senderId: document.senderId,
    content: document.content,
    timestamp: document.timestamp,
    ...(document.metadata === undefined ? {} : { metadata: document.metadata }),
  };
}
