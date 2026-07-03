# Reindex Elasticsearch Runbook

## Current Status

P4B implements the initial `messages-v1` index definition and idempotent startup
creation through `IndexManagerService`. The `es:reindex` CLI command and mapping
version migration workflow are still pending.

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

## Future Mapping Changes

Until `es:reindex` is implemented, do not perform ad hoc alias swaps from this repo.
The intended migration path remains:

1. Add a new versioned mapping, for example `messages-v2`.
2. Create the new physical index.
3. Backfill from MongoDB or use Elasticsearch `_reindex` when safe.
4. Verify counts and sample search results.
5. Atomically swap `messages-read` and `messages-write`.
6. Keep the old index for rollback during a soak window.
