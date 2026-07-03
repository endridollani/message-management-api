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

export interface OutboxRepositoryPort {
  create(input: CreateOutboxEventInput, session: ClientSession): Promise<OutboxEvent>;
}
