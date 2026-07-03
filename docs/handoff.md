# Handoff

## Current Status

P3 core API system-of-record path is implemented. pnpm build/test/lint are green with
pnpm 11.1.1. The API now supports authenticated message creation with transactional
Message + OutboxEvent writes, and authenticated cursor-paginated conversation message
listing.

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

## Remaining

- P4 is next when requested: messaging lib, outbox publisher worker, Elasticsearch
  search/indexer path, and search endpoint behavior.

## Known Issues

- The ambient `pnpm` shim on this machine reports `11.7.0`; validation used the
  Corepack-cached pnpm 11.1.1 executable directly.
- `bitnami/kafka` currently has no pullable public tags. Compose uses
  `bitnamilegacy/kafka:3.7.1-debian-12-r11`; this is recorded in `docs/decisions.md`.
- No separate e2e script exists yet. P3 API contract tests are included in
  `pnpm run test`.
- API readiness now checks MongoDB. Elasticsearch readiness is intentionally deferred
  until P4 adds the search endpoint and ES client.

## Last Commands

- `/Users/apple/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node /Users/apple/Library/pnpm/global/5/node_modules/pnpm/bin/pnpm.cjs add -w @nestjs/mongoose mongoose` - passed using pnpm 11.1.1.
- `/Users/apple/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node /Users/apple/Library/pnpm/global/5/node_modules/pnpm/bin/pnpm.cjs add -Dw mongodb-memory-server supertest @types/supertest` - initially exited 1 because pnpm ignored the `mongodb-memory-server` build script pending approval; dependencies were added.
- `/Users/apple/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node /Users/apple/Library/pnpm/global/5/node_modules/pnpm/bin/pnpm.cjs approve-builds mongodb-memory-server` - passed using pnpm 11.1.1; downloaded MongoDB 8.2.6 for `mongodb-memory-server`.
- `/Users/apple/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node /Users/apple/Library/pnpm/global/5/node_modules/pnpm/bin/pnpm.cjs run typecheck` - initially failed during implementation for strict typing; final rerun passed.
- `/Users/apple/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node /Users/apple/Library/pnpm/global/5/node_modules/pnpm/bin/pnpm.cjs run test` - initially failed before renaming the e2e spec and fixing the `supertest` import; final rerun passed with 11 test suites and 24 tests.
- `/Users/apple/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node /Users/apple/Library/pnpm/global/5/node_modules/pnpm/bin/pnpm.cjs run build` - passed using pnpm 11.1.1.
- `/Users/apple/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node /Users/apple/Library/pnpm/global/5/node_modules/pnpm/bin/pnpm.cjs run lint` - initially failed for test lint cleanup; final rerun passed.

## Next Step

Proceed to P4 only when requested: messaging lib, outbox publisher worker, search lib,
search-indexer worker, and Elasticsearch-backed search endpoint behavior.
