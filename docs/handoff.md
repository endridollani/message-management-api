# Handoff

## Current Status

P4B is complete: Elasticsearch search library, search-indexer worker, and the API
search endpoint are implemented and validated. pnpm build/test/lint are green with
pnpm 11.1.1. The API supports authenticated message creation, cursor-paginated
conversation message listing, and Elasticsearch-backed conversation search.
Transactional outbox publishing and Kafka-backed indexing were manually verified
locally. CLI commands are still not implemented.

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
- P4A remains complete:
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
- P4B is complete:
  - `libs/domain` defines a search port and `SearchUnavailableError`.
  - `libs/application` provides `SearchMessagesService`.
  - `libs/search` wires `@nestjs/elasticsearch` to an 8.x Elasticsearch client,
    defines the strict `messages-v1` mapping, manages `messages-read` and
    `messages-write` aliases idempotently, exposes ES readiness, indexes through
    the write alias using `_id = message.id`, and searches through the read alias
    with a conversation filter and content match.
  - `apps/search-indexer` consumes `messages.message-created.v1` with consumer
    group `message-management-api.search-indexer`, validates v1 envelopes,
    projects only mapped fields, retries retryable ES failures with bounded
    backoff, publishes malformed/non-retryable/exhausted messages to
    `messages.message-created.v1.dlq` with error headers, and exposes
    health/readiness/metrics on `INDEXER_HEALTH_PORT`.
  - `apps/api` implements
    `GET /api/conversations/:conversationId/messages/search?q=term`, maps search
    unavailability to 503, and now includes Elasticsearch read-alias readiness.
  - Unit and API contract tests cover index manager behavior, ES query DSL/hit
    mapping, search-indexer happy path, unknown version skip, malformed event to
    DLQ, retryable/non-retryable ES errors, duplicate idempotent indexing, and API
    search validation/response/error mapping.

## Remaining

- CLI commands remain: `outbox:inspect`, `outbox:redrive`, `dlq:redrive`, and
  `es:reindex`.
- Full Testcontainers integration suite and CI hardening remain future phases.

## Known Issues

- The ambient `pnpm` shim on this machine reports `11.7.0`; validation used the
  Corepack-cached pnpm 11.1.1 executable directly.
- `bitnami/kafka` currently has no pullable public tags. Compose uses
  `bitnamilegacy/kafka:3.7.1-debian-12-r11`; this is recorded in `docs/decisions.md`.
- No separate e2e script exists yet. P3 API contract tests are included in
  `pnpm run test`.
- Host-run local runtimes should use
  `mongodb://localhost:27017/message_management?replicaSet=rs0&directConnection=true`
  because the local replica set advertises the container hostname internally.
- Local Elasticsearch may refuse new shard allocation if Docker disk usage is
  above the high watermark. During P4B smoke verification this made `messages-v1`
  red until `cluster.routing.allocation.disk.threshold_enabled=false` was applied
  transiently and then restored after verification.
- Keep `@elastic/elasticsearch` pinned to 8.x while Compose runs Elasticsearch
  8.14.x; the 9.x client sends incompatible compatibility headers.

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
- `/Users/apple/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node /Users/apple/Library/pnpm/global/5/node_modules/pnpm/bin/pnpm.cjs add -w @nestjs/elasticsearch @elastic/elasticsearch` - passed using pnpm 11.1.1, but initially installed an incompatible 9.x ES client.
- `/Users/apple/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node /Users/apple/Library/pnpm/global/5/node_modules/pnpm/bin/pnpm.cjs add -w @elastic/elasticsearch@8.14.0` - passed using pnpm 11.1.1.
- `/Users/apple/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node /Users/apple/Library/pnpm/global/5/node_modules/pnpm/bin/pnpm.cjs run test` - passed using pnpm 11.1.1; 17 suites and 53 tests passed.
- `/Users/apple/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node /Users/apple/Library/pnpm/global/5/node_modules/pnpm/bin/pnpm.cjs run build` - passed using pnpm 11.1.1.
- `/Users/apple/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node /Users/apple/Library/pnpm/global/5/node_modules/pnpm/bin/pnpm.cjs run lint` - passed using pnpm 11.1.1.
- `/Users/apple/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node /Users/apple/Library/pnpm/global/5/node_modules/pnpm/bin/pnpm.cjs run format:check` - failed because pre-existing files outside the P4B slice are not Prettier-formatted.
- `docker compose up -d mongodb mongodb-init kafka elasticsearch` - passed; all infra containers were healthy.
- Manual P4B create-to-search verification - passed: host-run API on `PORT=3410`, outbox on `OUTBOX_HEALTH_PORT=3411`, and search-indexer on `INDEXER_HEALTH_PORT=3412` all reported readiness; POST created message `6a479ab73d530e785e1b76df`; search returned it from Elasticsearch through the API.

## Next Step

Proceed to the CLI slice only when requested: `outbox:inspect`, `outbox:redrive`,
`dlq:redrive`, and `es:reindex`. Do not implement unrelated pipeline changes unless
required for CLI type compatibility.
