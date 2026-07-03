import { Types } from 'mongoose';

import { MongoOutboxRepository } from './mongo-outbox.repository';

describe('MongoOutboxRepository publisher operations', () => {
  it('claims due pending rows and expired publishing leases in id order', async () => {
    const now = new Date('2026-07-03T09:00:00.000Z');
    const document = makeDocument();
    const model = {
      findOneAndUpdate: jest.fn().mockResolvedValueOnce(document).mockResolvedValueOnce(null),
    };
    const repository = new MongoOutboxRepository(model as never);

    await expect(
      repository.claimPublishable({
        batchSize: 2,
        lockedBy: 'worker-1',
        lockTimeoutMs: 30_000,
        now,
      }),
    ).resolves.toHaveLength(1);

    expect(model.findOneAndUpdate).toHaveBeenCalledWith(
      {
        $or: [
          { nextAttemptAt: { $lte: now }, status: 'pending' },
          {
            lockedAt: { $lte: new Date('2026-07-03T08:59:30.000Z') },
            status: 'publishing',
          },
        ],
      },
      {
        $set: {
          lockedAt: now,
          lockedBy: 'worker-1',
          status: 'publishing',
        },
      },
      {
        returnDocument: 'after',
        sort: { _id: 1 },
      },
    );
  });

  it('uses the lock-owner-safe filter and reports no-match when marking published', async () => {
    const id = '64f2d8e7a088f5d3d879c001';
    const publishedAt = new Date('2026-07-03T09:01:00.000Z');
    const model = {
      updateOne: jest.fn().mockResolvedValue({ matchedCount: 0 }),
    };
    const repository = new MongoOutboxRepository(model as never);

    await expect(
      repository.markPublished({
        id,
        lockedBy: 'worker-1',
        publishedAt,
      }),
    ).resolves.toBe(false);

    expect(model.updateOne).toHaveBeenCalledWith(
      {
        _id: new Types.ObjectId(id),
        lockedBy: 'worker-1',
        status: 'publishing',
      },
      {
        $set: {
          publishedAt,
          status: 'published',
        },
        $unset: {
          lastError: '',
          lockedAt: '',
          lockedBy: '',
        },
      },
    );
  });
});

function makeDocument() {
  return {
    _id: new Types.ObjectId('64f2d8e7a088f5d3d879c001'),
    attempts: 0,
    createdAt: new Date('2026-07-03T09:00:00.000Z'),
    eventId: 'event-1',
    eventType: 'message.created',
    eventVersion: 1,
    key: 'conversation-1',
    nextAttemptAt: new Date('2026-07-03T09:00:00.000Z'),
    payload: {
      correlationId: 'correlation-1',
      eventId: 'event-1',
      eventType: 'message.created',
      eventVersion: 1,
      occurredAt: '2026-07-03T09:00:00.000Z',
      payload: {
        content: 'hello',
        conversationId: 'conversation-1',
        id: 'message-1',
        senderId: 'sender-1',
        timestamp: '2026-07-03T09:00:00.000Z',
      },
    },
    status: 'publishing',
    topic: 'messages.message-created.v1',
  };
}
