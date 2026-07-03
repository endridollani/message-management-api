import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { ClientSession } from 'mongoose';

import type { CreateOutboxEventInput, OutboxEvent, OutboxRepositoryPort } from '@app/domain';

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

    return {
      id: created._id.toString(),
      eventId: created.eventId,
      eventType: created.eventType,
      eventVersion: created.eventVersion,
      topic: created.topic,
      key: created.key,
      payload: created.payload,
      status: created.status,
      attempts: created.attempts,
      nextAttemptAt: created.nextAttemptAt,
      ...(created.lockedBy === undefined ? {} : { lockedBy: created.lockedBy }),
      ...(created.lockedAt === undefined ? {} : { lockedAt: created.lockedAt }),
      ...(created.lastError === undefined ? {} : { lastError: created.lastError }),
      createdAt: created.createdAt,
      ...(created.publishedAt === undefined ? {} : { publishedAt: created.publishedAt }),
    };
  }
}
