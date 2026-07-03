import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import {
  MESSAGE_CREATED_EVENT_TYPE,
  MESSAGE_CREATED_EVENT_VERSION,
  MESSAGE_CREATED_TOPIC,
  MESSAGE_REPOSITORY,
  OUTBOX_REPOSITORY,
  TRANSACTION_MANAGER,
  toMessageCreatedEventPayload,
} from '@app/domain';
import type {
  JsonObject,
  Message,
  MessageCreatedEvent,
  MessageRepositoryPort,
  OutboxRepositoryPort,
  TransactionManagerPort,
} from '@app/domain';

export type CreateMessageCommand = {
  conversationId: string;
  senderId: string;
  content: string;
  correlationId: string;
  metadata?: JsonObject;
};

@Injectable()
export class CreateMessageService {
  constructor(
    @Inject(TRANSACTION_MANAGER)
    private readonly transactionManager: TransactionManagerPort,
    @Inject(MESSAGE_REPOSITORY)
    private readonly messageRepository: MessageRepositoryPort,
    @Inject(OUTBOX_REPOSITORY)
    private readonly outboxRepository: OutboxRepositoryPort,
  ) {}

  async execute(command: CreateMessageCommand): Promise<Message> {
    const now = new Date();

    return this.transactionManager.withTransaction(async (session) => {
      const message = await this.messageRepository.create(
        {
          conversationId: command.conversationId,
          senderId: command.senderId,
          content: command.content,
          timestamp: now,
          ...(command.metadata === undefined ? {} : { metadata: command.metadata }),
        },
        session,
      );

      const event = buildMessageCreatedEvent(message, command.correlationId, now);

      await this.outboxRepository.create(
        {
          eventId: event.eventId,
          eventType: event.eventType,
          eventVersion: event.eventVersion,
          topic: MESSAGE_CREATED_TOPIC,
          key: message.conversationId,
          payload: event,
          status: 'pending',
          attempts: 0,
          nextAttemptAt: now,
          createdAt: now,
        },
        session,
      );

      return message;
    });
  }
}

function buildMessageCreatedEvent(
  message: Message,
  correlationId: string,
  occurredAt: Date,
): MessageCreatedEvent {
  return {
    eventId: randomUUID(),
    eventType: MESSAGE_CREATED_EVENT_TYPE,
    eventVersion: MESSAGE_CREATED_EVENT_VERSION,
    occurredAt: occurredAt.toISOString(),
    correlationId,
    payload: toMessageCreatedEventPayload(message),
  };
}
