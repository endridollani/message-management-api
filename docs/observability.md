# Observability

Update this file in the same change that changes logs, metrics, health checks,
readiness semantics, graceful shutdown behavior, or correlation ID propagation.

## Operational Routes

All operational routes are outside the API global prefix.

| Runtime | Port | Liveness | Readiness | Metrics |
| --- | ---: | --- | --- | --- |
| `api` | `PORT`, default `3000` | `/health/liveness` | `/health/readiness` checks runtime, MongoDB, and Elasticsearch `messages-read` alias | `/metrics` |
| `outbox-publisher` | `OUTBOX_HEALTH_PORT`, default `3001` | `/health/liveness` | `/health/readiness` checks runtime, MongoDB, and Kafka metadata for `messages.message-created.v1` | `/metrics` |
| `search-indexer` | `INDEXER_HEALTH_PORT`, default `3002` | `/health/liveness` | `/health/readiness` checks runtime, Kafka metadata for `messages.message-created.v1`, Elasticsearch `messages-write` alias, and the message-created consumer runner | `/metrics` |

API readiness includes Elasticsearch because the deployed API contract includes
search. During an Elasticsearch outage, create/list can still work against
MongoDB, but the API is not ready under the default policy. Elasticsearch index
bootstrap failure is non-fatal for the API runtime; operators should expect a
startup warning, readiness down for Elasticsearch, and `503` from the search
endpoint until Elasticsearch recovers.

Search-indexer readiness includes the KafkaJS consumer runner state. Restartable
KafkaJS consumer crashes keep normal KafkaJS restart behavior; a non-restartable
crash that stops the runner marks readiness down even if Kafka metadata and
Elasticsearch are otherwise reachable.

Health responses use Nest Terminus shape: top-level `status`, `info`, `error`,
and `details`. Runtime indicators include the runtime name; readiness indicators
include dependency names.

## Correlation IDs

- Incoming `x-correlation-id` is preserved when present.
- Missing IDs are generated with `crypto.randomUUID()`.
- The ID is stored in `AsyncLocalStorage` and echoed as the
  `x-correlation-id` response header.
- Global error responses include `correlationId`.
- `CreateMessageService` stores the active HTTP correlation ID in the
  `MessageCreatedEvent` envelope written to the outbox.
- The outbox publisher publishes the stored payload unchanged to Kafka.
- The search-indexer reads `correlationId` from valid envelopes and copies it to
  DLQ header `x-correlation-id`.

The main Kafka topic currently carries correlation in the JSON event envelope,
not as a separate Kafka header.

## Structured Logs

- Logging uses `nestjs-pino` and `pino-http`.
- `LOG_LEVEL` controls the pino level.
- Request logs include `correlationId`.
- `/health/liveness` and `/metrics` request logs are suppressed by pino
  autologging.
- Redacted request headers: `authorization`, `cookie`, and `x-api-key`.
- Unhandled API exceptions are logged server-side and returned to clients as a
  generic `500` with correlation ID.

## Metrics

All metrics use the `message_management_` prefix and Prometheus text format.
Default Node/process metrics are collected for each runtime.

HTTP metrics are registered by the shared metrics service:

| Metric | Type | Labels | Current behavior |
| --- | --- | --- | --- |
| `message_management_http_requests_total` | Counter | `method`, `route`, `status_code` | Registered; no middleware emits it yet. |
| `message_management_http_request_duration_seconds` | Histogram | `method`, `route`, `status_code` | Registered; no middleware emits it yet. |

Outbox publisher metrics:

| Metric | Type | Labels | Meaning |
| --- | --- | --- | --- |
| `message_management_outbox_events_published_total` | Counter | `topic`, `event_type` | Kafka ack succeeded and row was marked `published`. |
| `message_management_outbox_events_failed_total` | Counter | `topic`, `event_type` | Row exhausted attempts and became terminal `failed`. |
| `message_management_outbox_pending_count` | Gauge | none | Current pending outbox rows. |
| `message_management_outbox_oldest_pending_age_seconds` | Gauge | none | Age of oldest pending row, or `0` when none are pending. |
| `message_management_outbox_publish_duration_seconds` | Histogram | `topic`, `event_type` | Kafka send latency for successful publish attempts. |

Search-indexer metrics:

| Metric | Type | Labels | Meaning |
| --- | --- | --- | --- |
| `message_management_search_indexer_messages_indexed_total` | Counter | `topic` | Successfully indexed events. |
| `message_management_search_indexer_messages_dlq_total` | Counter | `topic`, `reason` | Messages published to DLQ. Reasons include `malformed` and `indexing_failed`. |
| `message_management_search_indexer_messages_skipped_total` | Counter | `topic`, `reason` | Unsupported event type/version skips. |
| `message_management_search_indexer_index_duration_seconds` | Histogram | `topic` | Elasticsearch indexing latency for successful messages. |

## Suggested Alerts

- API readiness failure for more than one deployment grace window.
- Outbox publisher readiness failure or rising
  `message_management_outbox_oldest_pending_age_seconds`.
- Any sustained increase in `message_management_outbox_events_failed_total`.
- Any increase in `message_management_search_indexer_messages_dlq_total`.
- Search-indexer readiness failure, stopped consumer runner, or Kafka consumer lag for
  `message-management-api.search-indexer`.

Consumer lag is not emitted as an app metric yet. Inspect locally with:

```sh
docker compose exec kafka /opt/bitnami/kafka/bin/kafka-consumer-groups.sh \
  --bootstrap-server localhost:9092 \
  --describe \
  --group message-management-api.search-indexer
```

## Known Local KafkaJS Warning

The single-node local Kafka setup may emit a Node/KafkaJS
`TimeoutNegativeWarning`, especially during DLQ dry-runs or integration tests
while consumer groups form. Current smoke tests and the integration suite pass
despite this warning.

Treat it as non-blocking when readiness is green and commands complete. Escalate
only if Kafka operations fail, offsets stop advancing, or the warning appears in
a production-like broker deployment.
