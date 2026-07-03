import { Injectable } from '@nestjs/common';
import { collectDefaultMetrics, Counter, Histogram, Registry, type LabelValues } from 'prom-client';

@Injectable()
export class MetricsService {
  private readonly registry = new Registry();

  readonly httpRequestsTotal: Counter<string>;
  readonly httpRequestDurationSeconds: Histogram<string>;

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
}
