import { Inject, Injectable, Logger, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OUTBOX_REPOSITORY } from '@app/domain';
import type { OutboxEvent, OutboxRepositoryPort } from '@app/domain';
import { KafkaProducerService } from '@app/messaging';
import { MetricsService } from '@app/observability';
import { hostname } from 'node:os';
import { randomUUID } from 'node:crypto';

const BASE_RETRY_DELAY_MS = 1_000;
const MAX_RETRY_DELAY_MS = 5 * 60 * 1_000;
const MAX_LAST_ERROR_LENGTH = 2_000;

@Injectable()
export class PublisherService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(PublisherService.name);
  private readonly batchSize: number;
  private readonly instanceId: string;
  private readonly lockTimeoutMs: number;
  private readonly maxAttempts: number;
  private readonly pollIntervalMs: number;
  private running = false;
  private stopping = false;
  private timer?: NodeJS.Timeout;

  constructor(
    @Inject(OUTBOX_REPOSITORY) private readonly outboxRepository: OutboxRepositoryPort,
    private readonly producer: KafkaProducerService,
    private readonly metricsService: MetricsService,
    configService: ConfigService,
  ) {
    this.batchSize = configService.get<number>('outbox.batchSize') ?? 50;
    this.lockTimeoutMs = configService.get<number>('outbox.lockTimeoutMs') ?? 30_000;
    this.maxAttempts = configService.get<number>('outbox.maxAttempts') ?? 10;
    this.pollIntervalMs = configService.get<number>('outbox.pollIntervalMs') ?? 500;
    this.instanceId = `${hostname()}-${process.pid}-${randomUUID()}`;
  }

  onModuleInit(): void {
    this.scheduleNextRun(0);
  }

  async onApplicationShutdown(): Promise<void> {
    this.stopping = true;
    if (this.timer) {
      clearTimeout(this.timer);
    }

    while (this.running) {
      await delay(25);
    }
  }

  async runOnce(): Promise<number> {
    const now = new Date();
    const events = await this.outboxRepository.claimPublishable({
      batchSize: this.batchSize,
      lockedBy: this.instanceId,
      lockTimeoutMs: this.lockTimeoutMs,
      now,
    });

    for (const event of events) {
      await this.publishEvent(event);
    }

    await this.updatePendingMetrics(new Date());

    return events.length;
  }

  private scheduleNextRun(delayMs = this.pollIntervalMs): void {
    if (this.stopping) {
      return;
    }

    this.timer = setTimeout(() => {
      void this.runLoop();
    }, delayMs);
    this.timer.unref?.();
  }

  private async runLoop(): Promise<void> {
    if (this.running) {
      this.scheduleNextRun();
      return;
    }

    this.running = true;
    try {
      await this.runOnce();
    } catch (error) {
      this.logger.error(
        {
          error: error instanceof Error ? error.message : String(error),
          instanceId: this.instanceId,
        },
        'Outbox publisher loop failed',
      );
    } finally {
      this.running = false;
      this.scheduleNextRun();
    }
  }

  private async publishEvent(event: OutboxEvent): Promise<void> {
    const startedAt = process.hrtime.bigint();

    try {
      await this.producer.publishJson({
        key: event.key,
        payload: event.payload,
        topic: event.topic,
      });

      this.metricsService.recordOutboxPublishDuration(
        event.topic,
        event.eventType,
        elapsedSeconds(startedAt),
      );

      const marked = await this.outboxRepository.markPublished({
        id: event.id,
        lockedBy: this.instanceId,
        publishedAt: new Date(),
      });

      if (!marked) {
        this.logLostLock(event, 'published');
        return;
      }

      this.metricsService.recordOutboxPublished(event.topic, event.eventType);
    } catch (error) {
      await this.handlePublishFailure(event, error);
    }
  }

  private async handlePublishFailure(event: OutboxEvent, error: unknown): Promise<void> {
    const attempts = event.attempts + 1;
    const now = new Date();
    const lastError = normalizeError(error);

    if (attempts >= this.maxAttempts) {
      const marked = await this.outboxRepository.markFailed({
        attempts,
        failedAt: now,
        id: event.id,
        lastError,
        lockedBy: this.instanceId,
      });

      if (!marked) {
        this.logLostLock(event, 'failed');
        return;
      }

      this.metricsService.recordOutboxFailed(event.topic, event.eventType);
      return;
    }

    const nextAttemptAt = new Date(now.getTime() + calculateRetryDelayMs(attempts));
    const scheduled = await this.outboxRepository.scheduleRetry({
      attempts,
      id: event.id,
      lastError,
      lockedBy: this.instanceId,
      nextAttemptAt,
    });

    if (!scheduled) {
      this.logLostLock(event, 'retry');
    }
  }

  private async updatePendingMetrics(now: Date): Promise<void> {
    const stats = await this.outboxRepository.getPendingStats(now);
    const oldestPendingAgeSeconds =
      stats.oldestPendingCreatedAt === undefined
        ? 0
        : Math.max(0, (now.getTime() - stats.oldestPendingCreatedAt.getTime()) / 1_000);

    this.metricsService.setOutboxPendingStats(stats.pendingCount, oldestPendingAgeSeconds);
  }

  private logLostLock(event: OutboxEvent, transition: string): void {
    this.logger.warn(
      {
        eventId: event.eventId,
        instanceId: this.instanceId,
        outboxEventId: event.id,
        transition,
      },
      'Outbox event transition skipped because the publishing lock was not owned',
    );
  }
}

export function calculateRetryDelayMs(attempts: number, random = Math.random): number {
  const exponentialDelay = Math.min(
    BASE_RETRY_DELAY_MS * 2 ** Math.max(0, attempts - 1),
    MAX_RETRY_DELAY_MS,
  );
  const jitterFactor = 0.8 + random() * 0.4;

  return Math.round(exponentialDelay * jitterFactor);
}

function elapsedSeconds(startedAt: bigint): number {
  return Number(process.hrtime.bigint() - startedAt) / 1_000_000_000;
}

function normalizeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, MAX_LAST_ERROR_LENGTH);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
