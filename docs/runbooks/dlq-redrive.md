# DLQ Redrive Runbook

The search-indexer publishes poison records to
`messages.message-created.v1.dlq`. Use the CLI to inspect or redrive a bounded
DLQ window back to `messages.message-created.v1` after the cause is fixed or the
record is judged safe.

## DLQ Entry Causes

- Empty Kafka values or invalid JSON.
- Invalid `message.created` v1 envelopes or payload shapes.
- Non-retryable Elasticsearch indexing failures, such as mapping errors.
- Retryable Elasticsearch failures that exhaust the indexer's bounded retry
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

```sh
docker compose exec kafka /opt/bitnami/kafka/bin/kafka-console-consumer.sh \
  --bootstrap-server localhost:9092 \
  --topic messages.message-created.v1.dlq \
  --from-beginning \
  --property print.key=true \
  --property print.headers=true \
  --max-messages 10
```

Check search-indexer DLQ metrics:

```sh
curl -s 'http://localhost:3002/metrics' | grep 'message_management_search_indexer_messages_dlq_total'
```

## Redrive

Preview first:

```sh
pnpm run start:cli -- dlq:redrive --dry-run --limit 10 --idle-timeout-ms 5000
```

Apply a bounded redrive:

```sh
pnpm run start:cli -- dlq:redrive --limit 10 --confirm
```

Options:

- `--limit N`: maximum DLQ records to inspect or redrive; default `100`.
- `--idle-timeout-ms N`: stop after no DLQ records arrive for this long; default
  `5000`.
- `--dry-run`: consume without republishing or committing offsets.
- `--confirm`: republish and commit offsets after each successful publish.

The command uses consumer group `message-management-api.cli.dlq-redrive`,
subscribes from the beginning for the first run, republishes each original DLQ
value to `messages.message-created.v1`, and preserves the original Kafka key.
Dry-runs do not republish and do not commit offsets.

Ordering across a redriven DLQ window is best-effort. That is acceptable for this
pipeline because Elasticsearch indexing is idempotent by `message.id`; duplicate
or delayed redelivery converges on the same document.

## Poison-Message Handling

Do not bulk-confirm a DLQ redrive until the poison cause is understood.

- If the value is malformed JSON or has an invalid envelope, fix the producer or
  drop/archive the DLQ record outside this CLI. Republishing the same invalid
  value will send it back to the DLQ.
- If the error is an Elasticsearch mapping error, deploy the mapping/code fix or
  reindex to a compatible mapping before redrive.
- If the error was transient ES/Kafka unavailability, confirm readiness and then
  redrive a small batch first.
- If repeated redrive returns the same record to the DLQ, stop and inspect the
  raw value and `x-error-*` headers.

## Verification

Verify the record was consumed from the DLQ group:

```sh
docker compose exec kafka /opt/bitnami/kafka/bin/kafka-consumer-groups.sh \
  --bootstrap-server localhost:9092 \
  --describe \
  --group message-management-api.cli.dlq-redrive
```

Verify the target document exists through the read alias:

```sh
curl -s 'http://localhost:9200/messages-read/_doc/<message-id>?pretty'
```

Verify the search-indexer main group is not stuck:

```sh
docker compose exec kafka /opt/bitnami/kafka/bin/kafka-consumer-groups.sh \
  --bootstrap-server localhost:9092 \
  --describe \
  --group message-management-api.search-indexer
```
