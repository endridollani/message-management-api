import { BadRequestException } from '@nestjs/common';

import { decodeMessageCursor, encodeMessageCursor } from './message-cursor';

describe('message cursor utilities', () => {
  const message = {
    id: '64f2d8e7a088f5d3d879c001',
    conversationId: 'conversation-1',
    senderId: 'sender-1',
    content: 'hello',
    timestamp: new Date('2026-07-03T09:00:00.000Z'),
  };

  it('round-trips the cursor payload', () => {
    const cursor = encodeMessageCursor(message, 'desc');

    expect(decodeMessageCursor(cursor, 'desc')).toEqual({
      id: message.id,
      timestamp: message.timestamp,
    });
  });

  it('rejects tampered cursors', () => {
    expect(() => decodeMessageCursor('not-base64-json', 'desc')).toThrow(BadRequestException);
  });

  it('rejects cursors for a different sort order', () => {
    const cursor = encodeMessageCursor(message, 'asc');

    expect(() => decodeMessageCursor(cursor, 'desc')).toThrow(BadRequestException);
  });
});
