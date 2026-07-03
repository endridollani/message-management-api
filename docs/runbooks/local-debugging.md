# Local Debugging Runbook

## Bring Up Infrastructure

```bash
pnpm install --frozen-lockfile
docker compose up -d mongodb mongodb-init kafka elasticsearch
docker compose ps
```

For host-run runtimes, use:

```bash
export MONGODB_URI='mongodb://localhost:27017/message_management?replicaSet=rs0&directConnection=true'
export KAFKA_BROKERS='localhost:9094'
export KAFKA_CLIENT_ID='message-management-api'
export ELASTICSEARCH_NODE='http://localhost:9200'
```

## Runtime Commands

```bash
pnpm run start
pnpm run start:outbox-publisher
pnpm run start:search-indexer
pnpm run start:cli -- outbox:inspect
```

Use distinct `PORT`, `OUTBOX_HEALTH_PORT`, and `INDEXER_HEALTH_PORT` values when
running multiple host processes in parallel.

## Logs

```bash
docker compose logs -f mongodb
docker compose logs -f kafka
docker compose logs -f elasticsearch
```

## Kafka Inspection

```bash
docker compose exec kafka /opt/bitnami/kafka/bin/kafka-topics.sh \
  --bootstrap-server localhost:9092 \
  --list

docker compose exec kafka /opt/bitnami/kafka/bin/kafka-consumer-groups.sh \
  --bootstrap-server localhost:9092 \
  --describe \
  --group message-management-api.search-indexer
```

## MongoDB and Outbox

```bash
docker compose exec mongodb mongosh --quiet message_management --eval \
  "db.messages.find().sort({ timestamp: -1 }).limit(5).toArray()"

pnpm run start:cli -- outbox:inspect
pnpm run start:cli -- outbox:redrive --dry-run
```

## Elasticsearch

```bash
curl -s 'http://localhost:9200/_cluster/health?pretty'
curl -s 'http://localhost:9200/_alias/messages-read?pretty'
curl -s 'http://localhost:9200/messages-read/_search?pretty'
pnpm run start:cli -- es:reindex --dry-run
```

If local Elasticsearch keeps `messages-v1` or a reindex target red because Docker
disk usage is above the high watermark, inspect allocation:

```bash
curl -s 'http://localhost:9200/_cluster/allocation/explain?pretty'
```

For local smoke testing only, the disk allocation threshold can be disabled
transiently and restored afterward:

```bash
curl -s -X PUT 'http://localhost:9200/_cluster/settings' \
  -H 'Content-Type: application/json' \
  -d '{"transient":{"cluster.routing.allocation.disk.threshold_enabled":false}}'

curl -s -X PUT 'http://localhost:9200/_cluster/settings' \
  -H 'Content-Type: application/json' \
  -d '{"transient":{"cluster.routing.allocation.disk.threshold_enabled":null}}'
```

Prefer freeing Docker disk space over leaving this disabled.

## Common Local Warnings

KafkaJS may emit a local Node `TimeoutNegativeWarning` with this single-node
Kafka setup. If readiness and command output are otherwise healthy, treat it as a
local runtime warning and continue investigating only if Kafka operations fail.

## Integration Tests

The integration suite uses Testcontainers and starts disposable MongoDB, Kafka,
and Elasticsearch containers with dynamic host ports:

```bash
pnpm run test:integration
```

Run it when changing the create/outbox/Kafka/indexing/search/reindex pipeline.
It covers transactional write rollback, outbox publishing and retry state,
indexer idempotency, DLQ behavior, DLQ redrive, HTTP create-to-search, and ES
reindex alias swaps.

The suite disables Elasticsearch disk allocation thresholds inside its disposable
container only. This avoids local Docker high-watermark flakes while preserving
the production/runtime Elasticsearch behavior.

For the full local test gate:

```bash
pnpm run test:ci
```

`pnpm run test` remains the fast default and does not run integration tests.
