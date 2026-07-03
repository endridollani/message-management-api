# Reindex Elasticsearch Runbook

Application search reads only through `messages-read`. Application indexing
writes only through `messages-write`. Physical indices are versioned, such as
`messages-v1` and `messages-v2`.

## Current Index Contract

- Physical index: `messages-v1`
- Read alias: `messages-read`
- Write alias: `messages-write`
- Mapping: `dynamic: strict`
- Indexed fields only: `id`, `conversationId`, `senderId`, `content`,
  `timestamp`, `metadata`

`IndexManagerService` creates `messages-v1` and missing aliases on startup, but
it does not move existing aliases. Operator-controlled alias swaps are therefore
preserved across runtime restarts.

## Verify Bootstrap

Start Elasticsearch and a runtime that imports the search module:

```sh
docker compose up -d elasticsearch
pnpm run start:search-indexer
```

Verify aliases and mapping:

```sh
curl -s 'http://localhost:9200/_alias/messages-read?pretty'
curl -s 'http://localhost:9200/_alias/messages-write?pretty'
curl -s 'http://localhost:9200/messages-v1/_mapping?pretty'
```

## Preview Reindex

```sh
pnpm run start:cli -- es:reindex --to v2 --dry-run
```

The command accepts `--to v2`, `--to 2`, or `--to messages-v2`. Without `--to`,
it chooses the next version after the current `messages-read` alias target.
Without `--confirm`, the command does not create an index or swap aliases.

## Apply Reindex And Alias Swap

```sh
pnpm run start:cli -- es:reindex --to v2 --confirm
```

The command:

1. Resolves the current `messages-read` and `messages-write` alias targets.
2. Creates the target physical index, for example `messages-v2`.
3. Runs Elasticsearch `_reindex` from `messages-read` into the target.
4. Refreshes and verifies source/target document counts.
5. Atomically moves both `messages-read` and `messages-write` to the target.
6. Leaves the old index in place for rollback.

The current command uses the v1 mapping definition as the target fixture until a
future mapping change adds a new mapping file. It fails if the target index
already exists so partial migrations can be inspected deliberately.

## When To Use PUT Mapping Instead

Additive non-breaking field additions may use `PUT _mapping` on the live index
when Elasticsearch supports the change safely. Breaking or uncertain mapping
changes should use a new versioned index and this reindex path.

## Rollback

Because the previous physical index remains in place, rollback is an alias-only
operation. Inspect current aliases:

```sh
curl -s 'http://localhost:9200/_alias/messages-read?pretty'
curl -s 'http://localhost:9200/_alias/messages-write?pretty'
```

Move both aliases back to the old index atomically. Replace `<old-index>` with
the previous physical index, such as `messages-v1`, and `<current-index>` with
the new one, such as `messages-v2`:

```sh
curl -s -X POST 'http://localhost:9200/_aliases' \
  -H 'Content-Type: application/json' \
  -d '{
    "actions": [
      { "remove": { "index": "<current-index>", "alias": "messages-read" } },
      { "remove": { "index": "<current-index>", "alias": "messages-write" } },
      { "add": { "index": "<old-index>", "alias": "messages-read" } },
      { "add": { "index": "<old-index>", "alias": "messages-write", "is_write_index": true } }
    ]
  }'
```

Verify:

```sh
curl -s 'http://localhost:9200/_alias/messages-read?pretty'
curl -s 'http://localhost:9200/_alias/messages-write?pretty'
curl -s 'http://localhost:3000/health/readiness'
```

Do not delete the previous index until the new mapping has soaked and rollback
is no longer required.

## Troubleshooting

- Target index exists: inspect it and delete it only if it is a failed attempt
  you intend to discard.
- Count mismatch: do not swap aliases manually; inspect `_reindex` failures and
  source/target queries.
- Red/yellow local shards: check Docker disk watermarks in
  [local-debugging.md](/Users/apple/Desktop/message-management-api/docs/runbooks/local-debugging.md).
