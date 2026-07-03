import { Injectable } from '@nestjs/common';
import {
  collectDefaultMetrics,
  Counter,
  Gauge,
  Histogram,
  Registry,
  type LabelValues,
} from 'prom-client';

@Injectable()
export class MetricsService {
  private readonly registry = new Registry();

  readonly httpRequestsTotal: Counter<string>;
  readonly httpRequestDurationSeconds: Histogram<string>;
  readonly outboxEventsPublishedTotal: Counter<string>;
  readonly outboxEventsFailedTotal: Counter<string>;
  readonly outboxPendingCount: Gauge<string>;
  readonly outboxOldestPendingAgeSeconds: Gauge<string>;
  readonly outboxPublishDurationSeconds: Histogram<string>;

  constructor() {
    collectDefaultMetrics({
      prefix: 'message_management_',
      register: this.registry,
    });

    this.httpRequestsTotal = new Counter({
      help: 'Total HTTP requests observed by the API runtime.',
      labelNames: ['method', 'route', 'status_code'],
      name: 'message_management_http_requests_total',
      registers: [this.registry],
    });

    this.httpRequestDurationSeconds = new Histogram({
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
      help: 'HTTP request duration observed by the API runtime.',
      labelNames: ['method', 'route', 'status_code'],
      name: 'message_management_http_request_duration_seconds',
      registers: [this.registry],
    });

    this.outboxEventsPublishedTotal = new Counter({
      help: 'Total outbox events successfully published and marked published.',
      labelNames: ['topic', 'event_type'],
      name: 'message_management_outbox_events_published_total',
      registers: [this.registry],
    });

    this.outboxEventsFailedTotal = new Counter({
      help: 'Total outbox events marked failed after exhausting publisher attempts.',
      labelNames: ['topic', 'event_type'],
      name: 'message_management_outbox_events_failed_total',
      registers: [this.registry],
    });

    this.outboxPendingCount = new Gauge({
      help: 'Number of outbox events currently pending retry or initial publish.',
      name: 'message_management_outbox_pending_count',
      registers: [this.registry],
    });

    this.outboxOldestPendingAgeSeconds = new Gauge({
      help: 'Age in seconds of the oldest pending outbox event, or 0 when none are pending.',
      name: 'message_management_outbox_oldest_pending_age_seconds',
      registers: [this.registry],
    });

    this.outboxPublishDurationSeconds = new Histogram({
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
      help: 'Kafka publish duration observed by the outbox publisher.',
      labelNames: ['topic', 'event_type'],
      name: 'message_management_outbox_publish_duration_seconds',
      registers: [this.registry],
    });
  }

  contentType(): string {
    return this.registry.contentType;
  }

  metrics(): Promise<string> {
    return this.registry.metrics();
  }

  recordHttpRequest(labels: LabelValues<string>, durationSeconds: number): void {
    this.httpRequestsTotal.inc(labels);
    this.httpRequestDurationSeconds.observe(labels, durationSeconds);
  }

  recordOutboxPublished(topic: string, eventType: string): void {
    this.outboxEventsPublishedTotal.inc({ event_type: eventType, topic });
  }

  recordOutboxFailed(topic: string, eventType: string): void {
    this.outboxEventsFailedTotal.inc({ event_type: eventType, topic });
  }

  recordOutboxPublishDuration(topic: string, eventType: string, durationSeconds: number): void {
    this.outboxPublishDurationSeconds.observe(
      { event_type: eventType, topic },
      durationSeconds,
    );
  }

  setOutboxPendingStats(pendingCount: number, oldestPendingAgeSeconds: number): void {
    this.outboxPendingCount.set(pendingCount);
    this.outboxOldestPendingAgeSeconds.set(oldestPendingAgeSeconds);
  }
}
