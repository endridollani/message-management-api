import {
  MESSAGE_CREATED_EVENT_TYPE,
  MESSAGE_CREATED_EVENT_VERSION,
  MESSAGE_CREATED_TOPIC,
} from '@app/domain';
import type { MessageRepositoryPort, OutboxRepositoryPort, TransactionManagerPort } from '@app/domain';
import type { ClientSession } from 'mongoose';

import { CreateMessageService } from './create-message.service';

describe('CreateMessageService', () => {
  it('creates a message and outbox event in one transaction with the same session', async () => {
    const session = { id: 'session-1' };
    const message = {
      id: '64f2d8e7a088f5d3d879c001',
      conversationId: 'conversation-1',
      senderId: 'sender-1',
      content: 'hello',
      timestamp: new Date('2026-07-03T09:00:00.000Z'),
      metadata: { trace: true },
    };
    const messageCreate = jest.fn().mockResolvedValue(message);
    const outboxCreate = jest.fn().mockResolvedValue({});
    const transactionManager: TransactionManagerPort = {
      withTransaction: jest.fn(<T>(operation: (session: ClientSession) => Promise<T>) =>
        operation(session as unknown as ClientSession),
      ),
    };
    const messageRepository: MessageRepositoryPort = {
      create: messageCreate,
      listByConversation: jest.fn(),
    };
    const outboxRepository = {
      create: outboxCreate,
    } as unknown as OutboxRepositoryPort;
    const service = new CreateMessageService(
      transactionManager,
      messageRepository,
      outboxRepository,
    );

    await expect(
      service.execute({
        conversationId: message.conversationId,
        senderId: message.senderId,
        content: message.content,
        correlationId: 'correlation-1',
        metadata: message.metadata,
      }),
    ).resolves.toBe(message);

    expect(messageCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: message.conversationId,
        senderId: message.senderId,
        content: message.content,
        metadata: message.metadata,
      }),
      session,
    );
    expect(outboxCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: MESSAGE_CREATED_EVENT_TYPE,
        eventVersion: MESSAGE_CREATED_EVENT_VERSION,
        topic: MESSAGE_CREATED_TOPIC,
        key: message.conversationId,
        status: 'pending',
        attempts: 0,
        payload: expect.objectContaining({
          eventType: MESSAGE_CREATED_EVENT_TYPE,
          eventVersion: MESSAGE_CREATED_EVENT_VERSION,
          correlationId: 'correlation-1',
          payload: {
            id: message.id,
            conversationId: message.conversationId,
            senderId: message.senderId,
            content: message.content,
            timestamp: message.timestamp.toISOString(),
            metadata: message.metadata,
          },
        }),
      }),
      session,
    );
  });

  it('does not create an outbox event when message creation fails', async () => {
    const messageCreate = jest.fn().mockRejectedValue(new Error('insert failed'));
    const outboxCreate = jest.fn();
    const transactionManager: TransactionManagerPort = {
      withTransaction: jest.fn(<T>(operation: (session: ClientSession) => Promise<T>) =>
        operation({} as ClientSession),
      ),
    };
    const messageRepository: MessageRepositoryPort = {
      create: messageCreate,
      listByConversation: jest.fn(),
    };
    const outboxRepository = {
      create: outboxCreate,
    } as unknown as OutboxRepositoryPort;
    const service = new CreateMessageService(
      transactionManager,
      messageRepository,
      outboxRepository,
    );

    await expect(
      service.execute({
        conversationId: 'conversation-1',
        senderId: 'sender-1',
        content: 'hello',
        correlationId: 'correlation-1',
      }),
    ).rejects.toThrow('insert failed');

    expect(outboxCreate).not.toHaveBeenCalled();
  });
});
