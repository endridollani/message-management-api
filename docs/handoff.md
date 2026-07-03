# Handoff

## Current Status

P2A local infrastructure files are implemented. pnpm build/test/lint are green with pnpm 11.1.1, and the local infrastructure compose stack has been validated.

## Complete

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

- Section 20 step 5 is next.

## Known Issues

- The ambient `pnpm` shim on this machine reports `11.7.0`; validation used the Corepack-cached pnpm 11.1.1 executable directly.
- `bitnami/kafka` currently has no pullable public tags. Compose uses `bitnamilegacy/kafka:3.7.1-debian-12-r11`; this is recorded in `docs/decisions.md`.

## Last Commands

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

Proceed to Section 20 step 5: config and observability foundations.
