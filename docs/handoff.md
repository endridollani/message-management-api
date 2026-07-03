# Handoff

## Current Status

P4A is complete: the messaging library and outbox-publisher worker are implemented
and validated. pnpm build/test/lint are green with pnpm 11.1.1. The API still
supports authenticated message creation with transactional Message + OutboxEvent
writes and authenticated cursor-paginated conversation message listing; P4A did
not add Elasticsearch, search-indexer, search endpoint behavior, or CLI commands.

## Complete

- P2A infrastructure remains present:
  - `docker-compose.yml` defines MongoDB replica set initialization, Kafka in KRaft mode, and Elasticsearch.
  - `.env.example` is aligned with Section 14.
  - P3 did not modify `docker-compose.yml`.
- P2B foundation remains present:
  - `libs/config` provides per-runtime Joi validation.
  - `libs/observability` provides pino logging setup, correlation ID middleware/context,
    Prometheus metrics, and Terminus health helpers.
  - `apps/api` boots with the global `/api` prefix, global validation, 100 KB JSON body
    limit, global exception filter, health/readiness/metrics, graceful shutdown hooks,
    and pino logger binding.
- P3 is complete:
  - `libs/domain` defines the `Message` model, `MessageCreatedEvent` v1 envelope,
    repository/transaction ports, and DI tokens.
  - `libs/persistence` provides Mongoose connection/module wiring, `messages` and
    `outbox_events` schemas with Section 9 indexes, Mongo repositories, a single-session
    transaction manager, and Mongo readiness indicator.
  - `libs/application` provides `CreateMessageService`, `ListMessagesService`, and
    cursor encode/decode utilities.
  - `apps/api` provides API-key auth, create/list/search-shape DTOs, standard response
    mappers, `POST /api/messages`, and `GET /api/conversations/:conversationId/messages`.
  - Contract tests use `MongoMemoryReplSet`; unit tests cover the transaction helper,
    create service, cursor utilities, and list service.
- P4A is complete:
  - `libs/messaging` wraps KafkaJS with topic constants, Kafka client lifecycle,
    topic initialization for `messages.message-created.v1` and
    `messages.message-created.v1.dlq`, Kafka readiness, and a JSON producer that
    sends with `acks: -1`.
  - KafkaJS producer idempotence is intentionally not enabled; correctness remains
    the outbox at-least-once contract plus downstream idempotency.
  - `apps/outbox-publisher` exposes health/readiness/metrics on
    `OUTBOX_HEALTH_PORT` and runs a publisher loop that claims due pending events,
    reclaims expired publishing leases, publishes with outbox `topic`/`key`/`payload`,
    marks published with the lock-owner-safe filter, schedules exponential
    backoff + jitter retries, and marks rows terminal `failed` after max attempts.
  - Outbox publisher metrics now cover published/failed counters, pending count,
    oldest pending age, and publish latency.
  - Unit tests cover claim/publish/mark flow, retry/backoff, max attempts to
    failed, expired lease reclaim query, lock-owner-safe no-match behavior, topic
    initialization, and producer `acks: -1`.

## Remaining

- Remaining P4 work is explicitly out of scope for P4A: Elasticsearch search lib,
  search-indexer worker, search endpoint behavior, DLQ consumer/redrive behavior,
  and CLI commands.

## Known Issues

- The ambient `pnpm` shim on this machine reports `11.7.0`; validation used the
  Corepack-cached pnpm 11.1.1 executable directly.
- `bitnami/kafka` currently has no pullable public tags. Compose uses
  `bitnamilegacy/kafka:3.7.1-debian-12-r11`; this is recorded in `docs/decisions.md`.
- No separate e2e script exists yet. P3 API contract tests are included in
  `pnpm run test`.
- API readiness checks MongoDB. Elasticsearch readiness is intentionally deferred
  until the search endpoint and ES client are implemented.
- Host-run local runtimes should use
  `mongodb://localhost:27017/message_management?replicaSet=rs0&directConnection=true`
  because the local replica set advertises the container hostname internally.

## Last Commands

- `/Users/apple/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node /Users/apple/Library/pnpm/global/5/node_modules/pnpm/bin/pnpm.cjs add -w kafkajs` - passed using pnpm 11.1.1.
- `/Users/apple/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node /Users/apple/Library/pnpm/global/5/node_modules/pnpm/bin/pnpm.cjs run typecheck` - initially failed for strict test mock casts; final rerun passed.
- `/Users/apple/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node /Users/apple/Library/pnpm/global/5/node_modules/pnpm/bin/pnpm.cjs run test` - passed using pnpm 11.1.1; 14 test suites and 33 tests passed.
- `/Users/apple/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node /Users/apple/Library/pnpm/global/5/node_modules/pnpm/bin/pnpm.cjs run build` - passed using pnpm 11.1.1.
- `/Users/apple/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node /Users/apple/Library/pnpm/global/5/node_modules/pnpm/bin/pnpm.cjs run lint` - initially failed for new-test unbound-method assertions and an unused parameter; final rerun passed.
- `docker compose up -d mongodb mongodb-init kafka` - passed; MongoDB and Kafka were healthy.
- Manual P4A publish verification - passed: inserted a pending
  `manual-p4a-verify-20260703-2` outbox row, started the outbox publisher with
  host-run `directConnection=true` MongoDB URI on `OUTBOX_HEALTH_PORT=3311`,
  readiness returned 200, MongoDB row transitioned to `published`, and the event
  appeared on Kafka topic `messages.message-created.v1`.

## Next Step

Proceed to the next requested P4 slice only when requested: Elasticsearch search lib,
search-indexer worker, Elasticsearch-backed search endpoint behavior, DLQ/redrive,
or CLI commands.
