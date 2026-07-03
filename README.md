# Message Management API

Production-grade NestJS message-management backend scaffold.

## Local Infrastructure

Start only the infrastructure services for the current implementation slice:

```sh
cp .env.example .env
docker compose up -d mongodb mongodb-init kafka elasticsearch
docker compose ps
```

The local stack exposes:

- MongoDB replica set `rs0` at `mongodb://localhost:27017/message_management?replicaSet=rs0`
- Kafka at `localhost:9094` for host-run apps and `kafka:9092` for compose services
- Elasticsearch at `http://localhost:9200`

Stop the stack while keeping local volumes:

```sh
docker compose down
```

Reset local infrastructure data:

```sh
docker compose down -v
```

## Package Scripts

Use pnpm 11.1.1 for repository commands:

```sh
pnpm run build
pnpm run test
pnpm run lint
```

Testing is split by suite:

```sh
pnpm run test:unit         # colocated apps/libs specs with mocked I/O
pnpm run test:e2e          # fast API contract tests with MongoMemoryReplSet
pnpm run test:integration  # Docker/Testcontainers MongoDB + Kafka + Elasticsearch
pnpm run test:ci           # unit + e2e + integration
```

`pnpm run test` runs unit and e2e only. The integration suite is intentionally
excluded from the default test command because it starts real infrastructure.
