# Handoff

## Current Status

P2B foundation libraries and API runtime bootstrap are implemented. pnpm build/test/lint are green with pnpm 11.1.1, and the API health/metrics routes have been verified on a temporary local port.

## Complete

- P2A infrastructure remains present:
  - `docker-compose.yml` defines MongoDB replica set initialization, Kafka in KRaft mode, and Elasticsearch.
  - `.env.example` is aligned with Section 14.
  - No P2B change modified `docker-compose.yml`.
- `libs/config` now provides `MessageManagementConfigModule.forRuntime(...)` with per-runtime Joi validation for `api`, `outbox-publisher`, `search-indexer`, and `cli`.
- `libs/observability` now provides:
  - `nestjs-pino` / `pino-http` structured logging setup.
  - Correlation ID middleware and `AsyncLocalStorage` context.
  - Prometheus registry/default metrics plus HTTP metric skeleton counters/histograms.
  - Terminus runtime health indicator helpers.
- `apps/api` now boots with:
  - Global `/api` prefix, excluding `/health/*` and `/metrics`.
  - Global `ValidationPipe`.
  - Express JSON body limit of `100kb`.
  - Global exception filter returning the standard shape with `correlationId`.
  - `/health/liveness`, `/health/readiness`, and `/metrics`.
  - Graceful shutdown hooks and pino logger binding.
- Tests cover config validation and health/metrics controller behavior.

## P2A Details

- `docker-compose.yml` defines:
  - `mongodb` as a single-node replica set `rs0`.
  - `mongodb-init` as a one-shot `rs.initiate()` service.
  - `kafka` using Bitnami legacy Kafka 3.7.1 in KRaft mode.
  - `elasticsearch` as a single-node 8.14.3 container with security disabled.
- `.env.example` is aligned with Section 14.
- `README.md` documents only local infrastructure startup/stop/reset commands and pnpm validation commands.
- The existing pnpm override was moved from `package.json` to `pnpm-workspace.yaml`, which is the pnpm 11-compatible location.
- No application logic, schemas, producers, Elasticsearch clients, DTOs, controllers, or workers were implemented.

## Remaining

- Section 20 step 6 is next when requested: domain and persistence foundations.

## Known Issues

- The ambient `pnpm` shim on this machine reports `11.7.0`; validation used the Corepack-cached pnpm 11.1.1 executable directly.
- `bitnami/kafka` currently has no pullable public tags. Compose uses `bitnamilegacy/kafka:3.7.1-debian-12-r11`; this is recorded in `docs/decisions.md`.
- API readiness is a runtime-only placeholder in P2B (`dependencies: []`) because MongoDB and Elasticsearch clients are not implemented yet. Replace it with real dependency indicators when the corresponding modules are added.

## Last Commands

- `/Users/apple/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node /Users/apple/Library/pnpm/global/5/node_modules/pnpm/bin/pnpm.cjs --store-dir /Users/apple/Library/pnpm/store/v11 add -w @nestjs/config joi nestjs-pino pino-http prom-client @nestjs/terminus class-validator class-transformer` - passed using pnpm 11.1.1 after sandbox escalation for the pnpm store.
- `/Users/apple/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node /Users/apple/Library/pnpm/global/5/node_modules/pnpm/bin/pnpm.cjs --store-dir /Users/apple/Library/pnpm/store/v11 add -w express` - passed using pnpm 11.1.1 after sandbox escalation.
- `/Users/apple/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node /Users/apple/Library/pnpm/global/5/node_modules/pnpm/bin/pnpm.cjs --store-dir /Users/apple/Library/pnpm/store/v11 add -Dw @types/express` - passed using pnpm 11.1.1 after sandbox escalation.
- `pnpm run build` - passed using pnpm 11.1.1.
- `pnpm run test` - passed using pnpm 11.1.1; 6 test suites and 10 tests passed.
- `pnpm run lint` - passed using pnpm 11.1.1.
- `pnpm run start` - passed using pnpm 11.1.1 with temporary env on `PORT=3310`; process was stopped after route verification.
- `curl -s -i http://127.0.0.1:3310/health/liveness` - passed; returned 200.
- `curl -s -i http://127.0.0.1:3310/health/readiness` - passed; returned 200.
- `curl -s http://127.0.0.1:3310/metrics` - passed; returned Prometheus metrics.
- `pnpm install --config.confirmModulesPurge=false --no-frozen-lockfile` - sandboxed run hit registry DNS failure; approved rerun passed using pnpm 11.1.1 and refreshed the lockfile after moving pnpm overrides.
- `pnpm run build` - passed using pnpm 11.1.1.
- `pnpm run test` - passed using pnpm 11.1.1; 4 test suites and 4 tests passed.
- `pnpm run lint` - passed using pnpm 11.1.1.
- `docker compose config` - passed.
- `docker manifest inspect bitnami/kafka:3.7.0` - failed; no such manifest.
- `docker manifest inspect bitnami/kafka:3.7.1` - failed; no such manifest.
- `curl -s 'https://hub.docker.com/v2/repositories/bitnami/kafka/tags?page_size=25&name=3.7'` - passed; returned zero tags.
- `curl -s 'https://hub.docker.com/v2/repositories/bitnamilegacy/kafka/tags?page_size=20&name=3.7'` - passed; showed available 3.7.x tags.
- `docker manifest inspect bitnamilegacy/kafka:3.7.1-debian-12-r11` - passed.
- `docker compose up -d mongodb mongodb-init kafka elasticsearch` - initially failed because `27017` was already in use; rerun passed after the port was freed.
- `nc -vz 127.0.0.1 27017` - passed during the initial failure investigation; confirmed the port was reachable.
- `docker compose ps` - passed; MongoDB, Kafka, and Elasticsearch were healthy.
- `docker compose ps -a` - passed; `mongodb-init` exited with code 0 after initializing `rs0`.

## Next Step

Proceed to Section 20 step 6: domain and persistence foundations.
