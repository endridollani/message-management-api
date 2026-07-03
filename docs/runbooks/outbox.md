# Outbox Runbook

## Runtime

Start local dependencies:

```sh
pnpm install --frozen-lockfile
docker compose up -d mongodb mongodb-init kafka
```

Start the publisher:

```sh
MONGODB_URI='mongodb://localhost:27017/message_management?replicaSet=rs0&directConnection=true' \
KAFKA_BROKERS='localhost:9094' \
KAFKA_CLIENT_ID='message-management-api' \
pnpm run start:outbox-publisher
```

Operational endpoints:

- `GET http://localhost:3001/health/liveness`
- `GET http://localhost:3001/health/readiness`
- `GET http://localhost:3001/metrics`

## Lifecycle

- `pending`: created by the API transaction or scheduled for retry. The publisher
  only claims pending rows whose `nextAttemptAt` is due.
- `publishing`: claimed by one publisher instance. The row has `lockedBy` and
  `lockedAt`.
- `published`: Kafka ack succeeded and the worker marked the row published.
- `failed`: max attempts were exhausted. Failed rows are terminal and are never
  auto-published.

The publisher also reclaims expired `publishing` rows when `lockedAt` is older
than `OUTBOX_LOCK_TIMEOUT_MS`. Every transition out of `publishing` uses this
filter:

```js
{ _id, lockedBy: instanceId, status: 'publishing' }
```

If that update matches zero rows, the worker logs a warning and leaves the row to
its current owner/state.

## Retry Behavior

On publish failure, attempts are incremented and the row is returned to `pending`
with exponential backoff and jitter:

- base delay starts at 1 second
- delay doubles per attempt
- delay caps at 5 minutes
- jitter is +/-20 percent

`OUTBOX_MAX_ATTEMPTS` defaults to `10`. Once exhausted, the row is marked
`failed`; there is no automatic redrive in P4A.

## Metrics To Watch

- `message_management_outbox_pending_count`
- `message_management_outbox_oldest_pending_age_seconds`
- `message_management_outbox_events_published_total`
- `message_management_outbox_events_failed_total`
- `message_management_outbox_publish_duration_seconds`

Investigate if oldest pending age grows continuously, failed events increase, or
readiness fails on MongoDB/Kafka.

## Manual Inspection

Pending rows:

```sh
docker compose exec mongodb mongosh --quiet message_management --eval \
  "db.outbox_events.find({ status: 'pending' }).sort({ _id: 1 }).limit(20).toArray()"
```

Failed rows:

```sh
docker compose exec mongodb mongosh --quiet message_management --eval \
  "db.outbox_events.find({ status: 'failed' }).sort({ nextAttemptAt: -1 }).limit(20).toArray()"
```

Kafka topic contents can be inspected with the broker container:

```sh
docker compose exec kafka /opt/bitnami/kafka/bin/kafka-console-consumer.sh \
  --bootstrap-server localhost:9092 \
  --topic messages.message-created.v1 \
  --from-beginning \
  --max-messages 10
```

## Redrive

CLI redrive is not implemented in P4A. Until the CLI slice lands, redrive is a
manual operator action: inspect failed rows first, then reset selected known-safe
rows to `pending` with a future `nextAttemptAt` and clear lock fields. Do not
bulk-reset all failed rows.

## Scale-Out

The default deployment remains one publisher replica. Kafka keying preserves
per-conversation order once messages reach Kafka, but multiple uncoordinated
publisher replicas can race across conversations and increase duplicate
publishes. If throughput requires scale-out, use explicit key-hash sharding so
each outbox row is claimable by exactly one shard.
