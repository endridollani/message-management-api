# Handoff

## Current Status

P8 is complete. The message-management API is ready for handoff with API,
outbox-publisher, search-indexer, CLI, tests, CI workflow, Docker targets,
README, runbooks, observability docs, and security docs in place.

Post-P8 CI setup fix: GitHub Actions now installs pnpm with
`pnpm/action-setup@v4` before `actions/setup-node@v4` enables `cache: pnpm` in
each cached job. The workflow pins pnpm 11.1.1, sets `run_install: false`, uses
`cache-dependency-path: pnpm-lock.yaml`, and still runs
`pnpm install --frozen-lockfile` explicitly.

Final validation found one real recovery defect: the search-indexer could miss
messages published while it was stopped if the consumer group had no committed
offset for the target partition. The indexer now subscribes with
`fromBeginning: true`, which is safe because Elasticsearch writes are idempotent
by message id. Focused unit coverage was added for this behavior, and the
manual restart smoke passed after the fix.

Post-P8 Swagger/OpenAPI polish: the API runtime now serves Swagger UI at
`/docs` and OpenAPI JSON at `/docs-json`. The generated document covers the
message, health, readiness, and metrics HTTP endpoints only, and protected
message operations declare the `x-api-key` header security requirement.

Latest Swagger slice validation used the pinned pnpm 11.1.1 executable directly
because the ambient `pnpm` shim still reports 11.7.0 locally. `pnpm install`,
`typecheck`, `lint`, `test:unit`, `test:e2e`, `test:ci`, and `build` all passed.
Runtime smoke started the built API on port `3010`, verified `/docs` and
`/docs-json`, confirmed missing `x-api-key` still returns `401`, and confirmed
create/list/search behavior with the local outbox and indexer workers. The
search smoke hit the known local Elasticsearch flood-stage
`read_only_allow_delete` caveat first; the documented local disk-watermark
remediation was applied and the transient cluster setting was restored after the
indexed search hit passed.

Post-review operability cleanup addressed the approved minor Claude review
comments. API Elasticsearch index bootstrap is now non-fatal only for the API
runtime, while readiness still reports Elasticsearch down and search returns
`503`. Search-indexer readiness now includes KafkaJS consumer runner state from
CRASH/STOP instrumentation. CLI bootstrap no longer requires all MongoDB, Kafka,
and Elasticsearch env vars up front; selected commands still fail when their own
required env vars are missing. `start:prod` now points at the emitted API path
used by Docker, and ordering docs now describe per-conversation partition
affinity rather than strict ordering across retries.

Post-P8 local Git hook setup added Husky and lint-staged as dev dependencies.
The local `pre-commit` hook runs staged-file formatting/linting through
lint-staged only, and the local `pre-push` hook runs `typecheck`, `lint`,
`test:unit`, and `build`. The hooks intentionally do not run integration tests,
Docker builds, audits, or the full CI pipeline. CI remains the source of truth.

## How To Run Locally

Prepare pnpm and dependencies:

```sh
corepack enable
corepack prepare pnpm@11.1.1 --activate
pnpm install --frozen-lockfile
```

Generate `.env` from `.env.example` with a local API key hash:

```sh
DEV_API_KEY='local-dev-key' node -e 'const fs = require("node:fs"); const crypto = require("node:crypto"); const key = process.env.DEV_API_KEY; const hash = crypto.createHash("sha256").update(key).digest("hex"); fs.writeFileSync(".env", fs.readFileSync(".env.example", "utf8").replace("local-dev:<sha256-of-dev-key>", `local-dev:${hash}`));'
```

Start infrastructure:

```sh
docker compose up -d mongodb mongodb-init kafka elasticsearch
docker compose ps
```

Run host processes in separate terminals:

```sh
pnpm run start:dev
pnpm run start:outbox-publisher
pnpm run start:search-indexer
```

Useful local API checks:

```sh
curl -s -X POST 'http://localhost:3000/api/messages' \
  -H 'content-type: application/json' \
  -H 'x-api-key: local-dev-key' \
  -d '{"conversationId":"conversation-1","senderId":"sender-1","content":"hello searchable world"}'

curl -s 'http://localhost:3000/api/conversations/conversation-1/messages?limit=10&sortOrder=desc' \
  -H 'x-api-key: local-dev-key'

curl -s 'http://localhost:3000/api/conversations/conversation-1/messages/search?q=hello&limit=10' \
  -H 'x-api-key: local-dev-key'

curl -s 'http://localhost:3000/docs-json' | jq '.info'
```

CLI dry-run checks:

```sh
pnpm run start:cli -- outbox:inspect
pnpm run start:cli -- outbox:redrive --dry-run
pnpm run start:cli -- dlq:redrive --dry-run --limit 10 --idle-timeout-ms 5000
pnpm run start:cli -- es:reindex --dry-run
```

## How To Validate

Use pnpm 11.1.1:

```sh
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm run lint
pnpm run test:unit
pnpm run test:e2e
pnpm run test:integration
pnpm run test:ci
pnpm run build
docker compose config
docker build --target api -t message-management-api:api .
docker build --target outbox-publisher -t message-management-api:outbox-publisher .
docker build --target search-indexer -t message-management-api:search-indexer .
docker build --target cli -t message-management-api:cli .
pnpm audit --prod --audit-level high
```

Latest post-review validation used the cached pnpm 11.1.1 executable directly
because the ambient `pnpm` shim reports 11.7.0 and `corepack pnpm` fails under
the local Node 26/Corepack combination. `typecheck`, `lint`, `test:unit`,
`test:e2e`, `test:integration`, `test:ci`, `build`, `docker compose config`,
and Docker builds for the `api` and `search-indexer` targets passed. The
integration suite emitted the known local KafkaJS `TimeoutNegativeWarning` and
transient single-node coordinator logs, but all assertions passed.

Latest local-hook validation also used the cached pnpm 11.1.1 executable
directly. `pnpm install`, `typecheck`, `lint`, `test:unit`, `test:ci`, and
`build` passed. Manual hook checks passed: `pre-commit` invoked lint-staged, and
`pre-push` ran only `typecheck`, `lint`, `test:unit`, and `build`.

## Runtime Smoke Result

Clean local stack smoke passed after `docker compose down -v` and a fresh
`docker compose up -d mongodb mongodb-init kafka elasticsearch`.

Verified:

- API, outbox-publisher, and search-indexer readiness endpoints returned 200.
- `POST /api/messages` created a MongoDB message and pending outbox event.
- List endpoint returned the message from MongoDB.
- Outbox publisher marked the row `published` and Kafka contained the event.
- Search-indexer indexed the message into Elasticsearch via `messages-write`.
- Search endpoint returned the hit from `messages-read`.
- Outbox publisher restart recovery passed: a message created while the
  publisher was stopped stayed `pending`, then published and indexed after
  restart.
- Search-indexer restart recovery passed after the P8 fix: a message published
  while the indexer was stopped was indexed and searchable after restart.
- CLI dry-runs passed for `outbox:inspect`, `outbox:redrive --dry-run`,
  `dlq:redrive --dry-run`, and `es:reindex --dry-run`.
- Elasticsearch-unavailable API smoke passed: with MongoDB healthy and
  Elasticsearch stopped, the built API booted on port `3310`, liveness returned
  200, readiness returned 503 with Elasticsearch down, `POST /api/messages`
  returned 201, list returned the created message from MongoDB, and search
  returned 503.

## Known Local Caveats

- The ambient `pnpm` shim on this machine still reports `11.7.0`. `corepack pnpm`
  currently fails locally under Node 26 with
  `ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING`, so post-review validation used the
  cached pnpm 11.1.1 executable directly. Use Corepack/pnpm 11.1.1 in normal
  environments.
- Local KafkaJS may emit `TimeoutNegativeWarning` and transient coordinator logs
  with the single-node broker. Treat this as non-blocking when readiness is
  green and commands complete.
- Local Elasticsearch may block allocation when Docker disk usage is above the
  high watermark or set indices read-only after flood-stage pressure. The local
  debugging runbook documents the transient smoke-test remediation. P8 restored
  the transient disk-threshold setting after smoke verification.
- `bitnamilegacy/kafka:3.7.1-debian-12-r11` is used because the original
  Bitnami Kafka tags were not pullable during implementation.
- Host-run local processes require
  `mongodb://localhost:27017/message_management?replicaSet=rs0&directConnection=true`
  because the local replica set advertises the Compose hostname internally.

## Production Follow-Ups

- Run MongoDB index creation as a deployment step with production `autoIndex`
  disabled.
- Use a production Kafka cluster with replication factor and
  `min.insync.replicas` configured for `acks=-1`.
- Provide secured Elasticsearch credentials/TLS and keep the client major
  aligned with the cluster major.
- Protect unauthenticated `/health/*` and `/metrics` routes at the gateway,
  service mesh, or private network boundary. Apply the same exposure decision to
  `/docs` and `/docs-json` if documentation routes are enabled in a public-facing
  deployment.
- Finalize branch protection and decide whether the CI audit job should become
  blocking.
- Add deployment packaging outside this repo if the target platform requires
  Kubernetes, Helm, or another orchestrator format.

## Next Step

No implementation phase remains. Handoff is ready.
