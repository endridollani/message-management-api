import type { Message, MessageRepositoryPort } from '@app/domain';

import { encodeMessageCursor } from '../cursor/message-cursor';
import { ListMessagesService } from './list-messages.service';

describe('ListMessagesService', () => {
  const messages: Message[] = [
    {
      id: '64f2d8e7a088f5d3d879c001',
      conversationId: 'conversation-1',
      senderId: 'sender-1',
      content: 'one',
      timestamp: new Date('2026-07-03T09:00:00.000Z'),
    },
    {
      id: '64f2d8e7a088f5d3d879c002',
      conversationId: 'conversation-1',
      senderId: 'sender-2',
      content: 'two',
      timestamp: new Date('2026-07-03T09:01:00.000Z'),
    },
  ];

  it('requests limit plus one and returns a next cursor when there is another page', async () => {
    const firstMessage = messages[0]!;
    const listByConversation = jest.fn().mockResolvedValue(messages);
    const repository: MessageRepositoryPort = {
      create: jest.fn(),
      listByConversation,
    };
    const service = new ListMessagesService(repository);

    const result = await service.execute({
      conversationId: 'conversation-1',
      limit: 1,
      sortOrder: 'desc',
    });

    expect(listByConversation).toHaveBeenCalledWith({
      conversationId: 'conversation-1',
      limit: 2,
      sortOrder: 'desc',
    });
    expect(result.data).toEqual([messages[0]]);
    expect(result.pagination).toEqual({
      limit: 1,
      hasMore: true,
      nextCursor: encodeMessageCursor(firstMessage, 'desc'),
      sortOrder: 'desc',
    });
  });

  it('decodes a cursor and passes the range anchor to the repository', async () => {
    const firstMessage = messages[0]!;
    const listByConversation = jest.fn().mockResolvedValue([]);
    const repository: MessageRepositoryPort = {
      create: jest.fn(),
      listByConversation,
    };
    const service = new ListMessagesService(repository);
    const cursor = encodeMessageCursor(firstMessage, 'asc');

    await service.execute({
      conversationId: 'conversation-1',
      cursor,
      sortOrder: 'asc',
    });

    expect(listByConversation).toHaveBeenCalledWith({
      conversationId: 'conversation-1',
      limit: 21,
      sortOrder: 'asc',
      after: {
        id: firstMessage.id,
        timestamp: firstMessage.timestamp,
      },
    });
  });
});
