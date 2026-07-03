# Outbox Runbook

The API writes `messages` and `outbox_events` in one MongoDB transaction. The
outbox-publisher runtime claims due outbox rows, publishes them to Kafka, and
marks them complete only after Kafka acknowledges the send.

## Start Locally

```sh
pnpm install --frozen-lockfile
docker compose up -d mongodb mongodb-init kafka
pnpm run start:outbox-publisher
```

Host-run defaults come from `.env`. If exporting manually:

```sh
export MONGODB_URI='mongodb://localhost:27017/message_management?replicaSet=rs0&directConnection=true'
export KAFKA_BROKERS='localhost:9094'
export KAFKA_CLIENT_ID='message-management-api'
```

Operational endpoints:

- `GET http://localhost:3001/health/liveness`
- `GET http://localhost:3001/health/readiness`
- `GET http://localhost:3001/metrics`

## Lifecycle

- `pending`: created by the API transaction or scheduled for retry. The publisher
  only claims pending rows whose `nextAttemptAt` is due.
- `publishing`: claimed by one publisher instance with `lockedBy` and `lockedAt`.
- `published`: Kafka ack succeeded and the row was marked published.
- `failed`: max attempts were exhausted. Failed rows are terminal until an
  operator explicitly redrives them.

The publisher also reclaims expired `publishing` rows when `lockedAt` is older
than `OUTBOX_LOCK_TIMEOUT_MS`. Every transition out of `publishing` uses this
lock-owner-safe filter:

```js
{ _id, lockedBy: instanceId, status: 'publishing' }
```

If the update matches zero rows, the worker logs a warning and leaves the row to
its current owner/state.

## Retry And Terminal Failure

On publish failure, the row returns to `pending`, `attempts` increments, and
`nextAttemptAt` is scheduled with exponential backoff and jitter:

- base delay starts at 1 second
- delay doubles per attempt
- delay caps at 5 minutes
- jitter is +/-20 percent

`OUTBOX_MAX_ATTEMPTS` defaults to `10`. After that, the row is marked `failed`.
Failed rows are never auto-published; this prevents silent infinite retries of a
poison event or a permanently invalid broker/topic state.

## Metrics To Watch

- `message_management_outbox_pending_count`
- `message_management_outbox_oldest_pending_age_seconds`
- `message_management_outbox_events_published_total`
- `message_management_outbox_events_failed_total`
- `message_management_outbox_publish_duration_seconds`

Investigate when oldest pending age grows continuously, failed events increase,
or readiness fails on MongoDB/Kafka.

## Inspect

Preferred CLI inspection:

```sh
pnpm run start:cli -- outbox:inspect
pnpm run start:cli -- outbox:inspect --failed-limit 25
```

Direct MongoDB inspection:

```sh
docker compose exec mongodb mongosh --quiet message_management --eval \
  "db.outbox_events.aggregate([{ \$group: { _id: '\$status', count: { \$sum: 1 } } }]).toArray()"

docker compose exec mongodb mongosh --quiet message_management --eval \
  "db.outbox_events.find({ status: 'pending' }).sort({ nextAttemptAt: 1, _id: 1 }).limit(20).toArray()"

docker compose exec mongodb mongosh --quiet message_management --eval \
  "db.outbox_events.find({ status: 'failed' }).sort({ nextAttemptAt: 1, _id: 1 }).limit(20).toArray()"
```

Kafka topic inspection:

```sh
docker compose exec kafka /opt/bitnami/kafka/bin/kafka-console-consumer.sh \
  --bootstrap-server localhost:9092 \
  --topic messages.message-created.v1 \
  --from-beginning \
  --property print.key=true \
  --max-messages 10
```

## Redrive Failed Rows

Preview first:

```sh
pnpm run start:cli -- outbox:redrive --dry-run
pnpm run start:cli -- outbox:redrive --event-id <event-id> --dry-run
```

Apply only after the failure cause is understood:

```sh
pnpm run start:cli -- outbox:redrive --event-id <event-id> --confirm
pnpm run start:cli -- outbox:redrive --limit 10 --confirm
```

Supported selectors:

- `--event-id <csv>`: one or more outbox `eventId` values.
- `--id <csv>`: one or more MongoDB outbox `_id` values.
- `--limit N`: oldest failed rows first.

Without `--confirm`, the command is a dry-run. With `--confirm` and no explicit
ID selector, pass `--limit N`; this prevents accidental unbounded bulk redrive.
The command only matches `status: failed`, resets selected rows to `pending`,
sets `attempts` to `0`, sets `nextAttemptAt` to now, and clears lock/error
fields. It never touches `published` rows.

## Stuck Event Diagnosis

1. Check publisher readiness:

   ```sh
   curl -s 'http://localhost:3001/health/readiness'
   ```

2. Inspect oldest pending rows and `nextAttemptAt`:

   ```sh
   pnpm run start:cli -- outbox:inspect --failed-limit 10
   ```

3. Confirm Kafka is reachable and the main topic exists:

   ```sh
   docker compose exec kafka /opt/bitnami/kafka/bin/kafka-topics.sh \
     --bootstrap-server localhost:9092 \
     --describe \
     --topic messages.message-created.v1
   ```

4. Check for expired `publishing` rows. They should be reclaimed after
   `OUTBOX_LOCK_TIMEOUT_MS`:

   ```sh
   docker compose exec mongodb mongosh --quiet message_management --eval \
     "db.outbox_events.find({ status: 'publishing' }).sort({ lockedAt: 1 }).limit(20).toArray()"
   ```

5. Review publisher logs for lock-owner-safe no-match warnings, publish errors,
   or repeated retry scheduling.

## Scale-Out

The default deployment remains one publisher replica. Kafka keying gives
per-conversation partition affinity. Strict per-conversation ordering is not
guaranteed across publish retries, and multiple uncoordinated publisher replicas
can race and increase duplicate publishes. If throughput requires scale-out, use
explicit key-hash sharding so each outbox row is claimable by exactly one shard.
