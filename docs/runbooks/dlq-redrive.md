# DLQ Redrive Runbook

## Current Status

The search-indexer publishes poison records to
`messages.message-created.v1.dlq`. The maintenance CLI can redrive a bounded DLQ
window back to `messages.message-created.v1` after the poison cause has been
fixed or judged safe.

## DLQ Entry Causes

- Malformed Kafka message value, including empty values and invalid JSON.
- Invalid `message.created` v1 envelopes or payload shapes.
- Non-retryable Elasticsearch indexing failures, such as mapping errors.
- Retryable Elasticsearch failures that exhaust the bounded in-process retry
  budget.

Unsupported event type/version messages are skipped and counted, not sent to the
DLQ.

## DLQ Headers

DLQ messages preserve the original raw Kafka value and key. The indexer adds:

- `x-error-message`
- `x-error-class`
- `x-original-topic`
- `x-original-partition`
- `x-original-offset`
- `x-failed-at`
- `x-correlation-id` when the original event envelope was valid enough to read it

## Inspect Locally

```bash
docker compose exec kafka kafka-console-consumer.sh \
  --bootstrap-server kafka:9092 \
  --topic messages.message-created.v1.dlq \
  --from-beginning \
  --property print.key=true \
  --property print.headers=true \
  --max-messages 10
```

## Redrive

Preview first:

```bash
KAFKA_BROKERS='localhost:9094' \
MONGODB_URI='mongodb://localhost:27017/message_management?replicaSet=rs0&directConnection=true' \
ELASTICSEARCH_NODE='http://localhost:9200' \
pnpm run start:cli -- dlq:redrive --dry-run --limit 10
```

Apply a bounded redrive:

```bash
KAFKA_BROKERS='localhost:9094' \
MONGODB_URI='mongodb://localhost:27017/message_management?replicaSet=rs0&directConnection=true' \
ELASTICSEARCH_NODE='http://localhost:9200' \
pnpm run start:cli -- dlq:redrive --limit 10 --confirm
```

Options:

- `--limit N`: maximum DLQ records to inspect or redrive; default `100`.
- `--idle-timeout-ms N`: stop after no DLQ records arrive for this long; default
  `5000`.
- `--dry-run`: consume without republishing or committing offsets.
- `--confirm`: republish and commit offsets after each successful publish.

The command uses the dedicated consumer group
`message-management-api.cli.dlq-redrive`, subscribes from the beginning for the
first run, republishes each original DLQ value to
`messages.message-created.v1`, and preserves the original Kafka key when present.
Dry-runs do not republish and do not commit offsets.

Ordering across a redriven DLQ window is best-effort. That is acceptable for this
pipeline because Elasticsearch indexing is idempotent by `message.id`; duplicate
or delayed redelivery converges on the same document.

## Verification

After a future redrive, verify that the target document exists through the read
alias:

```bash
curl -s 'http://localhost:9200/messages-read/_doc/<message-id>?pretty'
```
