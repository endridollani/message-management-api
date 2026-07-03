# Observability

Owner note: Update this file in the same change that introduces or changes logs, metrics, health checks, readiness semantics, graceful shutdown behavior, or correlation ID propagation.

## Planned Coverage

- Structured log schema.
- Correlation ID flow from HTTP to outbox, Kafka headers, and indexer logs.
- Metrics catalog with names, types, labels, and alert suggestions.
- Runtime-specific liveness and readiness semantics.
- Consumer lag inspection strategy.

## P2B Implemented Signals

### HTTP Operational Routes

- `GET /health/liveness` - Terminus health check proving the API process is up.
- `GET /health/readiness` - Terminus readiness check. In P2B this is a runtime-only placeholder with `dependencies: []`; MongoDB and Elasticsearch indicators will be added when those clients are introduced.
- `GET /metrics` - Prometheus text exposition from the API runtime.

These routes are intentionally outside the `/api` global prefix.

### Correlation IDs

- Incoming `x-correlation-id` is preserved when present.
- Missing correlation IDs are generated with `crypto.randomUUID()`.
- The active ID is stored in `AsyncLocalStorage` and echoed in the `x-correlation-id` response header.
- Global error responses include `correlationId`.

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
