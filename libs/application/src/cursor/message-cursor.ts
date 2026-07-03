import { BadRequestException } from '@nestjs/common';

import type { Message, MessagePageCursor, MessageSortOrder } from '@app/domain';

type EncodedCursor = {
  o: MessageSortOrder;
  t: string;
  id: string;
};

export function encodeMessageCursor(message: Message, sortOrder: MessageSortOrder): string {
  return Buffer.from(
    JSON.stringify({
      o: sortOrder,
      t: message.timestamp.toISOString(),
      id: message.id,
    } satisfies EncodedCursor),
  ).toString('base64url');
}

export function decodeMessageCursor(
  cursor: string,
  expectedSortOrder: MessageSortOrder,
): MessagePageCursor {
  const decoded = parseCursor(cursor);

  if (decoded.o !== expectedSortOrder) {
    throw new BadRequestException('cursor sortOrder does not match request sortOrder');
  }

  const timestamp = new Date(decoded.t);

  if (Number.isNaN(timestamp.getTime())) {
    throw new BadRequestException('cursor is invalid');
  }

  if (!/^[a-fA-F0-9]{24}$/.test(decoded.id)) {
    throw new BadRequestException('cursor is invalid');
  }

  return {
    id: decoded.id,
    timestamp,
  };
}

function parseCursor(cursor: string): EncodedCursor {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));

    if (!isEncodedCursor(parsed)) {
      throw new Error('Unexpected cursor shape');
    }

    return parsed;
  } catch {
    throw new BadRequestException('cursor is invalid');
  }
}

function isEncodedCursor(value: unknown): value is EncodedCursor {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Partial<EncodedCursor>;

  return (
    (candidate.o === 'asc' || candidate.o === 'desc') &&
    typeof candidate.t === 'string' &&
    typeof candidate.id === 'string'
  );
}
