import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { OutboxEvent, OutboxRepositoryPort } from '@app/domain';
import type { KafkaProducerService } from '@app/messaging';
import type { MetricsService } from '@app/observability';

import { calculateRetryDelayMs, PublisherService } from './publisher.service';

describe('PublisherService', () => {
  const event = makeOutboxEvent();

  let outboxRepository: jest.Mocked<OutboxRepositoryPort>;
  let producer: jest.Mocked<Pick<KafkaProducerService, 'publishJson'>>;
  let metricsService: jest.Mocked<
    Pick<
      MetricsService,
      | 'recordOutboxFailed'
      | 'recordOutboxPublished'
      | 'recordOutboxPublishDuration'
      | 'setOutboxPendingStats'
    >
  >;
  let service: PublisherService;

  beforeEach(() => {
    outboxRepository = {
      claimPublishable: jest.fn(),
      create: jest.fn(),
      getPendingStats: jest.fn().mockResolvedValue({ pendingCount: 0 }),
      markFailed: jest.fn(),
      markPublished: jest.fn(),
      scheduleRetry: jest.fn(),
    };
    producer = {
      publishJson: jest.fn(),
    };
    metricsService = {
      recordOutboxFailed: jest.fn(),
      recordOutboxPublished: jest.fn(),
      recordOutboxPublishDuration: jest.fn(),
      setOutboxPendingStats: jest.fn(),
    };
    service = new PublisherService(
      outboxRepository,
      producer as unknown as KafkaProducerService,
      metricsService as unknown as MetricsService,
      configService({
        'outbox.batchSize': 2,
        'outbox.lockTimeoutMs': 30_000,
        'outbox.maxAttempts': 3,
        'outbox.pollIntervalMs': 500,
      }),
    );
  });

  it('claims, publishes, and marks outbox events in order', async () => {
    outboxRepository.claimPublishable.mockResolvedValue([event]);
    outboxRepository.markPublished.mockResolvedValue(true);

    await expect(service.runOnce()).resolves.toBe(1);

    expect(outboxRepository.claimPublishable.mock.calls).toEqual([
      [
        expect.objectContaining({
          batchSize: 2,
          lockedBy: expect.any(String),
          lockTimeoutMs: 30_000,
          now: expect.any(Date),
        }),
      ],
    ]);
    expect(producer.publishJson.mock.calls).toEqual([
      [
        {
          key: event.key,
          payload: event.payload,
          topic: event.topic,
        },
      ],
    ]);
    expect(outboxRepository.markPublished.mock.calls).toEqual([
      [
        {
          id: event.id,
          lockedBy: expect.any(String),
          publishedAt: expect.any(Date),
        },
      ],
    ]);
    expect(metricsService.recordOutboxPublished.mock.calls).toEqual([[event.topic, event.eventType]]);
    expect(metricsService.recordOutboxPublishDuration.mock.calls).toEqual([
      [event.topic, event.eventType, expect.any(Number)],
    ]);
  });

  it('schedules retry with exponential backoff and jitter after a publish failure', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.5);
    outboxRepository.claimPublishable.mockResolvedValue([event]);
    producer.publishJson.mockRejectedValue(new Error('broker unavailable'));
    outboxRepository.scheduleRetry.mockResolvedValue(true);

    await expect(service.runOnce()).resolves.toBe(1);

    expect(outboxRepository.scheduleRetry.mock.calls).toEqual([[
      {
        attempts: 1,
        id: event.id,
        lastError: 'broker unavailable',
        lockedBy: expect.any(String),
        nextAttemptAt: expect.any(Date),
      },
    ]]);
    expect(outboxRepository.markFailed.mock.calls).toHaveLength(0);
    expect(metricsService.recordOutboxFailed.mock.calls).toHaveLength(0);
  });

  it('marks an event failed after max attempts and does not schedule another retry', async () => {
    const almostExhausted = { ...event, attempts: 2 };
    outboxRepository.claimPublishable.mockResolvedValue([almostExhausted]);
    producer.publishJson.mockRejectedValue(new Error('poison event'));
    outboxRepository.markFailed.mockResolvedValue(true);

    await expect(service.runOnce()).resolves.toBe(1);

    expect(outboxRepository.markFailed.mock.calls).toEqual([[
      {
        attempts: 3,
        failedAt: expect.any(Date),
        id: event.id,
        lastError: 'poison event',
        lockedBy: expect.any(String),
      },
    ]]);
    expect(outboxRepository.scheduleRetry.mock.calls).toHaveLength(0);
    expect(metricsService.recordOutboxFailed.mock.calls).toEqual([[event.topic, event.eventType]]);
  });

  it('logs and skips metrics when the lock-owner-safe mark update does not match', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    outboxRepository.claimPublishable.mockResolvedValue([event]);
    outboxRepository.markPublished.mockResolvedValue(false);

    await expect(service.runOnce()).resolves.toBe(1);

    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: event.eventId,
        outboxEventId: event.id,
        transition: 'published',
      }),
      'Outbox event transition skipped because the publishing lock was not owned',
    );
    expect(metricsService.recordOutboxPublished).not.toHaveBeenCalled();
  });

  it('calculates bounded exponential retry delays with jitter', () => {
    expect(calculateRetryDelayMs(1, () => 0.5)).toBe(1_000);
    expect(calculateRetryDelayMs(2, () => 0.5)).toBe(2_000);
    expect(calculateRetryDelayMs(20, () => 0.5)).toBe(300_000);
    expect(calculateRetryDelayMs(1, () => 0)).toBe(800);
    expect(calculateRetryDelayMs(1, () => 1)).toBe(1_200);
  });
});

function configService(values: Record<string, number>): ConfigService {
  return {
    get: jest.fn((key: string) => values[key]),
  } as unknown as ConfigService;
}

function makeOutboxEvent(): OutboxEvent {
  return {
    attempts: 0,
    createdAt: new Date('2026-07-03T09:00:00.000Z'),
    eventId: 'event-1',
    eventType: 'message.created',
    eventVersion: 1,
    id: '64f2d8e7a088f5d3d879c001',
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
