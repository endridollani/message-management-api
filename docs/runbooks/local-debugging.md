# Local Debugging Runbook

## Bring Up Local Infrastructure

```sh
pnpm install --frozen-lockfile
docker compose config
docker compose up -d mongodb mongodb-init kafka elasticsearch
docker compose ps
```

For host-run runtimes, `.env` should contain:

```sh
MONGODB_URI='mongodb://localhost:27017/message_management?replicaSet=rs0&directConnection=true'
KAFKA_BROKERS='localhost:9094'
KAFKA_CLIENT_ID='message-management-api'
ELASTICSEARCH_NODE='http://localhost:9200'
```

`directConnection=true` is intentional. The local MongoDB replica set advertises
`mongodb:27017`, which host-run processes cannot resolve outside the Compose
network.

## Runtime Commands

Run in separate terminals:

```sh
pnpm run start:dev
pnpm run start:outbox-publisher
pnpm run start:search-indexer
```

CLI examples:

```sh
pnpm run start:cli -- outbox:inspect
pnpm run start:cli -- outbox:redrive --dry-run
pnpm run start:cli -- dlq:redrive --dry-run --limit 10
pnpm run start:cli -- es:reindex --dry-run
```

Use distinct `PORT`, `OUTBOX_HEALTH_PORT`, and `INDEXER_HEALTH_PORT` values when
running multiple host processes in parallel.

## Logs

```sh
docker compose logs -f mongodb
docker compose logs -f mongodb-init
docker compose logs -f kafka
docker compose logs -f elasticsearch
```

Host-run Nest runtimes log to their terminals with pino JSON logs.

## MongoDB Inspection

```sh
docker compose exec mongodb mongosh --quiet message_management --eval \
  "db.messages.find().sort({ timestamp: -1 }).limit(5).toArray()"

docker compose exec mongodb mongosh --quiet message_management --eval \
  "db.outbox_events.find().sort({ createdAt: -1 }).limit(5).toArray()"

docker compose exec mongodb mongosh --quiet message_management --eval \
  "db.outbox_events.aggregate([{ \$group: { _id: '\$status', count: { \$sum: 1 } } }]).toArray()"
```

## Kafka Inspection

List and describe topics:

```sh
docker compose exec kafka /opt/bitnami/kafka/bin/kafka-topics.sh \
  --bootstrap-server localhost:9092 \
  --list

docker compose exec kafka /opt/bitnami/kafka/bin/kafka-topics.sh \
  --bootstrap-server localhost:9092 \
  --describe \
  --topic messages.message-created.v1
```

Inspect consumer groups:

```sh
docker compose exec kafka /opt/bitnami/kafka/bin/kafka-consumer-groups.sh \
  --bootstrap-server localhost:9092 \
  --describe \
  --group message-management-api.search-indexer

docker compose exec kafka /opt/bitnami/kafka/bin/kafka-consumer-groups.sh \
  --bootstrap-server localhost:9092 \
  --describe \
  --group message-management-api.cli.dlq-redrive
```

Sample topic records:

```sh
docker compose exec kafka /opt/bitnami/kafka/bin/kafka-console-consumer.sh \
  --bootstrap-server localhost:9092 \
  --topic messages.message-created.v1 \
  --from-beginning \
  --property print.key=true \
  --max-messages 10
```

Kafka listener/coordinator logs during local startup can be noisy. Transient
group coordinator messages are expected while the single-node broker and
consumers settle. Investigate only if readiness fails, consumer lag stops
advancing, or publish/redrive commands fail.

## Elasticsearch Inspection

```sh
curl -s 'http://localhost:9200/_cluster/health?pretty'
curl -s 'http://localhost:9200/_cat/indices/messages-v*?v'
curl -s 'http://localhost:9200/_alias/messages-read?pretty'
curl -s 'http://localhost:9200/_alias/messages-write?pretty'
curl -s 'http://localhost:9200/messages-read/_search?pretty'
```

## Elasticsearch Disk Watermark

Local Elasticsearch can keep `messages-v1` or a reindex target red if Docker disk
usage is above the high watermark. Inspect allocation:

```sh
curl -s 'http://localhost:9200/_cluster/allocation/explain?pretty'
```

For local smoke testing only, disable the disk allocation threshold transiently
and restore it after verification:

```sh
curl -s -X PUT 'http://localhost:9200/_cluster/settings' \
  -H 'Content-Type: application/json' \
  -d '{"transient":{"cluster.routing.allocation.disk.threshold_enabled":false}}'

curl -s -X PUT 'http://localhost:9200/_cluster/settings' \
  -H 'Content-Type: application/json' \
  -d '{"transient":{"cluster.routing.allocation.disk.threshold_enabled":null}}'
```

Prefer freeing Docker disk space over leaving this disabled.

## Known KafkaJS TimeoutNegativeWarning

KafkaJS may emit a local Node `TimeoutNegativeWarning` with this single-node
Kafka setup, especially during DLQ dry-runs or Testcontainers runs. If readiness
is green and command output is otherwise successful, treat it as a non-blocking
local warning.

Escalate if:

- Kafka readiness is red.
- Producer sends fail.
- Consumer offsets stop advancing.
- The warning appears against a production-like multi-broker deployment.

## Testcontainers Troubleshooting

The integration suite starts disposable MongoDB, Kafka, and Elasticsearch
containers with dynamic host ports:

```sh
pnpm run test:integration
```

Common issues:

- Docker is not running or cannot mount the Docker socket.
- Existing local Compose containers consume too much disk, causing ES allocation
  failures.
- First-run image pulls take longer than normal.
- Kafka consumer group logs are noisy while the single-node test broker forms
  groups.

The suite disables Elasticsearch disk allocation thresholds only inside its
disposable test container. Runtime and production Elasticsearch behavior is not
changed.

For the full local test gate:

```sh
pnpm run test:ci
```

`pnpm run test` remains the fast default and does not run integration tests.
