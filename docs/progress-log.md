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

## 2026-07-03 - P6: Integration suite and CI hardening

- Scope: added explicit `test:unit`, `test:e2e`, `test:integration`, and
  `test:ci` scripts; split Jest into separate unit/e2e/integration projects;
  added a Testcontainers integration suite for MongoDB, Kafka, Elasticsearch,
  outbox publishing, search indexing, DLQ/redrive, HTTP create-to-search, and ES
  reindex alias swaps; added GitHub Actions CI jobs; added multi-target
  Dockerfile and `.dockerignore`.
- Files touched: `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`,
  `jest.config.js`, `test/jest/`, `test/integration/`, `.github/workflows/ci.yml`,
  `Dockerfile`, `.dockerignore`, `README.md`, and docs.
- Validation:
  - `pnpm install --frozen-lockfile` with the existing pnpm store - passed using
    pnpm 11.1.1.
  - `pnpm run typecheck` - passed.
  - `pnpm run test:unit` - passed; 14 suites and 42 tests passed.
  - `pnpm run test:e2e` - passed; 3 suites and 12 tests passed.
  - `pnpm run test:integration` - initially failed for Kafka hostname, ES
    wildcard-delete safety, ES disk-watermark allocation, and a hanging Kafka
    observer helper; final rerun passed with 1 suite and 10 tests.
  - `pnpm run test` - passed; 17 suites and 54 tests passed.
  - `pnpm run lint` - passed.
  - `pnpm run build` - initially failed on a strict KafkaJS handler return type;
    final rerun passed.
  - `pnpm run test:ci` - passed; unit, e2e, and integration all green.
  - `docker build --target api -t message-management-api:api .` - initially
    failed because the Docker context copied local `node_modules`; final rerun
    passed after adding `.dockerignore`.
  - `docker build --target outbox-publisher -t message-management-api:outbox-publisher .` - passed.
  - `docker build --target search-indexer -t message-management-api:search-indexer .` - passed.
  - `docker build --target cli -t message-management-api:cli .` - passed.
  - `pnpm audit --prod --audit-level high` - sandboxed run failed on registry
    DNS; approved network rerun passed with no known vulnerabilities.
- Open issues: integration tests still emit the known local KafkaJS
  `TimeoutNegativeWarning` and transient coordinator logs during Kafka group
  startup, but assertions are stable and green.
- Next action: proceed to P7 documentation and ops readiness only when requested.

## 2026-07-03 - Test TypeScript config for Jest globals

- Scope: fixed VS Code/TypeScript Jest global typing for test files without
  weakening production TypeScript strictness. Added a root `tsconfig.spec.json`
  for colocated unit specs, e2e tests, integration tests, and test harnesses with
  `types: ["node", "jest"]`; narrowed the root `tsconfig.json` to production
  source with Node globals only; pointed `ts-jest` at the spec tsconfig; updated
  `pnpm run typecheck` to check both production and test projects; and updated
  ESLint typed parsing to use both TS projects while exposing Jest globals only
  to spec/test files.
- Dependency check: `@types/jest` was already installed as a dev dependency, so
  no package install or lockfile change was needed.
- Files touched: `tsconfig.json`, `tsconfig.spec.json`, `test/jest/base.config.js`,
  `eslint.config.mjs`, `package.json`, and docs.
- Validation, all using pnpm 11.1.1:
  - `pnpm run typecheck` - passed.
  - `pnpm run test:unit` - passed; 14 suites and 42 tests passed.
  - `pnpm run test:e2e` - passed; 3 suites and 12 tests passed.
  - `pnpm run test:integration` - passed; 1 suite and 10 tests passed, with the
    known KafkaJS `TimeoutNegativeWarning` and transient coordinator logs.
  - `pnpm run lint` - initially failed because ESLint typed parsing only saw the
    production tsconfig after specs were removed from it; final rerun passed after
    adding `tsconfig.spec.json` to ESLint's project list.
  - `pnpm run build` - passed.
- Open issues: the local ambient `pnpm` shim still reports 11.7.0, so validation
  used the pinned pnpm 11.1.1 executable directly.
- Next action: proceed to P7 documentation and ops readiness only when requested.

## 2026-07-03 - P7: Documentation and ops readiness

- Scope: completed the documentation-readiness slice. Rewrote the README for a
  clean-clone quick start, local dev API key hash generation, architecture,
  runtime apps, Compose infra startup, development mode, API endpoints, auth
  header, test commands, CI checks, Docker build commands, and production notes.
  Updated API examples, observability docs, security docs, and all four runbooks
  to match the implemented API, workers, CLI commands, metrics, health routes,
  readiness policy, ES alias model, DLQ/outbox behavior, and known local KafkaJS
  warning.
- Files touched: `README.md`, `docs/api-examples.md`,
  `docs/observability.md`, `docs/security.md`,
  `docs/runbooks/outbox.md`, `docs/runbooks/dlq-redrive.md`,
  `docs/runbooks/reindex-elasticsearch.md`,
  `docs/runbooks/local-debugging.md`, `docs/decisions.md`,
  `docs/progress-log.md`, and `docs/handoff.md`.
- Validation, all using the pinned pnpm 11.1.1 executable where pnpm was used:
  - `pnpm run typecheck` - passed.
  - `pnpm run test:ci` - passed; unit, e2e, and integration suites green. The
    integration run emitted the known KafkaJS `TimeoutNegativeWarning` and
    transient coordinator logs.
  - `pnpm run lint` - passed.
  - `pnpm run build` - passed.
  - `docker compose config` - passed.
  - README quick-start smoke against the existing local stack - create and list
    passed immediately; search initially failed because the existing local
    Elasticsearch index was blocked by Docker disk flood-stage
    `read_only_allow_delete`. After applying the documented local-debugging
    disk-watermark procedure and restoring the transient cluster setting,
    create -> list -> search passed with an indexed hit.
- Open issues: no remaining P7 documentation gaps. The local ambient `pnpm` shim
  still reports 11.7.0, so use the pinned pnpm 11.1.1 executable or Corepack
  11.1.1 for validation. Existing local Elasticsearch volumes may still need the
  documented disk-watermark remediation if Docker disk remains high.
- Next action: P7 is complete. Proceed to P8 final validation and handoff only
  when requested.

## 2026-07-03 - P8: Final validation and handoff

- Scope: completed final clean-slate validation, runtime smoke, documentation
  consistency checks, and final handoff. P8 found and fixed one real recovery
  defect: the search-indexer now subscribes with `fromBeginning: true` so it does
  not miss messages published while stopped on partitions without committed
  offsets. Elasticsearch indexing remains idempotent by message id.
- Files touched: `apps/search-indexer/src/message-created.consumer.ts`,
  `apps/search-indexer/src/message-created.consumer.spec.ts`,
  `docs/decisions.md`, `docs/handoff.md`, and `docs/progress-log.md`.
- Validation, using pnpm 11.1.1 where pnpm was used:
  - `corepack prepare pnpm@11.1.1 --activate` - passed, but the ambient shim
    still reported 11.7.0; validation used the pinned 11.1.1 executable.
  - `pnpm install --frozen-lockfile` - passed.
  - `pnpm run typecheck` - passed after the P8 fix.
  - `pnpm run lint` - passed after the P8 fix.
  - `pnpm run test:unit` - passed after the P8 fix; 14 suites and 43 tests.
  - `pnpm run test:e2e` - passed after the P8 fix; 3 suites and 12 tests.
  - `pnpm run test:integration` - passed after the P8 fix; 1 suite and 10 tests.
  - `pnpm run test:ci` - passed after the P8 fix; unit, e2e, and integration
    all green.
  - `pnpm run build` - passed after the P8 fix.
  - `docker compose config` - passed.
  - `docker build --target api -t message-management-api:api .` - passed after
    the P8 fix.
  - `docker build --target outbox-publisher -t message-management-api:outbox-publisher .` - passed after the P8 fix.
  - `docker build --target search-indexer -t message-management-api:search-indexer .` - passed after the P8 fix.
  - `docker build --target cli -t message-management-api:cli .` - passed after
    the P8 fix.
  - `pnpm audit --prod --audit-level high` - passed with no known
    vulnerabilities.
- Runtime smoke:
  - `docker compose down -v` followed by
    `docker compose up -d mongodb mongodb-init kafka elasticsearch` passed.
  - MongoDB, Kafka, and Elasticsearch became healthy; `mongodb-init` exited 0.
  - API, outbox-publisher, and search-indexer readiness endpoints returned 200.
  - Create/list/outbox publish/ES document/search endpoint smoke passed.
  - Outbox publisher restart recovery passed.
  - Search-indexer restart recovery initially failed, exposed the missing-offset
    defect, then passed after the fix and rebuild.
  - CLI dry-runs passed for `outbox:inspect`, `outbox:redrive --dry-run`,
    `dlq:redrive --dry-run --limit 10 --idle-timeout-ms 2000`, and
    `es:reindex --dry-run`.
- Documentation consistency:
  - README commands match current `package.json` scripts.
  - Non-historical docs are pnpm-based.
  - Endpoint names, env vars, health routes, metrics routes, CLI commands, Kafka
    topics, Elasticsearch aliases, and Docker targets match implementation.
  - Known local caveats are documented in handoff/runbooks.
- Open issues: local caveats remain for the ambient pnpm shim mismatch, KafkaJS
  `TimeoutNegativeWarning`, and Docker disk pressure causing Elasticsearch
  high-watermark or flood-stage behavior. P8 restored the transient
  Elasticsearch disk-threshold setting after smoke verification.
- Next action: no implementation phase remains; project is ready for handoff.

## 2026-07-03 - CI pnpm setup fix

- Scope: fixed the GitHub Actions pnpm cache setup order. Each workflow job that
  configures `actions/setup-node@v4` with `cache: pnpm` now runs
  `pnpm/action-setup@v4` first with pnpm 11.1.1 and `run_install: false`, and
  uses `cache-dependency-path: pnpm-lock.yaml`.
- Files touched: `.github/workflows/ci.yml`, `docs/progress-log.md`, and
  `docs/handoff.md`.
- Validation, using the repo-pinned pnpm 11.1.1 through Corepack:
  - Inspected `.github/workflows/ci.yml` for pnpm setup ordering and cache
    dependency path.
  - `pnpm run typecheck` - passed.
  - `pnpm run lint` - passed.
  - `pnpm run test:ci` - passed; unit, e2e, and integration all green with the
    known KafkaJS warning/coordinator noise.
  - `pnpm run build` - passed.
- Open issues: none for the CI setup fix.
- Next action: rerun the GitHub Actions workflow on the PR branch.

## 2026-07-03 - Documentation link cleanup

- Fixed GitHub documentation links by replacing local absolute paths with
  relative repo links.

## 2026-07-03 - Swagger/OpenAPI API documentation

- Scope: added API-only Swagger/OpenAPI documentation. The API runtime serves
  Swagger UI at `/docs` and OpenAPI JSON at `/docs-json`; message endpoints
  declare the `x-api-key` header security requirement. Added request/response
  schema decorators for message DTOs and controller decorators for message,
  health, readiness, and metrics routes. No API endpoint names, fields, auth
  behavior, validation behavior, worker logic, or CLI logic changed.
- Files touched: `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`,
  `apps/api/src/main.ts`, `apps/api/src/swagger.ts`,
  `apps/api/src/openapi/error-response.dto.ts`, message controllers/DTOs,
  health and metrics controllers, `test/e2e/api-test-harness.ts`,
  `test/e2e/openapi.spec.ts`, `README.md`, `docs/api-examples.md`,
  `docs/security.md`, `docs/decisions.md`, `docs/handoff.md`, and
  `docs/progress-log.md`.
- Dependency changes: added `@nestjs/swagger`; did not add
  `swagger-ui-express` because the installed Nest Swagger package includes
  `swagger-ui-dist`. Explicitly blocked the transitive `@scarf/scarf` build
  script with `allowBuilds: false`.
- Validation, using the pinned pnpm 11.1.1 executable directly:
  - `pnpm install` - passed.
  - `pnpm run typecheck` - passed.
  - `pnpm run lint` - passed.
  - `pnpm run test:unit` - passed; 14 suites and 43 tests.
  - `pnpm run test:e2e` - passed; 4 suites and 14 tests.
  - `pnpm run test:ci` - passed; unit, e2e, and integration suites green with
    the known local KafkaJS warning/coordinator noise.
  - `pnpm run build` - passed.
- Runtime smoke: started the built API on port `3010`; `GET /docs` returned
  Swagger UI, `GET /docs-json` returned OpenAPI JSON with title/version and
  `x-api-key` security, unauthenticated `POST /api/messages` still returned
  `401`, authenticated create/list passed, and create -> outbox -> Kafka ->
  indexer -> Elasticsearch -> search returned the indexed message after starting
  the workers. The first search-indexing attempt hit the known local
  Elasticsearch flood-stage `read_only_allow_delete` block; the documented local
  disk-watermark remediation was applied and the transient cluster setting was
  restored after verification.
- Open issues: none for Swagger/OpenAPI. Local caveats remain for the ambient
  pnpm shim mismatch, KafkaJS local warning noise, and Docker disk pressure.
- Next action: run the remote CI workflow on the PR branch if this is being
  reviewed through GitHub.

## 2026-07-03 - Addressed Claude review operability comments

- Scope: addressed Claude review operability comments. Made API Elasticsearch
  index bootstrap non-fatal while keeping readiness/search failure visible;
  added KafkaJS consumer CRASH/STOP runner state to search-indexer readiness;
  corrected `start:prod` to the emitted API path; made CLI bootstrap validation
  command-scoped for infrastructure env vars; softened per-conversation ordering
  wording to partition affinity across docs.
- Files touched: API/search-indexer/search/config/CLI tests and runtime files,
  `package.json`, `test/e2e`, Jest unit config, README, observability,
  decisions, handoff, progress log, and runbooks.
- Validation, using the cached pnpm 11.1.1 executable directly:
  - `pnpm run typecheck` - passed.
  - `pnpm run lint` - passed.
  - `pnpm run test:unit` - passed; 16 suites and 52 tests.
  - `pnpm run test:e2e` - passed; 4 suites and 15 tests.
  - `pnpm run test:integration` - passed; 1 suite and 10 tests, with the known
    local KafkaJS warning/coordinator noise.
  - `pnpm run test:ci` - passed; unit, e2e, and integration all green, with the
    same known KafkaJS warning/coordinator noise.
  - `pnpm run build` - passed.
  - `docker compose config` - passed.
  - `docker build --target api -t message-management-api:api .` - passed.
  - `docker build --target search-indexer -t message-management-api:search-indexer .` - passed.
- Runtime smoke: with MongoDB healthy and Elasticsearch stopped, the built API
  booted on port `3310`, liveness returned 200, readiness returned 503 with
  Elasticsearch down, create/list worked against MongoDB, and search returned 503. Elasticsearch was restarted afterward.
- Open issues: ambient `pnpm` still reports 11.7.0 and `corepack pnpm` currently
  fails locally under Node 26, so validation used the cached pnpm 11.1.1 binary
  directly. No follow-up remains for the Claude review findings.
- Next action: hand back for review.

## 2026-07-03 - VS Code TypeScript test project detection

- Scope: made the root TypeScript config a solution-style entry point so VS Code
  loads the source and spec projects separately. Added `tsconfig.src.json` for
  production source typechecking, kept Jest globals isolated to
  `tsconfig.spec.json`, updated ESLint typed parsing and the `typecheck` script,
  and added a workspace-relative VS Code TypeScript SDK setting.
- Files touched: `.vscode/settings.json`, `tsconfig.json`,
  `tsconfig.src.json`, `tsconfig.spec.json`, `eslint.config.mjs`,
  `package.json`, and `docs/progress-log.md`.
- Verification: `tsc --showConfig -p tsconfig.src.json` keeps production types
  to `node`; `tsc --showConfig -p tsconfig.spec.json` includes `node` and
  `jest` with the shared `@app/*` path aliases. A `tsserver` project-info probe
  resolved the requested representative spec files to `tsconfig.spec.json`.
- Validation, using the cached pnpm 11.1.1 executable directly:
  - `pnpm run typecheck` - passed.
  - `pnpm run lint` - passed.
  - `pnpm run test:unit` - passed; 16 suites and 52 tests.
  - `pnpm run test:e2e` - passed; 4 suites and 15 tests.
  - `pnpm run test:integration` - passed; 1 suite and 10 tests, with the known
    local KafkaJS warning/coordinator noise.
  - `pnpm run test:ci` - passed; unit, e2e, and integration all green, with the
    same known KafkaJS warning/coordinator noise.
  - `pnpm run build` - passed.
- Open issues: none.

## 2026-07-03 - Added lightweight local Git hooks

- Scope: added Husky and lint-staged for local developer guardrails without
  changing backend runtime behavior or duplicating full CI locally. `pre-commit`
  runs lint-staged against staged files only. `pre-push` runs typecheck, lint,
  unit tests, and build only.
- Files touched: `.husky/pre-commit`, `.husky/pre-push`, `package.json`,
  `pnpm-lock.yaml`, `README.md`, `docs/handoff.md`, and `docs/progress-log.md`.
- Validation, using the cached pnpm 11.1.1 executable directly:
  - `pnpm install` - passed.
  - `pnpm run typecheck` - passed.
  - `pnpm run lint` - passed.
  - `pnpm run test:unit` - passed; 16 suites and 52 tests.
  - `pnpm run test:ci` - passed; unit, e2e, and integration all green, with the
    known local KafkaJS warning/coordinator noise.
  - `pnpm run build` - passed.
- Manual hook verification:
  - `pre-commit` invoked `pnpm exec lint-staged` and exited cleanly with no
    staged files.
  - `pre-push` ran `typecheck`, `lint`, `test:unit`, and `build`; it did not run
    integration tests, Docker builds, audit, or `test:ci`.
- Open issues: ambient `pnpm` still reports 11.7.0 and `corepack pnpm` still
  fails locally under Node 26, so validation placed the cached pnpm 11.1.1
  executable first on `PATH` for manual hook checks.
