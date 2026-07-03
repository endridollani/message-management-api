# Progress Log

Append one entry after each completed Section 20 phase. Keep entries factual: scope, files touched, validation, open issues, and next action.

## 2026-07-03 - P1 Steps 1-3: Scaffold, agent files, docs seed

- Scope: initialized the NestJS monorepo scaffold for `api`, `outbox-publisher`, `search-indexer`, and `cli`; added root agent instructions; seeded project memory files and runbook placeholders.
- Files touched: scaffold/tooling files at the repo root, `apps/`, `libs/`, `AGENTS.md`, `CLAUDE.md`, `package-lock.json`, and `docs/`.
- Validation:
  - `npm install` - passed; refreshed `package-lock.json`.
  - `npm run format:check` - passed.
  - `npm run lint` - passed.
  - `npm test` - passed; 4 test suites and 4 tests passed.
  - `npm run build` - passed; all four app builds and root typecheck passed.
  - `npm audit --omit=dev --audit-level=high` - passed with network access; found 0 vulnerabilities.
- Open issues: none yet.
- Next action: begin Section 20 step 4 only after confirming the next implementation slice.

## 2026-07-03 - Package manager conversion to pnpm

- Scope: converted the scaffold from npm artifacts to pnpm 11.1.1 before continuing application implementation.
- Files touched: `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `.gitignore`, `AGENTS.md`, `docs/implementation-plan.md`, `docs/decisions.md`, `docs/progress-log.md`, and `docs/handoff.md`; removed `package-lock.json`.
- Validation:
  - `corepack enable` - failed in the sandbox with `EPERM` creating `/usr/local/bin/pnpm`; approved rerun also failed with `EACCES`.
  - `corepack prepare pnpm@11.1.1 --activate` - failed in the sandbox writing the Corepack cache; approved rerun passed.
  - `pnpm install` - initial sandboxed install hit registry DNS failures and was interrupted; approved rerun passed using pnpm 11.1.1 and created `pnpm-lock.yaml`.
  - `pnpm run build` - passed using pnpm 11.1.1.
  - `pnpm run test` - passed using pnpm 11.1.1; 4 test suites and 4 tests passed.
  - `pnpm run lint` - passed using pnpm 11.1.1.
- Open issues: the system `pnpm` shim currently resolves to a different runtime binary, so validation used a temporary PATH shim pointed at the Corepack-cached pnpm 11.1.1 executable.
- Next action: proceed to Section 20 step 4 with pnpm commands only.

## 2026-07-03 - TypeScript 6 baseUrl deprecation cleanup

- Scope: removed the deprecated `compilerOptions.baseUrl` setting and made every `compilerOptions.paths` target explicitly relative to the root `tsconfig.json`.
- Files touched: `tsconfig.json`, `docs/progress-log.md`, and `docs/handoff.md`.
- Validation:
  - `pnpm install --frozen-lockfile` - initial sandboxed install hit registry DNS failures and was interrupted; approved rerun passed using pnpm 11.1.1.
  - `pnpm run build` - passed using pnpm 11.1.1.
  - `pnpm run test` - passed using pnpm 11.1.1; 4 test suites and 4 tests passed.
  - `pnpm run lint` - passed using pnpm 11.1.1.
- Open issues: none for this change.
- Next action: proceed to Section 20 step 4 with pnpm commands only.

## 2026-07-03 - P2A: Local infrastructure and pnpm command consistency

- Scope: added local infrastructure compose services for MongoDB replica set initialization, Kafka in KRaft mode, and Elasticsearch; added `.env.example`; added README infrastructure startup commands; moved the existing pnpm override into `pnpm-workspace.yaml`.
- Files touched: `docker-compose.yml`, `.env.example`, `README.md`, `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `docs/decisions.md`, `docs/progress-log.md`, and `docs/handoff.md`.
- Validation:
  - `pnpm run build` - passed using pnpm 11.1.1.
  - `pnpm run test` - passed using pnpm 11.1.1; 4 test suites and 4 tests passed.
  - `pnpm run lint` - passed using pnpm 11.1.1.
  - `docker compose config` - passed.
  - `docker compose up -d mongodb mongodb-init kafka elasticsearch` - initially failed because host port `27017` was already in use; rerun passed after the port was freed.
  - `docker compose ps` - passed; MongoDB, Kafka, and Elasticsearch were healthy.
  - `docker compose ps -a` - passed; `mongodb-init` exited with code 0 after initializing `rs0`.
- Open issues: none for P2A.
- Next action: proceed to Section 20 step 5.

## 2026-07-03 - P2B: Foundation libraries and API runtime bootstrap

- Scope: implemented the `config` lib with per-runtime Joi validation; implemented the `observability` lib with pino logging setup, correlation ID context/middleware, Prometheus metrics skeleton, and Terminus health helper; bootstrapped the API with global validation, 100 KB JSON body limit, global exception filter, graceful shutdown hooks, `/health/liveness`, `/health/readiness`, and `/metrics`.
- Files touched: `package.json`, `pnpm-lock.yaml`, `apps/api/src/`, `libs/config/src/`, `libs/observability/src/`, `docs/observability.md`, `docs/decisions.md`, `docs/progress-log.md`, and `docs/handoff.md`.
- Validation:
  - `pnpm run build` - passed using pnpm 11.1.1.
  - `pnpm run test` - passed using pnpm 11.1.1; 6 test suites and 10 tests passed.
  - `pnpm run lint` - passed using pnpm 11.1.1.
  - `pnpm run start` - passed using pnpm 11.1.1 with temporary env on `PORT=3310`.
  - `curl -s -i http://127.0.0.1:3310/health/liveness` - passed; returned 200 `status: ok`.
  - `curl -s -i http://127.0.0.1:3310/health/readiness` - passed; returned 200 `status: ok` with `dependencies: []`.
  - `curl -s http://127.0.0.1:3310/metrics` - passed; returned Prometheus metrics including `message_management_process_cpu_user_seconds_total`.
- Open issues: API readiness is a dependency-free placeholder until MongoDB and Elasticsearch clients are implemented in later slices.
- Next action: proceed to Section 20 step 6 only when requested.

## 2026-07-03 - P3: Core API system of record

- Scope: implemented the domain, Mongo persistence, application services, and API
  write/read path for the system-of-record slice. `POST /api/messages` now creates
  a `Message` and pending `OutboxEvent` atomically in one MongoDB transaction;
  `GET /api/conversations/:conversationId/messages` lists messages with cursor
  pagination behind API-key auth. Kafka, publisher worker, Elasticsearch, search
  endpoint behavior, and CLI commands remain out of scope.
- Files touched: `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`,
  `apps/api/src/`, `libs/domain/src/`, `libs/persistence/src/`,
  `libs/application/src/`, `libs/config/src/`, `libs/observability/src/`,
  `test/e2e/`, and docs.
- Validation:
  - `pnpm approve-builds mongodb-memory-server` - passed using pnpm 11.1.1; downloaded
    the local MongoDB memory-server binary and recorded build approval.
  - `pnpm run typecheck` - passed using pnpm 11.1.1.
  - `pnpm run test` - passed using pnpm 11.1.1; 11 test suites and 24 tests passed,
    including MongoMemoryReplSet API contract tests.
  - `pnpm run build` - passed using pnpm 11.1.1.
  - `pnpm run lint` - passed using pnpm 11.1.1.
- Open issues: no separate e2e script exists yet; contract e2e tests currently run
  through `pnpm run test`. API readiness checks MongoDB in P3 and will add
  Elasticsearch when P4 implements search.
- Next action: proceed to P4 only when requested: messaging lib, outbox publisher, ES
  search/indexer path.

## 2026-07-03 - P4A: Messaging lib and outbox publisher

- Scope: implemented the KafkaJS messaging library and outbox-publisher runtime
  only. The messaging lib initializes `messages.message-created.v1` and
  `messages.message-created.v1.dlq`, exposes Kafka readiness, and provides a JSON
  producer using `acks: -1` without relying on KafkaJS idempotent producer
  correctness. The publisher claims due pending events, reclaims expired
  publishing leases, publishes outbox `topic`/`key`/`payload`, marks published
  with a lock-owner-safe filter, retries with exponential backoff + jitter, and
  marks max-attempt rows terminal `failed`. Elasticsearch, search-indexer, search
  endpoint behavior, and CLI commands remain out of scope.
- Files touched: `package.json`, `pnpm-lock.yaml`, `.env.example`,
  `apps/outbox-publisher/src/`, `libs/domain/src/`, `libs/messaging/src/`,
  `libs/observability/src/`, `libs/persistence/src/`, and docs.
- Validation:
  - `pnpm add -w kafkajs` - passed using pnpm 11.1.1.
  - `pnpm run typecheck` - initially failed for strict test mock casts; final
    rerun passed using pnpm 11.1.1.
  - `pnpm run test` - passed using pnpm 11.1.1; 14 test suites and 33 tests passed.
  - `pnpm run build` - passed using pnpm 11.1.1.
  - `pnpm run lint` - initially failed for new-test unbound-method assertions and
    an unused parameter; final rerun passed using pnpm 11.1.1.
  - `docker compose up -d mongodb mongodb-init kafka` - passed; MongoDB and Kafka
    were healthy.
  - Manual publish verification - passed: a pending outbox row was published by
    the worker, marked `published` in MongoDB, and observed on
    `messages.message-created.v1`.
- Open issues: no CLI redrive exists yet, so failed-row redrive remains a manual
  operator action until the CLI slice. KafkaJS emits a Node
  `TimeoutNegativeWarning` in this local runtime, but publish/readiness behavior
  is healthy.
- Next action: proceed to the next requested P4 slice only when requested:
  Elasticsearch search lib, search-indexer, search endpoint behavior, DLQ/redrive,
  or CLI commands.

## 2026-07-03 - P4B: Elasticsearch search lib, search-indexer, and search endpoint

- Scope: implemented the Elasticsearch-backed P4B slice only. Added the search
  domain port and `SearchMessagesService`; added `libs/search` with
  `@nestjs/elasticsearch`, strict `messages-v1` mapping, idempotent
  `IndexManagerService`, `messages-read`/`messages-write` aliases, ES readiness,
  and `EsMessageSearch`. Added the API search endpoint
  `GET /api/conversations/:conversationId/messages/search`, 503 mapping for
  search unavailability, and API readiness on MongoDB + Elasticsearch. Added the
  search-indexer runtime with Kafka consumption from `messages.message-created.v1`,
  event validation/projection, bounded retry for retryable ES failures, DLQ
  publishing to `messages.message-created.v1.dlq`, health/readiness, and metrics.
  CLI commands remain out of scope.
- Files touched: `package.json`, `pnpm-lock.yaml`, `apps/api/src/`,
  `apps/search-indexer/src/`, `libs/application/src/`, `libs/domain/src/`,
  `libs/messaging/src/`, `libs/observability/src/`, `libs/search/src/`,
  `test/e2e/`, and docs.
- Validation:
  - `pnpm add -w @nestjs/elasticsearch @elastic/elasticsearch` - passed using
    pnpm 11.1.1, but installed `@elastic/elasticsearch` 9.x initially.
  - `pnpm add -w @elastic/elasticsearch@8.14.0` - passed using pnpm 11.1.1 after
    local smoke testing showed the ES 8.14.3 cluster rejects v9 client
    compatibility headers.
  - `pnpm run typecheck` - passed using pnpm 11.1.1.
  - `pnpm run test --runInBand` - passed using pnpm 11.1.1; 17 suites and 53
    tests passed.
  - `pnpm run test` - passed using pnpm 11.1.1; 17 suites and 53 tests passed.
  - `pnpm run build` - passed using pnpm 11.1.1.
  - `pnpm run lint` - passed using pnpm 11.1.1.
  - `pnpm run format:check` - failed because pre-existing files outside the P4B
    slice are not Prettier-formatted; P4B-touched files were formatted directly.
  - `docker compose up -d mongodb mongodb-init kafka elasticsearch` - passed;
    MongoDB, Kafka, and Elasticsearch containers were healthy.
  - Runtime readiness smoke - passed after the ES client pin: API readiness
    reported MongoDB + `messages-read`, outbox readiness reported MongoDB +
    Kafka, and search-indexer readiness reported Kafka + `messages-write`.
  - Manual create-to-search smoke - passed: `POST /api/messages` created message
    `6a479ab73d530e785e1b76df`; outbox publisher and search-indexer processed it;
    `GET /api/conversations/p4b-verify-1783077559/messages/search?q=smoke&limit=5`
    returned the indexed hit with score and pagination.
- Open issues: CLI redrive/reindex commands remain unimplemented. Local
  Elasticsearch initially kept `messages-v1` red because the Docker node was over
  the disk high watermark; temporarily disabling the transient disk allocation
  threshold allowed the smoke test, and the setting was restored afterward.
- Next action: proceed to the CLI slice only when requested:
  `outbox:inspect`, `outbox:redrive`, `dlq:redrive`, and `es:reindex`.

## 2026-07-03 - P5: Maintenance CLI commands

- Scope: implemented the nest-commander CLI runtime with `outbox:inspect`,
  `outbox:redrive`, `dlq:redrive`, and `es:reindex`. CLI mutation commands default
  to dry-run unless `--confirm` is supplied. Outbox redrive only selects
  `failed` rows and never updates `published` rows. DLQ redrive uses the
  dedicated group `message-management-api.cli.dlq-redrive`, republishes original
  values to `messages.message-created.v1` with the original key when present, and
  does not commit offsets during dry-run. ES reindex creates a target versioned
  index, reindexes from `messages-read`, verifies counts, atomically swaps
  `messages-read`/`messages-write`, and keeps the previous index for rollback.
- Files touched: `package.json`, `pnpm-lock.yaml`, `apps/cli/src/`,
  `libs/search/src/index-manager.service.ts`,
  `libs/search/src/index-manager.service.spec.ts`, and docs.
- Validation:
  - `pnpm add -w nest-commander` - passed using pnpm 11.1.1.
  - `pnpm run typecheck` - passed using pnpm 11.1.1.
  - `pnpm run test --runInBand` - initially failed for CLI test env and updated
    alias-bootstrap expectations; final rerun passed with 17 suites and 54 tests.
  - `pnpm run lint` - initially failed for a non-Error Promise rejection in the
    DLQ service; final rerun passed.
  - `pnpm run build` - passed using pnpm 11.1.1.
  - `docker compose ps` - passed; MongoDB, Kafka, and Elasticsearch were healthy.
  - Compiled CLI smoke checks passed against the local stack:
    `outbox:inspect`, `outbox:redrive --dry-run`, `es:reindex --dry-run`, and
    `dlq:redrive --dry-run --limit 1 --idle-timeout-ms 2000`.
  - `pnpm run start:cli -- outbox:inspect` - passed against the local stack.
- Open issues: DLQ dry-run still emits the previously observed local KafkaJS
  `TimeoutNegativeWarning`, but the command completed without republishing or
  committing offsets.
- Next action: proceed to the integration-suite and CI-hardening phase when
  requested.
