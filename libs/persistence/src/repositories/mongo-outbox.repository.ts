import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { ClientSession } from 'mongoose';

import type {
  ClaimPublishableOutboxEventsInput,
  CreateOutboxEventInput,
  MarkFailedOutboxEventInput,
  MarkPublishedOutboxEventInput,
  OutboxEvent,
  OutboxPendingStats,
  OutboxRepositoryPort,
  ScheduleOutboxRetryInput,
} from '@app/domain';

import { OUTBOX_EVENT_MODEL_NAME, OutboxEventEntity } from '../schemas/outbox-event.schema';

@Injectable()
export class MongoOutboxRepository implements OutboxRepositoryPort {
  constructor(
    @InjectModel(OUTBOX_EVENT_MODEL_NAME)
    private readonly outboxEventModel: Model<OutboxEventEntity>,
  ) {}

  async create(input: CreateOutboxEventInput, session: ClientSession): Promise<OutboxEvent> {
    const [created] = await this.outboxEventModel.create([input], { session });

    if (!created) {
      throw new Error('Outbox insert did not return a document');
    }

    return mapOutboxEvent(created);
  }

  async claimPublishable(
    input: ClaimPublishableOutboxEventsInput,
  ): Promise<readonly OutboxEvent[]> {
    const claimed: OutboxEvent[] = [];
    const expiredBefore = new Date(input.now.getTime() - input.lockTimeoutMs);

    for (let index = 0; index < input.batchSize; index += 1) {
      const event = await this.outboxEventModel.findOneAndUpdate(
        {
          $or: [
            { nextAttemptAt: { $lte: input.now }, status: 'pending' },
            { lockedAt: { $lte: expiredBefore }, status: 'publishing' },
          ],
        },
        {
          $set: {
            lockedAt: input.now,
            lockedBy: input.lockedBy,
            status: 'publishing',
          },
        },
        {
          returnDocument: 'after',
          sort: { _id: 1 },
        },
      );

      if (!event) {
        break;
      }

      claimed.push(mapOutboxEvent(event));
    }

    return claimed;
  }

  async markPublished(input: MarkPublishedOutboxEventInput): Promise<boolean> {
    const result = await this.outboxEventModel.updateOne(
      lockOwnerFilter(input.id, input.lockedBy),
      {
        $set: {
          publishedAt: input.publishedAt,
          status: 'published',
        },
        $unset: {
          lastError: '',
          lockedAt: '',
          lockedBy: '',
        },
      },
    );

    return result.matchedCount === 1;
  }

  async scheduleRetry(input: ScheduleOutboxRetryInput): Promise<boolean> {
    const result = await this.outboxEventModel.updateOne(
      lockOwnerFilter(input.id, input.lockedBy),
      {
        $set: {
          attempts: input.attempts,
          lastError: input.lastError,
          nextAttemptAt: input.nextAttemptAt,
          status: 'pending',
        },
        $unset: {
          lockedAt: '',
          lockedBy: '',
        },
      },
    );

    return result.matchedCount === 1;
  }

  async markFailed(input: MarkFailedOutboxEventInput): Promise<boolean> {
    const result = await this.outboxEventModel.updateOne(
      lockOwnerFilter(input.id, input.lockedBy),
      {
        $set: {
          attempts: input.attempts,
          lastError: input.lastError,
          nextAttemptAt: input.failedAt,
          status: 'failed',
        },
        $unset: {
          lockedAt: '',
          lockedBy: '',
        },
      },
    );

    return result.matchedCount === 1;
  }

  async getPendingStats(): Promise<OutboxPendingStats> {
    const [pendingCount, oldestPending] = await Promise.all([
      this.outboxEventModel.countDocuments({ status: 'pending' }),
      this.outboxEventModel
        .findOne({ status: 'pending' })
        .sort({ createdAt: 1 })
        .select({ createdAt: 1 })
        .lean<{ createdAt: Date }>(),
    ]);

    return {
      pendingCount,
      ...(oldestPending?.createdAt === undefined
        ? {}
        : { oldestPendingCreatedAt: oldestPending.createdAt }),
    };
  }
}

function lockOwnerFilter(id: string, lockedBy: string): {
  _id: Types.ObjectId;
  lockedBy: string;
  status: 'publishing';
} {
  return {
    _id: new Types.ObjectId(id),
    lockedBy,
    status: 'publishing',
  };
}

function mapOutboxEvent(event: OutboxEventEntity): OutboxEvent {
  return {
    id: event._id.toString(),
    eventId: event.eventId,
    eventType: event.eventType,
    eventVersion: event.eventVersion,
    topic: event.topic,
    key: event.key,
    payload: event.payload,
    status: event.status,
    attempts: event.attempts,
    nextAttemptAt: event.nextAttemptAt,
    ...(event.lockedBy === undefined ? {} : { lockedBy: event.lockedBy }),
    ...(event.lockedAt === undefined ? {} : { lockedAt: event.lockedAt }),
    ...(event.lastError === undefined ? {} : { lastError: event.lastError }),
    createdAt: event.createdAt,
    ...(event.publishedAt === undefined ? {} : { publishedAt: event.publishedAt }),
  };
}
