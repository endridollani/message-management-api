# Observability

Owner note: Update this file in the same change that introduces or changes logs, metrics, health checks, readiness semantics, graceful shutdown behavior, or correlation ID propagation.

## Planned Coverage

- Structured log schema.
- Correlation ID flow from HTTP to outbox, Kafka headers, and indexer logs.
- Metrics catalog with names, types, labels, and alert suggestions.
- Runtime-specific liveness and readiness semantics.
- Consumer lag inspection strategy.

## Implemented Signals Through P4B

### HTTP Operational Routes

- `GET /health/liveness` - Terminus health check proving the API process is up.
- `GET /health/readiness` - Terminus readiness check. In P3 this reports runtime
  readiness with `dependencies: ["mongodb", "elasticsearch"]`, verifies the MongoDB
  connection, and verifies the Elasticsearch `messages-read` alias.
- `GET /metrics` - Prometheus text exposition from the API runtime.

These routes are intentionally outside the `/api` global prefix.

### Outbox Publisher Operational Routes

- `GET /health/liveness` - Terminus health check proving the outbox-publisher
  process is up.
- `GET /health/readiness` - Terminus readiness check for the outbox-publisher.
  It reports `dependencies: ["mongodb", "kafka"]`, verifies the MongoDB
  connection, and verifies Kafka topic metadata for `messages.message-created.v1`.
- `GET /metrics` - Prometheus text exposition from the outbox-publisher runtime.

The worker has no business HTTP API; these operational routes bind to
`OUTBOX_HEALTH_PORT`, default `3001`.

### Search Indexer Operational Routes

- `GET /health/liveness` - Terminus health check proving the search-indexer
  process is up.
- `GET /health/readiness` - Terminus readiness check for the search-indexer.
  It reports `dependencies: ["kafka", "elasticsearch"]`, verifies Kafka topic
  metadata for `messages.message-created.v1`, and verifies the Elasticsearch
  `messages-write` alias.
- `GET /metrics` - Prometheus text exposition from the search-indexer runtime.

The worker has no business HTTP API; these operational routes bind to
`INDEXER_HEALTH_PORT`, default `3002`.

### Correlation IDs

- Incoming `x-correlation-id` is preserved when present.
- Missing correlation IDs are generated with `crypto.randomUUID()`.
- The active ID is stored in `AsyncLocalStorage` and echoed in the `x-correlation-id` response header.
- Global error responses include `correlationId`.
- `CreateMessageService` stores the active HTTP correlation ID in the
  `MessageCreatedEvent` envelope written to the outbox.
- The P4A publisher sends the outbox `payload` unchanged to Kafka. Kafka headers
  on the main topic are still not enriched.
- The P4B search-indexer reads `correlationId` from valid event envelopes and
  copies it to `x-correlation-id` when publishing DLQ messages.

### Structured Logging

- `nestjs-pino` / `pino-http` is wired through the observability module.
- Log level comes from `LOG_LEVEL`.
- Request logs include `correlationId`.
- Sensitive headers are redacted: `authorization`, `cookie`, and `x-api-key`.

### Metrics

Default process metrics use the `message_management_` prefix. P2B also registers the HTTP metric skeleton below for later middleware/workflow integration:

| Metric                                             | Type      | Labels                           | Notes                                         |
| -------------------------------------------------- | --------- | -------------------------------- | --------------------------------------------- |
| `message_management_http_requests_total`           | Counter   | `method`, `route`, `status_code` | Registered but not yet emitted by middleware. |
| `message_management_http_request_duration_seconds` | Histogram | `method`, `route`, `status_code` | Registered but not yet emitted by middleware. |

Outbox publisher metrics:

| Metric                                                 | Type      | Labels                | Notes                                                              |
| ------------------------------------------------------ | --------- | --------------------- | ------------------------------------------------------------------ |
| `message_management_outbox_events_published_total`     | Counter   | `topic`, `event_type` | Incremented after Kafka ack and successful lock-owner-safe mark.   |
| `message_management_outbox_events_failed_total`        | Counter   | `topic`, `event_type` | Incremented when max attempts are exhausted and the row is failed. |
| `message_management_outbox_pending_count`              | Gauge     | none                  | Count of rows with `status: pending`.                              |
| `message_management_outbox_oldest_pending_age_seconds` | Gauge     | none                  | Age of oldest pending row, or `0` when no pending rows exist.      |
| `message_management_outbox_publish_duration_seconds`   | Histogram | `topic`, `event_type` | Kafka producer send latency for successful publish attempts.       |

Search indexer metrics:

| Metric                                                     | Type      | Labels            | Notes                                                   |
| ---------------------------------------------------------- | --------- | ----------------- | ------------------------------------------------------- |
| `message_management_search_indexer_messages_indexed_total` | Counter   | `topic`           | Incremented after successful Elasticsearch indexing.    |
| `message_management_search_indexer_messages_dlq_total`     | Counter   | `topic`, `reason` | Incremented after a message is published to the DLQ.    |
| `message_management_search_indexer_messages_skipped_total` | Counter   | `topic`, `reason` | Incremented for unsupported event type/version skips.   |
| `message_management_search_indexer_index_duration_seconds` | Histogram | `topic`           | Elasticsearch indexing latency for successful messages. |
