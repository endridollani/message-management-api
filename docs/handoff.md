# Handoff

## Current Status

P6 is complete: integration verification and CI hardening are implemented.
Post-P6 TypeScript/Jest editor tooling is also fixed: test files are covered by
`tsconfig.spec.json` with Node + Jest globals, production `tsconfig.json` remains
test-free with Node globals only, `ts-jest` uses the spec tsconfig, and ESLint
typed parsing knows both TS projects while limiting Jest globals to test files.
The repo has explicit unit, e2e, integration, and CI test scripts; the integration
suite runs the production pipeline against disposable MongoDB, Kafka, and
Elasticsearch Testcontainers; CI defines install, lint, typecheck, unit, e2e,
integration, build, docker-build, and non-blocking production audit jobs. Latest
pnpm 11.1.1 validation is green for typecheck, unit, e2e, integration, lint, and
build.

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
- P5 is complete:
  - `apps/cli` uses `nest-commander` and exposes `outbox:inspect`,
    `outbox:redrive`, `dlq:redrive`, and `es:reindex`.
  - CLI operation clients are lazy and command-scoped, so Mongo-only commands do
    not connect Kafka producers or touch Elasticsearch aliases.
  - `outbox:inspect` reports pending/publishing/published/failed counts, oldest
    pending age, and a bounded failed-event summary.
  - `outbox:redrive` defaults to dry-run, requires `--confirm` to update rows,
    only selects `failed` rows, supports `--id`, `--event-id`, and `--limit`, and
    never touches `published` rows.
  - `dlq:redrive` defaults to dry-run, uses the dedicated group
    `message-management-api.cli.dlq-redrive`, preserves original values and keys
    when republishing to the main topic, and commits offsets only after confirmed
    successful republish.
  - `es:reindex` defaults to dry-run, creates a target versioned index on
    confirmed runs, reindexes from `messages-read`, verifies counts, atomically
    swaps `messages-read`/`messages-write`, and keeps the old index for rollback.
  - `IndexManagerService` no longer moves existing aliases back to `messages-v1`
    during startup, preserving operator-controlled reindex swaps.
- P6 is complete:
  - `pnpm run test:unit`, `test:e2e`, `test:integration`, and `test:ci` are
    explicit package scripts.
  - `pnpm run test` remains available and runs unit + e2e only; integration is
    opt-in because it starts Docker infrastructure.
  - Jest config is split into unit, e2e, and integration projects under
    `test/jest/`.
  - `test/integration/message-pipeline.integration.spec.ts` verifies atomic
    message/outbox writes, transaction rollback, outbox publish-to-Kafka,
    publish failure retry state, search-indexer indexing, duplicate idempotency,
    poison-to-DLQ, DLQ redrive, HTTP create-to-search, and `es:reindex` alias
    swap behavior against real containers.
  - `.github/workflows/ci.yml` defines install, lint, typecheck, unit, e2e,
    integration, build, docker-build, and non-blocking audit jobs using
    Corepack/pnpm 11.1.1.
  - `Dockerfile` now has `api`, `outbox-publisher`, `search-indexer`, and `cli`
    targets; `.dockerignore` keeps local artifacts out of Docker builds.
- Test TypeScript tooling is current:
  - `@types/jest` is already present as a dev dependency.
  - `tsconfig.spec.json` includes colocated unit specs plus `test/` e2e and
    integration files with `types: ["node", "jest"]`.
  - Root production typechecking excludes specs/test harnesses and does not expose
    Jest globals.
  - Jest transforms use `tsconfig.spec.json`, and ESLint uses both production and
    spec TS projects with Jest globals scoped to tests.

## Remaining

- P7 documentation and ops readiness remain future work.

## Known Issues

- The ambient `pnpm` shim on this machine reports `11.7.0`; validation used the
  Corepack-cached pnpm 11.1.1 executable directly.
- `bitnami/kafka` currently has no pullable public tags. Compose uses
  `bitnamilegacy/kafka:3.7.1-debian-12-r11`; this is recorded in `docs/decisions.md`.
- Host-run local runtimes should use
  `mongodb://localhost:27017/message_management?replicaSet=rs0&directConnection=true`
  because the local replica set advertises the container hostname internally.
- Local Elasticsearch may refuse new shard allocation if Docker disk usage is
  above the high watermark. During P4B smoke verification this made `messages-v1`
  red until `cluster.routing.allocation.disk.threshold_enabled=false` was applied
  transiently and then restored after verification. The local debugging runbook
  now includes this procedure.
- Keep `@elastic/elasticsearch` pinned to 8.x while Compose runs Elasticsearch
  8.14.x; the 9.x client sends incompatible compatibility headers.
- DLQ dry-run may emit the previously observed local KafkaJS
  `TimeoutNegativeWarning`; the P5 smoke command still completed without
  republishing or committing offsets.
- The integration suite may emit the same KafkaJS `TimeoutNegativeWarning` plus
  transient coordinator logs while the single-node Kafka container forms
  consumer groups. The final P6 runs passed consistently despite this noise.

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
- `/Users/apple/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node /Users/apple/Library/pnpm/global/5/node_modules/pnpm/bin/pnpm.cjs add -w nest-commander` - passed using pnpm 11.1.1.
- `/Users/apple/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node /Users/apple/Library/pnpm/global/5/node_modules/pnpm/bin/pnpm.cjs run typecheck` - passed using pnpm 11.1.1.
- `/Users/apple/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node /Users/apple/Library/pnpm/global/5/node_modules/pnpm/bin/pnpm.cjs run test --runInBand` - initially failed for CLI test env and alias-bootstrap test expectations; final rerun passed with 17 suites and 54 tests.
- `/Users/apple/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node /Users/apple/Library/pnpm/global/5/node_modules/pnpm/bin/pnpm.cjs run lint` - initially failed for a non-Error Promise rejection in the DLQ service; final rerun passed.
- `/Users/apple/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node /Users/apple/Library/pnpm/global/5/node_modules/pnpm/bin/pnpm.cjs run build` - passed using pnpm 11.1.1.
- `docker compose ps` - passed; MongoDB, Kafka, and Elasticsearch were healthy.
- `node dist/apps/cli/apps/cli/src/main.js outbox:inspect` with local host-run env - passed; reported 0 pending, 0 publishing, 3 published, 0 failed.
- `node dist/apps/cli/apps/cli/src/main.js outbox:redrive --dry-run` with local host-run env - passed; matched 0 failed events and reset 0 rows.
- `node dist/apps/cli/apps/cli/src/main.js es:reindex --dry-run` with local host-run env - passed; planned `messages-v2` from `messages-v1`, source count 1, no alias swap.
- `node dist/apps/cli/apps/cli/src/main.js dlq:redrive --dry-run --limit 1 --idle-timeout-ms 2000` with local host-run env - passed; consumed 0, republished 0, committed 0, stopped on idle timeout.
- `/Users/apple/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node /Users/apple/Library/pnpm/global/5/node_modules/pnpm/bin/pnpm.cjs run start:cli -- outbox:inspect` with local host-run env - passed.
- `/Users/apple/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node /Users/apple/Library/pnpm/global/5/node_modules/pnpm/bin/pnpm.cjs --store-dir /Users/apple/Library/pnpm/store/v11 add -D -w testcontainers` - installed `testcontainers` but exited non-zero until `pnpm-workspace.yaml` build-script decisions were made.
- `/Users/apple/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node /Users/apple/Library/pnpm/global/5/node_modules/pnpm/bin/pnpm.cjs --store-dir /Users/apple/Library/pnpm/store/v11 install --frozen-lockfile` - passed.
- `/Users/apple/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node /Users/apple/Library/pnpm/global/5/node_modules/pnpm/bin/pnpm.cjs run typecheck` - initially failed for strict integration-test types; final rerun passed.
- `/Users/apple/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node /Users/apple/Library/pnpm/global/5/node_modules/pnpm/bin/pnpm.cjs run test:unit` - passed; 14 suites and 42 tests passed.
- `/Users/apple/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node /Users/apple/Library/pnpm/global/5/node_modules/pnpm/bin/pnpm.cjs run test:e2e` - passed; 3 suites and 12 tests passed.
- `/Users/apple/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node /Users/apple/Library/pnpm/global/5/node_modules/pnpm/bin/pnpm.cjs run test:integration` - initially failed while hardening the harness; final rerun passed with 1 suite and 10 tests.
- `/Users/apple/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node /Users/apple/Library/pnpm/global/5/node_modules/pnpm/bin/pnpm.cjs run test` - passed; 17 suites and 54 tests passed.
- `/Users/apple/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node /Users/apple/Library/pnpm/global/5/node_modules/pnpm/bin/pnpm.cjs run lint` - initially failed on one async callback without await; final rerun passed.
- `/Users/apple/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node /Users/apple/Library/pnpm/global/5/node_modules/pnpm/bin/pnpm.cjs run build` - initially failed on a strict KafkaJS handler return type; final rerun passed.
- `/Users/apple/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node /Users/apple/Library/pnpm/global/5/node_modules/pnpm/bin/pnpm.cjs run test:ci` - passed; unit, e2e, and integration all green.
- `docker build --target api -t message-management-api:api .` - initially failed because local `node_modules` entered the Docker context; final rerun passed after adding `.dockerignore`.
- `docker build --target outbox-publisher -t message-management-api:outbox-publisher .` - passed.
- `docker build --target search-indexer -t message-management-api:search-indexer .` - passed.
- `docker build --target cli -t message-management-api:cli .` - passed.
- `/Users/apple/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node /Users/apple/Library/pnpm/global/5/node_modules/pnpm/bin/pnpm.cjs audit --prod --audit-level high` - sandboxed run failed on npm registry DNS; approved network rerun passed with no known vulnerabilities.
- `/Users/apple/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node /Users/apple/Library/pnpm/global/5/node_modules/pnpm/bin/pnpm.cjs run typecheck` - passed with production and spec tsconfigs.
- `/Users/apple/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node /Users/apple/Library/pnpm/global/5/node_modules/pnpm/bin/pnpm.cjs run test:unit` - passed; 14 suites and 42 tests passed.
- `/Users/apple/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node /Users/apple/Library/pnpm/global/5/node_modules/pnpm/bin/pnpm.cjs run test:e2e` - passed; 3 suites and 12 tests passed.
- `/Users/apple/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node /Users/apple/Library/pnpm/global/5/node_modules/pnpm/bin/pnpm.cjs run lint` - initially failed after removing specs from production tsconfig because ESLint only saw the production project; final rerun passed after adding the spec tsconfig to ESLint.
- `/Users/apple/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node /Users/apple/Library/pnpm/global/5/node_modules/pnpm/bin/pnpm.cjs run test:integration` - passed; 1 suite and 10 tests passed, with the known KafkaJS warning/coordinator noise.
- `/Users/apple/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node /Users/apple/Library/pnpm/global/5/node_modules/pnpm/bin/pnpm.cjs run build` - passed.

## Next Step

Proceed to P7 only when requested: documentation and ops readiness. Do not
implement Kubernetes, UI, automated DLQ redrive, or schema registry.
