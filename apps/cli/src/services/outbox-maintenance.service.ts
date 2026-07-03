import { Injectable, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createConnection, Model, Types } from 'mongoose';
import type { Connection, QueryFilter } from 'mongoose';

import {
  OUTBOX_EVENT_MODEL_NAME,
  OutboxEventEntity,
  OutboxEventSchema,
} from '@app/persistence';
import type { OutboxEventStatus } from '@app/domain';

type OutboxCounts = Record<OutboxEventStatus, number>;

export type OutboxFailedEventSummary = {
  id: string;
  eventId: string;
  key: string;
  attempts: number;
  nextAttemptAt: Date;
  createdAt: Date;
  lastError?: string;
};

export type OutboxInspection = {
  counts: OutboxCounts;
  oldestPendingAgeSeconds?: number;
  failedEvents: OutboxFailedEventSummary[];
};

export type RedriveFailedOutboxInput = {
  dryRun: boolean;
  eventIds: string[];
  ids: string[];
  limit?: number;
  now: Date;
};

export type RedriveFailedOutboxResult = {
  matchedCount: number;
  modifiedCount: number;
  events: OutboxFailedEventSummary[];
};

@Injectable()
export class OutboxMaintenanceService implements OnApplicationShutdown {
  private connection?: Connection;
  private outboxModel?: Model<OutboxEventEntity>;

  constructor(private readonly configService: ConfigService) {}

  async onApplicationShutdown(): Promise<void> {
    if (this.connection) {
      await this.connection.close();
    }
  }

  async inspect(input: { failedLimit: number; now: Date }): Promise<OutboxInspection> {
    const model = await this.getOutboxModel();
    const [counts, oldestPending, failedEvents] = await Promise.all([
      this.countByStatus(model),
      model
        .findOne({ status: 'pending' })
        .sort({ createdAt: 1 })
        .select({ createdAt: 1 })
        .lean<{ createdAt: Date }>()
        .exec(),
      this.findFailedEvents(model, {}, input.failedLimit),
    ]);

    return {
      counts,
      ...(oldestPending?.createdAt === undefined
        ? {}
        : {
            oldestPendingAgeSeconds: Math.max(
              0,
              Math.floor((input.now.getTime() - oldestPending.createdAt.getTime()) / 1_000),
            ),
          }),
      failedEvents,
    };
  }

  async redriveFailed(input: RedriveFailedOutboxInput): Promise<RedriveFailedOutboxResult> {
    const model = await this.getOutboxModel();
    const filter = buildFailedSelectionFilter(input);
    const events = await this.findFailedEvents(model, filter, input.limit);

    if (events.length === 0 || input.dryRun) {
      return {
        events,
        matchedCount: events.length,
        modifiedCount: 0,
      };
    }

    const result = await model.updateMany(
      {
        _id: { $in: events.map((event) => new Types.ObjectId(event.id)) },
        status: 'failed',
      },
      {
        $set: {
          attempts: 0,
          nextAttemptAt: input.now,
          status: 'pending',
        },
        $unset: {
          lastError: '',
          lockedAt: '',
          lockedBy: '',
          publishedAt: '',
        },
      },
    );

    return {
      events,
      matchedCount: events.length,
      modifiedCount: result.modifiedCount,
    };
  }

  private async getOutboxModel(): Promise<Model<OutboxEventEntity>> {
    if (this.outboxModel) {
      return this.outboxModel;
    }

    const connection = await createConnection(
      this.configService.getOrThrow<string>('mongodb.uri'),
      {
        autoIndex: false,
      },
    ).asPromise();

    this.connection = connection;
    this.outboxModel = connection.model<OutboxEventEntity>(
      OUTBOX_EVENT_MODEL_NAME,
      OutboxEventSchema,
      'outbox_events',
    );

    return this.outboxModel;
  }

  private async countByStatus(model: Model<OutboxEventEntity>): Promise<OutboxCounts> {
    const [pending, publishing, published, failed] = await Promise.all([
      model.countDocuments({ status: 'pending' }).exec(),
      model.countDocuments({ status: 'publishing' }).exec(),
      model.countDocuments({ status: 'published' }).exec(),
      model.countDocuments({ status: 'failed' }).exec(),
    ]);

    return {
      failed,
      pending,
      published,
      publishing,
    };
  }

  private async findFailedEvents(
    model: Model<OutboxEventEntity>,
    filter: QueryFilter<OutboxEventEntity>,
    limit: number | undefined,
  ): Promise<OutboxFailedEventSummary[]> {
    const query = model
      .find({ ...filter, status: 'failed' })
      .sort({ nextAttemptAt: 1, _id: 1 })
      .select({
        _id: 1,
        attempts: 1,
        createdAt: 1,
        eventId: 1,
        key: 1,
        lastError: 1,
        nextAttemptAt: 1,
      });

    if (limit !== undefined) {
      query.limit(limit);
    }

    const documents = await query.lean<OutboxFailedEventDocument[]>().exec();

    return documents.map((document) => ({
      id: document._id.toString(),
      attempts: document.attempts,
      createdAt: document.createdAt,
      eventId: document.eventId,
      key: document.key,
      ...(document.lastError === undefined ? {} : { lastError: document.lastError }),
      nextAttemptAt: document.nextAttemptAt,
    }));
  }
}

type OutboxFailedEventDocument = {
  _id: Types.ObjectId;
  attempts: number;
  createdAt: Date;
  eventId: string;
  key: string;
  lastError?: string;
  nextAttemptAt: Date;
};

function buildFailedSelectionFilter(
  input: RedriveFailedOutboxInput,
): QueryFilter<OutboxEventEntity> {
  const selectors: Array<QueryFilter<OutboxEventEntity>> = [];

  if (input.ids.length > 0) {
    selectors.push({
      _id: {
        $in: input.ids.map((id) => {
          if (!Types.ObjectId.isValid(id)) {
            throw new Error(`Invalid outbox _id: ${id}`);
          }

          return new Types.ObjectId(id);
        }),
      },
    });
  }

  if (input.eventIds.length > 0) {
    selectors.push({
      eventId: {
        $in: input.eventIds,
      },
    });
  }

  return selectors.length === 0 ? {} : { $or: selectors };
}
