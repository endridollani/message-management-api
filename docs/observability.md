# Observability

Owner note: Update this file in the same change that introduces or changes logs, metrics, health checks, readiness semantics, graceful shutdown behavior, or correlation ID propagation.

## Planned Coverage

- Structured log schema.
- Correlation ID flow from HTTP to outbox, Kafka headers, and indexer logs.
- Metrics catalog with names, types, labels, and alert suggestions.
- Runtime-specific liveness and readiness semantics.
- Consumer lag inspection strategy.
