# DLQ Redrive Runbook

## Current Status

P4B implements DLQ publishing from the search-indexer to
`messages.message-created.v1.dlq`. The `dlq:redrive` CLI command is still pending,
so redrive is not yet an executable repo command.

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

CLI redrive remains pending. Until `dlq:redrive` exists, do not bulk-republish DLQ
records manually unless the poison cause has been fixed and ordering implications
are understood. Indexing is idempotent by message id, but redriven ordering across
a DLQ window is best effort.

## Verification

After a future redrive, verify that the target document exists through the read
alias:

```bash
curl -s 'http://localhost:9200/messages-read/_doc/<message-id>?pretty'
```
