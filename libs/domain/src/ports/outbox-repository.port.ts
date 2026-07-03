import type { ClientSession } from 'mongoose';

import type { MessageCreatedEvent } from '../events/message-created.event';

export type OutboxEventStatus = 'pending' | 'publishing' | 'published' | 'failed';

export type OutboxEvent = {
  id: string;
  eventId: string;
  eventType: string;
  eventVersion: number;
  topic: string;
  key: string;
  payload: MessageCreatedEvent;
  status: OutboxEventStatus;
  attempts: number;
  nextAttemptAt: Date;
  lockedBy?: string;
  lockedAt?: Date;
  lastError?: string;
  createdAt: Date;
  publishedAt?: Date;
};

export type CreateOutboxEventInput = {
  eventId: string;
  eventType: string;
  eventVersion: number;
  topic: string;
  key: string;
  payload: MessageCreatedEvent;
  status: 'pending';
  attempts: 0;
  nextAttemptAt: Date;
  createdAt: Date;
};

export type ClaimPublishableOutboxEventsInput = {
  batchSize: number;
  lockedBy: string;
  lockTimeoutMs: number;
  now: Date;
};

export type MarkPublishedOutboxEventInput = {
  id: string;
  lockedBy: string;
  publishedAt: Date;
};

export type ScheduleOutboxRetryInput = {
  id: string;
  lockedBy: string;
  attempts: number;
  nextAttemptAt: Date;
  lastError: string;
};

export type MarkFailedOutboxEventInput = {
  id: string;
  lockedBy: string;
  attempts: number;
  failedAt: Date;
  lastError: string;
};

export type OutboxPendingStats = {
  pendingCount: number;
  oldestPendingCreatedAt?: Date;
};

export interface OutboxRepositoryPort {
  create(input: CreateOutboxEventInput, session: ClientSession): Promise<OutboxEvent>;
  claimPublishable(
    input: ClaimPublishableOutboxEventsInput,
  ): Promise<readonly OutboxEvent[]>;
  markPublished(input: MarkPublishedOutboxEventInput): Promise<boolean>;
  scheduleRetry(input: ScheduleOutboxRetryInput): Promise<boolean>;
  markFailed(input: MarkFailedOutboxEventInput): Promise<boolean>;
  getPendingStats(now: Date): Promise<OutboxPendingStats>;
}
