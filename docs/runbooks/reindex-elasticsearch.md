# Reindex Elasticsearch Runbook

## Current Status

P4B implements the initial `messages-v1` index definition and startup creation
through `IndexManagerService`. P5 adds `es:reindex`, which creates a target
versioned index, reindexes from `messages-read`, verifies counts, atomically
swaps aliases, and keeps the previous index for rollback.

## Implemented Index Contract

- Physical index: `messages-v1`
- Read alias: `messages-read`
- Write alias: `messages-write`
- Mapping: `dynamic: strict`
- Indexed fields only: `id`, `conversationId`, `senderId`, `content`,
  `timestamp`, `metadata`

Application search code reads only through `messages-read`. Application indexing
code writes only through `messages-write`. Physical index names are limited to the
index manager and mapping infrastructure.

## Bootstrap Verification

Start Elasticsearch and any runtime importing `SearchModule`:

```bash
docker compose up -d elasticsearch
pnpm run start:search-indexer
```

Then verify aliases:

```bash
curl -s 'http://localhost:9200/_alias/messages-read?pretty'
curl -s 'http://localhost:9200/_alias/messages-write?pretty'
```

Verify the strict mapping:

```bash
curl -s 'http://localhost:9200/messages-v1/_mapping?pretty'
```

## Mapping Changes

Additive non-breaking field additions may use `PUT _mapping` on the live index
when Elasticsearch supports the change safely. Breaking or uncertain mapping
changes should use a new versioned physical index.

Preview the migration:

```bash
ELASTICSEARCH_NODE='http://localhost:9200' \
MONGODB_URI='mongodb://localhost:27017/message_management?replicaSet=rs0&directConnection=true' \
KAFKA_BROKERS='localhost:9094' \
pnpm run start:cli -- es:reindex --to v2 --dry-run
```

Apply the migration:

```bash
ELASTICSEARCH_NODE='http://localhost:9200' \
MONGODB_URI='mongodb://localhost:27017/message_management?replicaSet=rs0&directConnection=true' \
KAFKA_BROKERS='localhost:9094' \
pnpm run start:cli -- es:reindex --to v2 --confirm
```

The command accepts `--to v2`, `--to 2`, or `--to messages-v2`. Without `--to`,
it picks the next version after the current `messages-read` alias target. Without
`--confirm`, the command is a dry-run and does not create an index or swap
aliases.

Migration path:

1. Add a new versioned mapping, for example `messages-v2`.
2. Create the new physical index.
3. Backfill from the current `messages-read` alias with Elasticsearch `_reindex`.
4. Verify source and target document counts.
5. Atomically swap `messages-read` and `messages-write` to the target index.
6. Keep the old index for rollback during a soak window.

The P5 command uses the current v1 mapping definition as the target fixture until
a future mapping change adds a new mapping file. It fails if the target index
already exists so an operator can inspect and clean up partial migrations
deliberately.

## Rollback

Because the old physical index remains in place, rollback is an alias-only
operation. Inspect the current aliases and then move both aliases back to the old
index in one `update_aliases` request:

```bash
curl -s 'http://localhost:9200/_alias/messages-read?pretty'
curl -s 'http://localhost:9200/_alias/messages-write?pretty'
```

Do not delete the previous index until the new mapping has soaked and rollback is
no longer required.
