# Message Management API

NestJS message-management backend with MongoDB as the source of truth, Kafka as
the event backbone, and Elasticsearch for full-text search. It exposes three
message endpoints: create a message, list messages in a conversation, and search
messages in a conversation.

## Architecture

```text
HTTP + x-api-key
  -> api
     -> MongoDB transaction: messages + outbox_events
        -> outbox-publisher
           -> Kafka topic messages.message-created.v1
              -> search-indexer
                 -> Elasticsearch messages-write alias

Search reads from Elasticsearch messages-read alias.
The cli runtime handles outbox inspection/redrive, DLQ redrive, and ES reindexing.
```

Message creation never publishes directly to Kafka. The API writes the message
and a pending outbox event atomically in MongoDB, then returns `201`. The
publisher drains the outbox to Kafka. The indexer consumes Kafka and writes an
idempotent document to Elasticsearch using the message id as `_id`.

Search is eventually consistent with writes. A successful create means the
message is durable in MongoDB; search availability depends on the asynchronous
outbox, Kafka, indexer, and Elasticsearch path catching up.

## Runtimes

- `api`: HTTP API, API-key auth, MongoDB writes/list reads, Elasticsearch search.
- `outbox-publisher`: polls MongoDB outbox rows and publishes `message.created`
  v1 events to Kafka.
- `search-indexer`: consumes message-created events and indexes them into
  Elasticsearch; poison records go to the DLQ topic.
- `cli`: maintenance commands for outbox, DLQ, and Elasticsearch reindexing.

## Prerequisites

- Node.js 22 recommended; Node.js 20 or newer required.
- pnpm 11.1.1. Use Corepack if pnpm is not already pinned locally.
- Docker with Compose v2.
- Local ports `3000`, `3001`, `3002`, `27017`, `9094`, and `9200` free.

```sh
corepack enable
corepack prepare pnpm@11.1.1 --activate
pnpm install --frozen-lockfile
```

## Quick Start

Generate a local development API key hash and write `.env` from the example:

```sh
DEV_API_KEY='local-dev-key' node -e 'const fs = require("node:fs"); const crypto = require("node:crypto"); const key = process.env.DEV_API_KEY; const hash = crypto.createHash("sha256").update(key).digest("hex"); fs.writeFileSync(".env", fs.readFileSync(".env.example", "utf8").replace("local-dev:<sha256-of-dev-key>", `local-dev:${hash}`));'
```

Start the local infrastructure:

```sh
docker compose up -d mongodb mongodb-init kafka elasticsearch
docker compose ps
```

Run the three service runtimes in separate terminals:

```sh
pnpm run start:dev
pnpm run start:outbox-publisher
pnpm run start:search-indexer
```

Smoke test create, list, and search:

```sh
curl -s -X POST 'http://localhost:3000/api/messages' \
  -H 'content-type: application/json' \
  -H 'x-api-key: local-dev-key' \
  -H 'x-correlation-id: quickstart-1' \
  -d '{"conversationId":"conversation-1","senderId":"sender-1","content":"hello searchable world","metadata":{"channel":"local"}}'

curl -s 'http://localhost:3000/api/conversations/conversation-1/messages?limit=10&sortOrder=desc' \
  -H 'x-api-key: local-dev-key'

curl -s 'http://localhost:3000/api/conversations/conversation-1/messages/search?q=hello&limit=10' \
  -H 'x-api-key: local-dev-key'
```

If search returns an empty result immediately after create, wait briefly and
retry. Indexing is asynchronous.

Stop or reset local infrastructure:

```sh
docker compose down
docker compose down -v
```

## Docker Compose

The checked-in Compose file starts MongoDB, Kafka, and Elasticsearch for local
development and tests:

```sh
docker compose config
docker compose up -d mongodb mongodb-init kafka elasticsearch
```

Host-run runtimes use `localhost` endpoints from `.env`. MongoDB includes
`directConnection=true` because the local replica set advertises its internal
container hostname.

Compose does not currently run the application containers. The application
images are buildable with the Dockerfile targets listed below.

## Development Mode

Use `.env` for host-run local development. Important defaults:

- `MONGODB_URI=mongodb://localhost:27017/message_management?replicaSet=rs0&directConnection=true`
- `KAFKA_BROKERS=localhost:9094`
- `ELASTICSEARCH_NODE=http://localhost:9200`
- `OUTBOX_HEALTH_PORT=3001`
- `INDEXER_HEALTH_PORT=3002`

Useful commands:

```sh
pnpm run start:dev
pnpm run start:outbox-publisher
pnpm run start:search-indexer
pnpm run start:cli -- outbox:inspect
```

## API

All message endpoints require:

```text
x-api-key: <raw-api-key>
```

The raw key is hashed with SHA-256 and compared with `API_KEYS=name:hash`
entries from the environment. Health and metrics routes are intentionally outside
the `/api` prefix and are unauthenticated; restrict them at the network or
gateway in non-local deployments.

Swagger UI is available from the API runtime at `/docs`, and the OpenAPI JSON
document is available at `/docs-json`. The message operations in the OpenAPI
document declare the `x-api-key` header security requirement.

Endpoints:

- `POST /api/messages`
  - Body: `conversationId`, `senderId`, `content`, optional `metadata`.
  - Returns `201` with the created message.
- `GET /api/conversations/:conversationId/messages`
  - Query: `limit` `1..100`, optional `cursor`, `sortOrder=asc|desc`.
  - Returns cursor-paginated MongoDB results.
- `GET /api/conversations/:conversationId/messages/search`
  - Query: required `q`, `page` `1..100`, `limit` `1..50`.
  - Returns Elasticsearch results with `score`.
- `GET /health/liveness`
- `GET /health/readiness`
- `GET /metrics`
- `GET /docs`
- `GET /docs-json`

See [docs/api-examples.md](docs/api-examples.md)
for request and response examples.

Standard error shape:

```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": ["content should not be empty"],
  "path": "/api/messages",
  "timestamp": "2026-07-03T09:00:00.000Z",
  "correlationId": "..."
}
```

## Operations

Runbooks:

- [Outbox](docs/runbooks/outbox.md)
- [DLQ redrive](docs/runbooks/dlq-redrive.md)
- [Elasticsearch reindex](docs/runbooks/reindex-elasticsearch.md)
- [Local debugging](docs/runbooks/local-debugging.md)

CLI commands:

```sh
pnpm run start:cli -- outbox:inspect
pnpm run start:cli -- outbox:redrive --dry-run
pnpm run start:cli -- dlq:redrive --dry-run --limit 10
pnpm run start:cli -- es:reindex --dry-run
```

State-changing CLI commands default to dry-run behavior unless `--confirm` is
provided.

## Testing

```sh
pnpm run typecheck
pnpm run test:unit
pnpm run test:e2e
pnpm run test:integration
pnpm run test:ci
pnpm run lint
pnpm run build
```

`pnpm run test` runs unit and e2e only. `test:integration` and `test:ci` start
real MongoDB, Kafka, and Elasticsearch Testcontainers.

## CI Checks

GitHub Actions defines these jobs:

- `install`
- `lint`
- `typecheck`
- `unit`
- `e2e`
- `integration`
- `build`
- `docker-build`
- `audit` with `continue-on-error: true`

The docker-build job builds all runtime targets without pushing images.

## Docker Builds

```sh
docker build --target api -t message-management-api:api .
docker build --target outbox-publisher -t message-management-api:outbox-publisher .
docker build --target search-indexer -t message-management-api:search-indexer .
docker build --target cli -t message-management-api:cli .
```

## Project Structure

```text
apps/
  api/
  outbox-publisher/
  search-indexer/
  cli/
libs/
  application/
  config/
  domain/
  messaging/
  observability/
  persistence/
  search/
test/
  e2e/
  integration/
```

## Production Notes And Limitations

- MongoDB transactions require a replica set. Local Compose uses one node;
  production should use a real replica set.
- Kafka production deployments should use multiple brokers, replication, and
  appropriate `min.insync.replicas`. The producer sends with `acks: -1`.
- The default publisher model is one active publisher replica. Kafka keying
  gives per-conversation partition affinity. Strict per-conversation ordering is
  not guaranteed across publish retries. Scale-out needs explicit key-hash
  sharding to preserve claim ownership.
- Elasticsearch runs unsecured locally. Production must enable security, TLS,
  credentials, backup/restore, and index lifecycle policies appropriate to the
  deployment.
- API readiness includes Elasticsearch because the deployed API contract includes
  search. During an Elasticsearch outage, the API process still boots and
  create/list remain available when MongoDB is healthy, but readiness reports
  Elasticsearch down and search returns `503`.
- `senderId` is trusted only for API-key-authenticated internal services. Public
  user-facing deployments must derive sender identity from an authenticated
  principal, such as a JWT `sub`.
- Health and `/metrics` are unauthenticated in the app and must not be exposed
  publicly without network restrictions or external auth.
- Production index creation should be handled as a deploy/migration step with
  `autoIndex` disabled.
- A known local KafkaJS `TimeoutNegativeWarning` can appear with the single-node
  Kafka setup; see the local debugging runbook.
