# Message Management API — Production-Grade Implementation Plan

> **Context:** Greenfield repo (`message-management-api`, currently empty except `.git`). Goal: a production-grade message-management backend — NestJS + TypeScript, MongoDB (source of truth), Kafka (event backbone), Elasticsearch (full-text search) — built for correctness, reliability, operability, and maintainability. Executed primarily by Codex with Claude Code planning/reviewing; `docs/` is the shared project memory. This document is copied into `docs/implementation-plan.md` as the first implementation step.

## 1. Executive Summary

Build a message-management backend exposing three REST endpoints (create message, list conversation messages, search conversation messages) as one NestJS monorepo with **four runtimes**: an **API app** (HTTP, MongoDB reads/writes), an **outbox-publisher worker** (MongoDB outbox → Kafka), a **search-indexer worker** (Kafka → Elasticsearch), and a **maintenance CLI** (outbox inspection/re-drive, DLQ re-drive, ES reindex).

Message creation writes the `Message` and an `OutboxEvent` **atomically in one MongoDB transaction** — the request path never touches Kafka. The outbox publisher reliably delivers `message.created` v1 events keyed by `conversationId` (per-conversation ordering); the indexer consumes them idempotently into a **versioned ES index behind read/write aliases** using `message.id` as the document id, with bounded retries and a DLQ. Operational reliability is first-class: structured JSON logs with correlation IDs, liveness/readiness probes, graceful shutdown, Prometheus metrics, stuck-event detection, runbooks, and CI quality gates with real MongoDB/Kafka/Elasticsearch integration tests via Testcontainers.

## 2. Scope

**In scope**

- `POST /api/messages`, `GET /api/conversations/:conversationId/messages`, `GET /api/conversations/:conversationId/messages/search` (original API contract unchanged)
- Transactional outbox: Message + OutboxEvent in one MongoDB transaction; dedicated publisher worker with claim/lease, backoff retries, stuck-event detection, safe reprocessing
- Kafka: versioned topic, typed/versioned envelope, conversationId key, acks=-1 producer configuration, optional producer idempotence if stable, consumer group with bounded retry + DLQ, DLQ re-drive command
- Elasticsearch: versioned physical index (`messages-v1`) behind `messages-read`/`messages-write` aliases, explicit strict mapping, reindex/backfill CLI, documented mapping-migration strategy
- API-key security boundary (service-to-service), documented `senderId` trust model, JWT extension path documented
- Observability: nestjs-pino JSON logs, request/event correlation IDs, `/health/liveness` + `/health/readiness` per runtime, graceful shutdown, prom-client `/metrics`
- Testing: unit tests + real integration tests (Testcontainers: MongoDB replica set, Kafka, Elasticsearch) + fast API contract e2e tests
- CI (GitHub Actions): lint, unit, build, integration, Docker build, dependency audit; required-checks policy
- Docker Compose for the full local stack; multi-stage Dockerfile per runtime target
- `README.md`, `docs/` memory files, runbooks (`outbox`, `dlq-redrive`, `reindex-elasticsearch`, `local-debugging`), `docs/observability.md`, `docs/security.md`, `AGENTS.md`, `CLAUDE.md`

**Out of scope**

- Chat-product features: conversations/users as entities, message edit/delete, read receipts, real-time delivery (WebSockets)
- Kafka schema registry (typed envelope + versioned topics suffice at this event count; registry documented as the evolution path)
- Caching layer (no read pattern justifies it; revisit with data), multi-region/DR topology, Kubernetes manifests
- End-user identity/JWT issuance (auth boundary is service-level API keys; JWT documented as the user-facing extension)

## 3. Assumptions

- Local dev: Docker + Compose v2, Node.js ≥ 20; ports 3000, 27017, 9092/9094, 9200 free. CI runs on GitHub Actions Linux runners with Docker (Testcontainers-compatible).
- MongoDB runs as a **single-node replica set** locally and in tests — required for transactions; production would run a real replica set (assumption documented).
- Kafka single-node KRaft locally; production assumes ≥3 brokers, RF=3, `min.insync.replicas=2` — client code (`acks: -1`) is written for that and works unchanged locally.
- Elasticsearch single-node locally (security disabled, `replicas: 0`); production assumes a secured cluster — client config takes node URL + optional auth from env.
- Delivery guarantee is **at-least-once** end-to-end; idempotent indexing makes ES state convergent. No exactly-once semantics.
- Search is eventually consistent with writes (outbox poll interval + consumer lag + ES refresh); this is an accepted, documented property of the architecture.
- Callers are **trusted internal services** authenticating with API keys; `senderId` in the request body is trusted on that basis (see §13 for the full trust model).
- `timestamp` is server-generated; `conversationId`/`senderId` are opaque external identifiers with no referential checks.
- Codex implements; Claude Code plans/reviews. Both read `docs/` before working and keep it current.

## 4. Architecture Overview

```
                    ┌────────────────────────  api (NestJS app) ───────────────────────┐
 HTTP + x-api-key → │ Controller → Use-case service → MongoDB txn: messages + outbox   │
                    │                    reads: messages (list) / ES read alias (search)│
                    └───────────────────────────────────────────────────────────────────┘
 MongoDB (rs0):  messages, outbox_events
        │  poll + claim (lease)
        ▼
 outbox-publisher worker ── publish(key=conversationId, acks=-1) ──► Kafka
                                                       topic: messages.message-created.v1
        ┌──────────────────────────────────────────────────────────────────────┘
        ▼
 search-indexer worker (group: search-indexer) ── retry w/ backoff ──► ES write alias
        │ exhausted                                                     (doc _id = message.id)
        ▼
 messages.message-created.v1.dlq  ◄── cli: dlq:redrive ──► back to main topic
 cli: outbox:inspect | outbox:redrive | es:reindex
```

Why this fits:

- **Transactional outbox eliminates the dual-write problem.** The API commits Message + OutboxEvent atomically; Kafka can be down without losing events or failing writes. The request path has one dependency (MongoDB), which keeps latency and failure modes simple.
- **Separated runtimes isolate failure and scale independently.** An ES outage stalls the indexer, not the API; an indexing backlog never competes with request threads. One codebase (NestJS monorepo) keeps shared domain/infra code in `libs/` with a single build and test toolchain.
- **Ordering and idempotency are structural.** The supported guarantee is per-conversation ordering via Kafka key = `conversationId` (the publisher additionally dispatches in `_id` order for determinism, but global ordering is not a contract); ES doc id = `message.id` makes redelivery a no-op — at-least-once is safe everywhere.
- **Versioned index + aliases make search evolvable.** Mapping changes ship as `messages-v2` + `_reindex` + atomic alias swap, with zero write-path changes.
- **Ports and adapters** (TS interfaces + DI tokens for repository, event publisher, search index) keep use cases unit-testable and keep the layering honest without CQRS buses or event sourcing.

## 5. Recommended Folder Structure

NestJS monorepo (`nest-cli.json` with `apps/` + `libs/`, path aliases `@app/*`):

```
message-management-api/
├── apps/
│   ├── api/
│   │   └── src/
│   │       ├── main.ts                    # HTTP bootstrap: pipes, filter, body limit, shutdown hooks
│   │       ├── api.module.ts
│   │       ├── auth/                      # ApiKeyGuard (global), key store from config
│   │       ├── messages/
│   │       │   ├── messages.controller.ts             # POST /api/messages
│   │       │   ├── conversation-messages.controller.ts# GET list + GET search
│   │       │   └── dto/                   # create/list/search DTOs + response mappers
│   │       └── health/                    # liveness + readiness (mongo, es-read)
│   ├── outbox-publisher/
│   │   └── src/
│   │       ├── main.ts                    # headless app context + loop lifecycle
│   │       ├── outbox-publisher.module.ts
│   │       ├── publisher.service.ts       # claim → publish → mark; backoff; metrics
│   │       └── health/                    # liveness + readiness (mongo, kafka)
│   ├── search-indexer/
│   │   └── src/
│   │       ├── main.ts
│   │       ├── search-indexer.module.ts
│   │       ├── message-created.consumer.ts# eachMessage → index; retry; DLQ
│   │       └── health/                    # liveness + readiness (kafka, es-write)
│   └── cli/
│       └── src/                           # nest-commander
│           ├── main.ts
│           ├── outbox-inspect.command.ts  # counts, oldest pending age, failed list
│           ├── outbox-redrive.command.ts  # reset failed → pending (filters, dry-run)
│           ├── dlq-redrive.command.ts     # DLQ → main topic (limit, dry-run)
│           └── es-reindex.command.ts      # create vN, backfill/_reindex, alias swap
├── libs/
│   ├── domain/src/                        # message.ts, message-created.event.ts, ports/
│   ├── persistence/src/                   # message.schema.ts, outbox-event.schema.ts,
│   │                                      # mongo-message.repository.ts, outbox.repository.ts,
│   │                                      # transaction.helper.ts (withTransaction)
│   ├── application/src/                   # create-message.service.ts, list-messages.service.ts,
│   │                                      # search-messages.service.ts, cursor.ts
│   ├── messaging/src/                     # kafka.module.ts, kafka.constants.ts (topics/groups),
│   │                                      # producer.service.ts, consumer-runner.ts, dlq.producer.ts
│   ├── search/src/                        # es.module.ts, index-manager.service.ts (aliases/mappings),
│   │                                      # es-message-search.ts, mappings/messages-v1.ts
│   ├── config/src/                        # per-runtime Joi schemas + typed configuration
│   └── observability/src/                 # logger.module.ts (nestjs-pino), correlation middleware,
│                                          # metrics.module.ts (prom-client), health indicators
├── test/
│   ├── e2e/                               # fast API contract tests (memory replica set, fake ports)
│   └── integration/                       # Testcontainers: full pipeline specs (§18)
├── docs/
│   ├── implementation-plan.md  progress-log.md  handoff.md  decisions.md  api-examples.md
│   ├── observability.md        security.md
│   └── runbooks/
│       ├── outbox.md  dlq-redrive.md  reindex-elasticsearch.md  local-debugging.md
├── .github/workflows/ci.yml
├── docker-compose.yml
├── Dockerfile                             # multi-stage, one build → per-app targets
├── .env.example
├── AGENTS.md
├── CLAUDE.md
├── README.md
└── (optional, post-scaffold) .agents/skills/, .claude/skills/
```

Unit specs are colocated (`*.spec.ts` in `apps/` and `libs/`); `test/` holds e2e + integration suites only.

## 6. NestJS Module Breakdown

| Module                              | Runtime(s)                            | Responsibility                                                                                                                             |
| ----------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `ApiModule`                         | api                                   | Composition root for HTTP: controllers, guard, health                                                                                      |
| `AuthModule`                        | api                                   | Global `ApiKeyGuard`, key registry from config, constant-time comparison                                                                   |
| `MessagesModule` (api)              | api                                   | Controllers + DTOs; binds application services                                                                                             |
| `ApplicationModule` (lib)           | api                                   | `CreateMessageService` (txn: message + outbox), `ListMessagesService` (cursor), `SearchMessagesService`                                    |
| `DomainModule` (lib)                | all                                   | `Message` model, `MessageCreatedEvent` envelope, port interfaces + DI tokens                                                               |
| `PersistenceModule` (lib)           | api, outbox-publisher, cli            | Mongoose connection, schemas, repositories, `withTransaction` helper                                                                       |
| `MessagingModule` (lib)             | outbox-publisher, search-indexer, cli | kafkajs lifecycle, topic constants, producer, consumer runner, DLQ producer, topic-init (idempotent `createTopics`)                        |
| `SearchModule` (lib)                | api, search-indexer, cli              | ES client, `IndexManagerService` (create versioned index, manage aliases), `EsMessageSearch` (index via write alias, query via read alias) |
| `ConfigModule` (lib, global)        | all                                   | `.env` load + per-runtime Joi validation (fail fast), typed namespaces                                                                     |
| `ObservabilityModule` (lib, global) | all                                   | nestjs-pino logger, correlation-ID middleware/context, prom-client metrics + `/metrics`, Terminus health indicators                        |
| `OutboxPublisherModule`             | outbox-publisher                      | Poll/claim/publish/mark loop, backoff scheduling, stuck-event gauge                                                                        |
| `SearchIndexerModule`               | search-indexer                        | Consumer wiring: envelope validation → idempotent index → retry → DLQ                                                                      |
| `CliModule`                         | cli                                   | nest-commander commands (outbox/DLQ/reindex) reusing lib services                                                                          |

Dependency rule: `application` and workers depend on `domain/ports`; only `persistence`/`messaging`/`search` implement them. Controllers contain zero business logic.

## 7. Domain Model

```ts
type Message = {
  id: string; // Mongo ObjectId hex string
  conversationId: string;
  senderId: string;
  content: string;
  timestamp: Date; // server-set at creation
  metadata?: Record<string, unknown>;
};
```

Domain rules:

- `id` and `timestamp` are server-generated; clients never supply them.
- `content`: trimmed, non-empty after trim, max 5,000 chars.
- `conversationId` / `senderId`: trimmed, non-empty, max 128 chars, pattern `^[A-Za-z0-9_:.-]+$` (opaque external IDs; blocks control characters and operator abuse without guessing formats).
- `metadata`: optional plain JSON object (no top-level arrays/primitives), ≤ 10 KB serialized; stored and returned verbatim, never queried or indexed (`enabled: false` in ES) — keeps both mappings stable.
- Messages are immutable after creation (no update/delete in scope).
- **Trust rule:** `senderId` is caller-asserted and trusted only because callers are API-key-authenticated internal services (§13).

Supporting model — `OutboxEvent` (infrastructure-owned, §9): the durable intent record created in the same transaction as the Message.

## 8. DTOs and API Models

**`CreateMessageDto`** (POST body):

- `conversationId`, `senderId`: `@IsString @IsNotEmpty @MaxLength(128) @Matches(ID_PATTERN)`, `@Transform(trim)`
- `content`: `@IsString @IsNotEmpty @MaxLength(5000)`, `@Transform(trim)`
- `metadata?`: `@IsOptional @IsObject` + custom `@MaxJsonSize(10_240)` validator

**`ListMessagesQueryDto`**: `limit?` (`@Type(Number) @IsInt @Min(1) @Max(100)`, default 20) · `cursor?` (`@IsString`, opaque base64url; decode failure → 400) · `sortOrder?` (`@IsIn(['asc','desc'])`, default `desc`; sort field is always `timestamp`)

**`SearchMessagesQueryDto`**: `q` (`@IsString @IsNotEmpty @MaxLength(256)`, trimmed) · `page?` (`@IsInt @Min(1) @Max(100)`, default 1) · `limit?` (`@IsInt @Min(1) @Max(50)`, default 20)

`conversationId` path param validated with the same ID rules via a param DTO/pipe.

**Response models** (explicit mapper functions; no serialization magic):

```jsonc
// MessageResponse
{
  "id": "…",
  "conversationId": "…",
  "senderId": "…",
  "content": "…",
  "timestamp": "2026-07-03T09:00:00.000Z",
  "metadata": {},
}

// List:   { "data": MessageResponse[],
//            "pagination": { "limit": 20, "nextCursor": "…"|null, "hasMore": true, "sortOrder": "desc" } }
// Search: { "data": (MessageResponse & { "score": number })[],
//            "pagination": { "page": 1, "limit": 20, "total": 42, "totalPages": 3 } }
```

## 9. MongoDB Schema and Indexes

Database `message_management`, deployed as replica set (transactions requirement).

**Collection `messages`** — `versionKey: false`; `timestamp` set explicitly by `CreateMessageService`:

| Field            | Type             | Notes           |
| ---------------- | ---------------- | --------------- |
| `_id`            | ObjectId         | exposed as `id` |
| `conversationId` | String, required |                 |
| `senderId`       | String, required |                 |
| `content`        | String, required |                 |
| `timestamp`      | Date, required   |                 |
| `metadata`       | Mixed, optional  | opaque          |

Indexes:

1. `{ conversationId: 1, timestamp: -1, _id: -1 }` — serves the listing endpoint exactly (equality + sort + cursor range; no in-memory sort). The only secondary index on `messages`: no endpoint queries by `senderId`, and an unused index taxes every write (recorded in decisions.md).

**Collection `outbox_events`:**

| Field                        | Type                    | Notes                                                |
| ---------------------------- | ----------------------- | ---------------------------------------------------- |
| `_id`                        | ObjectId                | insertion-ordered — dispatch order                   |
| `eventId`                    | String (UUIDv4), unique | envelope id / tracing                                |
| `eventType` / `eventVersion` | String / Number         | `message.created` / `1`                              |
| `topic`                      | String                  | target topic                                         |
| `key`                        | String                  | Kafka key (= conversationId)                         |
| `payload`                    | Object                  | full event envelope (§11)                            |
| `status`                     | String enum             | `pending` \| `publishing` \| `published` \| `failed` |
| `attempts`                   | Number                  | publish attempts                                     |
| `nextAttemptAt`              | Date                    | backoff schedule                                     |
| `lockedBy` / `lockedAt`      | String / Date           | claim lease (crash-safe reclaim)                     |
| `lastError`                  | String, optional        | truncated last failure                               |
| `createdAt` / `publishedAt`  | Date                    |                                                      |

Indexes: 2. `{ status: 1, nextAttemptAt: 1, _id: 1 }` — the publisher poll query (`status: 'pending', nextAttemptAt ≤ now`, ordered by `_id`). 3. `{ eventId: 1 }` unique — integrity + lookup during ops. 4. TTL `{ publishedAt: 1 }`, `expireAfterSeconds: 7 days`, partial on `status: 'published'` — bounded collection growth without a cleanup job.

Index builds: schema-declared; `autoIndex` on in dev/test, **off in production** — README/runbook note that production runs `createIndexes` as a deploy step.

## 10. Elasticsearch Index Design

**Versioned physical index + aliases** (no dynamic mapping anywhere):

- Physical: `messages-v1`; aliases: **`messages-write`** (used by indexer + reindex backfill) and **`messages-read`** (used by search queries).
- `IndexManagerService` at indexer/api startup: if `messages-v1` missing → create with explicit mapping and bind both aliases (idempotent; safe under concurrent starts via ES's atomic create + alias actions).

```jsonc
{
  "mappings": {
    "dynamic": "strict",
    "properties": {
      "id": { "type": "keyword" },
      "conversationId": { "type": "keyword" },
      "senderId": { "type": "keyword" },
      "content": { "type": "text" },
      "timestamp": { "type": "date" },
      "metadata": { "type": "object", "enabled": false },
    },
  },
  "settings": { "number_of_shards": 1, "number_of_replicas": 0 },
} // local; prod overrides via env
```

Only these six explicitly mapped fields are ever sent to ES — the indexer maps the event payload through a projection function, so unexpected payload fields can never hit the index (`dynamic: strict` is the backstop).

- **Searchable:** `content` (text, standard analyzer). **Filter:** `conversationId` (non-scoring cached term filter). **Sort:** `_score` desc, `timestamp` desc tiebreak.
- **Query** (against `messages-read`): `bool { must: [match content (operator: and)], filter: [term conversationId] }`, `sort: [_score, timestamp desc]`, `from/size`, `track_total_hits: true`. `from/size` is safe here because page ≤ 100 × size ≤ 50 stays far below the 10k window (decision recorded; `search_after` is the documented escape hatch if limits ever rise).
- **Indexing** (against `messages-write`): `index` op with `_id = message.id` — full-document upsert, idempotent under redelivery.
- **Migration strategy** (runbook `reindex-elasticsearch.md`): mapping change ⇒ define `messages-v2` mapping in code → `cli es:reindex --to v2` creates the index, runs `_reindex` from v1 (or replays from MongoDB for lossy changes), verifies doc counts, then **atomically swaps both aliases** in one `update_aliases` call → old index kept for rollback, deleted after soak. Additive non-breaking fields may use `PUT _mapping` on the live index instead; the runbook states which path applies when.

## 11. Kafka Event Design

| Item           | Value                                                                                                                                                                                                      |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Topic          | `messages.message-created.v1` (breaking payload change ⇒ `.v2` topic; additive changes bump `eventVersion` in-envelope)                                                                                    |
| DLQ            | `messages.message-created.v1.dlq`                                                                                                                                                                          |
| Event          | `eventType: "message.created"`, `eventVersion: 1`                                                                                                                                                          |
| Key            | `conversationId` — per-conversation partition ordering                                                                                                                                                     |
| Partitions     | 3 locally; production sizes by throughput (key ensures order regardless of count)                                                                                                                          |
| Consumer group | `message-management-api.search-indexer`                                                                                                                                                                    |
| Client         | **kafkajs** wrapped in `MessagingModule` — the NestJS microservice Kafka transport hides per-message error control (manual retry, DLQ publish, pause/resume) that this design requires (decision recorded) |

**Envelope** (typed `MessageCreatedEvent`, also stored as the outbox `payload`):

```jsonc
{ "eventId": "uuid-v4", "eventType": "message.created", "eventVersion": 1,
  "occurredAt": "ISO-8601", "correlationId": "from originating request",
  "payload": { "id", "conversationId", "senderId", "content", "timestamp", "metadata" } }
```

**Producer path — transactional outbox (no Kafka in the API request path):**

1. `CreateMessageService` runs one MongoDB transaction. **Transaction rule:** both inserts — the `messages` document and the `outbox_events` document (`status: pending`) — use the **same Mongoose `ClientSession`**; every repository method on the write path accepts and passes the session explicitly (no session-less overloads on this path). If either insert fails, the whole transaction aborts and neither document persists. Commit ⇒ 201.
2. **Outbox publisher worker** loop (interval ~500 ms, batch ~50):
   - Claim: `findOneAndUpdate` batch — `{ status: 'pending', nextAttemptAt ≤ now }` (plus reclaim of `publishing` rows whose `lockedAt` exceeds the lease, covering publisher crashes) → set `status: 'publishing'`, `lockedBy: instanceId`, `lockedAt: now`; ordered by `_id` asc.
   - Publish sequentially in `_id` order with `acks: -1`; enable kafkajs `idempotent: true` only if it proves stable in local/CI (kafkajs documents it as experimental). **Correctness must not depend on producer idempotence** — outbox redelivery and consumer-side idempotency already handle duplicates.
   - **Marking safety:** every status transition on a claimed event (`published`, back to `pending`, `failed`) uses the update filter `{ _id, lockedBy: instanceId, status: 'publishing' }` — a worker whose lease was reclaimed after a race cannot modify another worker's row; a no-match result is logged and the event is left to its current owner.
   - On ack: `status: 'published'`, `publishedAt: now`. On failure: `attempts++`, `status: 'pending'`, `nextAttemptAt = now + backoff(attempts)` (exponential 1s→2s→…, cap 5 min, jitter); after `maxAttempts` (10): `status: 'failed'` + `lastError`. **Failed events are never auto-published** — they are terminal until an operator inspects them and explicitly resets selected events to `pending` via `outbox:redrive` (prevents silent infinite poison retries); visible via metrics and `outbox:inspect`.
   - **Ordering guarantee:** the externally supported guarantee is **per-conversation ordering** via Kafka key = `conversationId` — nothing stronger is promised. The publisher processes pending events in `_id` order for deterministic behavior (and runs as a single replica in Compose), but global cross-conversation ordering is not a contract. Consumers are idempotent regardless (crash redelivery); horizontal scaling via key-hash sharding is documented in `runbooks/outbox.md`.
   - Emits metrics: published/failed counters, `outbox_pending_count`, `outbox_oldest_pending_age_seconds` (stuck-event detection), publish latency histogram.
3. TTL cleanup of `published` rows (§9).

**Consumer path — search-indexer worker:**

- `eachMessage`: parse + validate envelope (unknown `eventType`/`eventVersion` → warn + count + skip; malformed JSON → DLQ directly), project to the six mapped fields, `indexMessage()` via write alias with `_id = message.id`.
- **Retry:** in-process, 5 attempts, exponential backoff (250 ms → 8 s, jitter), only for retryable ES errors (connection/timeout/429/5xx); non-retryable mapping errors (400) go straight to DLQ. Blocking `eachMessage` during retry is deliberate — it preserves partition (per-conversation) order.
- **DLQ:** after exhaustion, publish the original raw value + headers (`x-error-message`, `x-error-class`, `x-original-topic`, `x-original-partition`, `x-original-offset`, `x-failed-at`, `x-correlation-id`) to the DLQ topic, then commit and continue.
- **Re-drive:** `cli dlq:redrive [--limit N] [--dry-run]` — consumes the DLQ with a dedicated group, republishes original values to the main topic with original keys (ordering across the re-driven window is best-effort; safe because indexing is idempotent). Runbook `dlq-redrive.md` covers when/how plus verification queries.
- **Idempotency:** ES doc `_id = message.id` ⇒ duplicate delivery re-indexes an identical document. `eventId` is logged for duplicate tracing.
- **Consumer lag visibility:** expose a `kafka_consumer_lag` gauge (per topic/partition) if obtainable from the kafkajs admin API (`fetchOffsets` vs `fetchTopicOffsets`, sampled periodically); if that proves unreliable, at minimum `runbooks/local-debugging.md` documents lag inspection via `kafka-consumer-groups.sh --describe --group message-management-api.search-indexer`.
- **Delivery guarantees:** at-least-once everywhere (outbox retries can duplicate publishes; consumer commits after processing). No Kafka transactions/EOS — idempotent indexing makes them unnecessary complexity (decision recorded).

## 12. API Contract

Global prefix `api` (health/metrics excluded). JSON only; body limit 100 KB. All endpoints require `x-api-key` (§13); missing/invalid ⇒ `401` standard error shape.

### POST `/api/messages`

- **Body:** `CreateMessageDto` (§8); unknown fields rejected.
- **Behavior:** one MongoDB transaction (message + outbox event) → `201` with `MessageResponse`. Kafka/ES availability cannot fail this call.
- **Errors:** `400` validation matrix (missing/empty/oversized fields, bad metadata, unknown fields, malformed JSON) · `401` auth · `413` body too large · `500` transaction failure (generic shape; details logged with correlation ID).

### GET `/api/conversations/:conversationId/messages`

- **Query:** `limit` (1–100, default 20) · `cursor` (opaque) · `sortOrder` (`asc|desc`, default `desc`).
- **200:** list envelope. Unknown conversation ⇒ `data: []`, `hasMore: false` (conversations aren't a resource here — not 404).
- **Cursor:** base64url `{ o: sortOrder, t: timestamp, id: _id }` of the last returned doc; server queries `(timestamp,_id) < (t,id)` (or `>` for asc) with `limit+1` for `hasMore`. Cursor embedding a different `sortOrder` than the request ⇒ `400`.
- **Errors:** `400` invalid param/cursor · `401`.

### GET `/api/conversations/:conversationId/messages/search?q=term`

- **Query:** `q` (required, ≤256) · `page` (default 1, ≤100) · `limit` (default 20, ≤50).
- **200:** search envelope with per-hit `score` and `total`. Documented as eventually consistent with writes.
- **Errors:** `400` missing/empty `q` or bad paging · `401` · `503` Elasticsearch unavailable.

### Health & ops (all runtimes)

- `GET /health/liveness` — process up. `GET /health/readiness` — dependencies: api ⇒ Mongo + ES read alias; outbox-publisher ⇒ Mongo + Kafka; search-indexer ⇒ Kafka + ES write alias. `GET /metrics` — Prometheus format.
- **Readiness policy:** the API readiness check includes Elasticsearch because the deployed API contract includes the search endpoint — an ES outage therefore marks the API not-ready even though create/list still function. If a deployment wants partial availability (create/list routable during ES outages), split readiness into dependency-specific checks or expose degraded readiness semantics; the default production policy is **all required API dependencies must be ready**. Recorded in `docs/decisions.md` and `docs/observability.md`.

**Error shape (every error, via global filter):**

```jsonc
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": ["content should not be empty"], // string | string[]
  "path": "/api/messages",
  "timestamp": "ISO-8601",
  "correlationId": "…",
}
```

**Optional but recommended — OpenAPI:** generate Swagger docs from the DTOs with `@nestjs/swagger` (decorators on the existing DTOs, `/api/docs` in non-production) **if it does not distract from the core pipeline**. It is a should-have, not a blocker; README and `docs/api-examples.md` remain the canonical human-facing API examples.

## 13. Validation, Security, and Error Handling Strategy

- **Global `ValidationPipe`:** `whitelist: true`, `forbidNonWhitelisted: true`, `transform: true`, implicit conversion **off** (explicit `@Type()` on numerics — implicit coercion has surprising edge cases).
- **Sanitization:** trim transforms; ID pattern; length caps; metadata size cap. No HTML sanitization — content is data, never rendered by this service; output encoding is the presenting client's duty (decision recorded). Mongo operator injection prevented by DTO typing + strict Mongoose schemas.
- **Request limits:** `express.json({ limit: '100kb' })`.
- **Security boundary — API key auth (service-to-service):** global `ApiKeyGuard` on the api app; keys are SHA-256 hashes in config (`API_KEYS` env, comma-separated `name:hash` pairs — raw keys never stored); constant-time comparison; key name attached to the request context and logged for audit. Health and metrics endpoints are unauthenticated **only** for local development and private-network deployments; in public-facing deployments `/metrics` (and health) must be network-restricted or separately protected — stated explicitly in `docs/security.md` as a deployment-dependent decision.
- **`senderId` trust model (documented in `docs/security.md`):** this API serves **trusted internal services**, which assert `senderId` on behalf of their users — valid only under service-level auth. For a public user-facing deployment, `senderId` MUST be derived from the authenticated principal (JWT `sub` claim), and the body field removed/ignored. The JWT-guard extension path (Passport + JWKS) is documented, not built.
- **Global `AllExceptionsFilter`:** standard shape everywhere; unknown exceptions → 500 generic (stack logged, never leaked); ES connection/timeout on search → 503; correlation ID always included.
- **Secrets hygiene:** all secrets via env; `.env` gitignored; CI dependency audit (§CI in 18); no secrets in logs (pino redact paths for `x-api-key` header).
- **Fail-fast config:** per-runtime Joi validation throws at bootstrap.

## 14. Configuration and Environment Variables

`ConfigModule` (global) + typed namespaces; **per-runtime Joi schemas** so each app only requires what it uses. Topic/index/alias/group names are code constants (stable contracts), not env.

**Package manager:** use pnpm 11.1.1 for all installs and scripts. Commit `pnpm-lock.yaml`, keep `pnpm-workspace.yaml` at the repo root, and use pnpm commands in docs, scripts, and CI.

`.env.example`:

```dotenv
NODE_ENV=development
LOG_LEVEL=info                          # pino level
# --- api ---
PORT=3000
API_KEYS=local-dev:<sha256-of-dev-key>  # name:sha256hash, comma-separated
# --- mongodb (api, outbox-publisher, cli) ---
MONGODB_URI=mongodb://localhost:27017/message_management?replicaSet=rs0
# --- kafka (outbox-publisher, search-indexer, cli) ---
KAFKA_BROKERS=localhost:9094            # host listener; in-compose: kafka:9092
KAFKA_CLIENT_ID=message-management-api
# --- elasticsearch (api, search-indexer, cli) ---
ELASTICSEARCH_NODE=http://localhost:9200
# --- outbox publisher tuning (defaults exist; override as needed) ---
OUTBOX_POLL_INTERVAL_MS=500
OUTBOX_BATCH_SIZE=50
OUTBOX_MAX_ATTEMPTS=10
OUTBOX_LOCK_TIMEOUT_MS=30000
# --- worker health ports (compose healthchecks) ---
OUTBOX_HEALTH_PORT=3001
INDEXER_HEALTH_PORT=3002
```

Validation: URIs/ports checked; `KAFKA_BROKERS` comma-list; `API_KEYS` format-checked; defaults only for `NODE_ENV`, `LOG_LEVEL`, tuning values, and health ports.

**Dependency baseline** (locked up front — Codex must not substitute alternatives without a `decisions.md` entry):

- `@nestjs/config` for configuration · `joi` for environment validation
- `@nestjs/mongoose` + `mongoose` for MongoDB
- `kafkajs` for Kafka
- `@nestjs/elasticsearch` + `@elastic/elasticsearch` for Elasticsearch
- `nestjs-pino` + `pino-http` for structured logging · `prom-client` for metrics · `@nestjs/terminus` for health checks
- `class-validator` + `class-transformer` for DTO validation
- `nest-commander` for CLI commands
- `testcontainers` for integration tests · `mongodb-memory-server` for fast contract/e2e tests

## 15. Docker Compose Plan

| Service            | Image / build                                                                        | Ports                     | Health check                                                    |
| ------------------ | ------------------------------------------------------------------------------------ | ------------------------- | --------------------------------------------------------------- |
| `mongodb`          | `mongo:7`, `--replSet rs0` + one-shot `mongodb-init` service running `rs.initiate()` | 27017                     | `mongosh --eval "db.adminCommand('ping').ok && rs.status().ok"` |
| `kafka`            | `bitnami/kafka:3.7` (KRaft)                                                          | 9092 internal / 9094 host | `kafka-topics.sh --list`                                        |
| `elasticsearch`    | `elasticsearch:8.14.x` (`single-node`, security off, 512 MB heap)                    | 9200                      | `curl -f localhost:9200/_cluster/health`                        |
| `api`              | Dockerfile target `api`                                                              | 3000                      | `GET /health/readiness`                                         |
| `outbox-publisher` | Dockerfile target `outbox-publisher` (1 replica — ordering, §11)                     | 3001                      | `GET /health/readiness`                                         |
| `search-indexer`   | Dockerfile target `search-indexer`                                                   | 3002                      | `GET /health/readiness`                                         |

- **Dockerfile:** multi-stage `node:22-alpine` — deps → build all apps → one slim runtime stage per app target (distinct `CMD`), non-root user, `NODE_ENV=production`.
- **Startup order:** app services use `depends_on: condition: service_healthy` on their dependencies; additionally each worker retries connections at bootstrap (readiness stays red until connected) — orchestrator-agnostic startup, not compose-order-dependent.
- Kafka dual listeners (`kafka:9092` internal, `localhost:9094` host) so both compose services and host-run apps work. Topics (main + DLQ, 3 partitions) created idempotently by `MessagingModule` topic-init at worker startup — no reliance on auto-create.
- Named volumes for mongo/es. README documents both workflows: full `docker compose up --build`, or infra-only + `pnpm run start:dev <app>` per runtime.
- Graceful shutdown honored end-to-end: `enableShutdownHooks()` in every runtime — api stops accepting connections then closes Mongo/ES; publisher finishes the in-flight batch, releases claims, disconnects producer; indexer `consumer.disconnect()` (commits offsets) then closes ES. Compose `stop_grace_period: 30s`.

## 16. Documentation and Handoff Plan

`docs/` is the engineer-facing project memory; README is user-facing; `AGENTS.md`/`CLAUDE.md` never duplicate it.

| File                                | Content                                                                                                                                                                                                                                                                                  | Updated when                                                                                                                                                                                                                                                                                                         |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `implementation-plan.md`            | This plan                                                                                                                                                                                                                                                                                | Once at start; dated amendments on scope change                                                                                                                                                                                                                                                                      |
| `progress-log.md`                   | Append-only: step, what changed, files touched, validation performed, open issues, next action                                                                                                                                                                                           | After **every completed phase** of §20                                                                                                                                                                                                                                                                               |
| `handoff.md`                        | Complete / partial / remaining, known issues, run commands, build+test status, next step                                                                                                                                                                                                 | On stopping, switching context, or completing a milestone                                                                                                                                                                                                                                                            |
| `decisions.md`                      | ADR-lite: decision, context, reason, trade-off, alternatives                                                                                                                                                                                                                             | The moment a decision is made. Seed set: outbox over direct publish; kafkajs over Nest transport; single-publisher ordering; cursor pagination; no senderId index; from/size search paging; API-key auth + senderId trust model; aliases + versioned index; at-least-once + idempotency over EOS; TTL outbox cleanup |
| `api-examples.md`                   | curl + captured responses: all endpoints, health, metrics sample, full error matrix incl. 401                                                                                                                                                                                            | When endpoints change                                                                                                                                                                                                                                                                                                |
| `observability.md`                  | Log schema + correlation-ID flow (HTTP → outbox → Kafka headers → indexer), metrics catalog (names/types/labels, incl. `kafka_consumer_lag` or the documented tooling fallback), health/readiness semantics per runtime, alerting suggestions (stuck outbox age, DLQ rate, consumer lag) | When signals change                                                                                                                                                                                                                                                                                                  |
| `security.md`                       | Auth mechanism, key issuance/rotation, senderId trust model, JWT extension path, deployment-dependent exposure of health/`/metrics` (unauthenticated only on private networks), threat notes (injection, size limits, secrets)                                                           | When the boundary changes                                                                                                                                                                                                                                                                                            |
| `runbooks/outbox.md`                | How the outbox works; reading `outbox:inspect`; stuck/failed event diagnosis; `outbox:redrive` usage; scale-out (key-hash sharding) notes                                                                                                                                                | With outbox changes                                                                                                                                                                                                                                                                                                  |
| `runbooks/dlq-redrive.md`           | When messages land in DLQ; inspection; `dlq:redrive` procedure + verification; poison-message handling                                                                                                                                                                                   | With consumer/DLQ changes                                                                                                                                                                                                                                                                                            |
| `runbooks/reindex-elasticsearch.md` | Mapping-change decision tree (in-place vs new version); `es:reindex` procedure; alias swap; rollback; Mongo-replay backfill                                                                                                                                                              | With index/mapping changes                                                                                                                                                                                                                                                                                           |
| `runbooks/local-debugging.md`       | Compose bring-up, tailing per-service logs, console-consuming Kafka topics, inspecting Mongo/outbox and ES docs, common failures (replica set not initiated, listener misconfig, ES heap)                                                                                                | As gotchas are found                                                                                                                                                                                                                                                                                                 |

## 17. AI-Agent Instructions Plan

**`AGENTS.md` (Codex — implementer), ~1 page:** role (implement, refactor, fix tests, resolve PR comments); project summary; source of truth = `docs/` (read `implementation-plan.md` + `handoff.md` before any work); implementation rules (follow §20 phases and its **one-vertical-slice-at-a-time rule** — never build all four runtimes in parallel; respect layer boundaries — no logic in controllers, application depends on ports only, write-path repository methods take an explicit `ClientSession`, typed Kafka payloads, only mapped fields to ES; every new dependency or deviation gets a `decisions.md` entry); validation rules (lint + unit green before declaring any step done; integration suite green before merging pipeline-touching changes; never mark work complete with failing checks); documentation rules (append `progress-log.md` per phase; update `handoff.md` when stopping; runbooks updated with the code that changes them); PR-review rules (address every comment — fix or written justification; re-run affected suites; log resolutions).

**`CLAUDE.md` (Claude Code — planner/reviewer), ~1 page:** role (planning, architecture review, code review, risk analysis; not primary implementation); same summary + source-of-truth pointer; planning rules (plans land in `docs/implementation-plan.md`; production correctness and operability outrank expedience; flag both over- and under-engineering); code-review checklist (transaction correctness of message+outbox write; claim/lease safety; idempotency of consumer and reindex; alias usage — reads via `messages-read`, writes via `messages-write`, never physical index names in app code; DTO validation completeness; index/query alignment; error-shape and correlation-ID consistency; graceful-shutdown paths; test coverage of §18 minimums; docs/runbook freshness); review output format (**Blocking / Should fix / Nice to have**, each with `file:line` and a one-line why).

**Skills:** none during initial build — the two instruction files plus `docs/` carry the workflow. After the scaffold and core pipeline are merged, add at most two, only if the repo continues to evolve: `.agents/skills/implementation-slice` (Codex: pick next step from `handoff.md` → implement → validate → log) and `.claude/skills/code-review` (run the CLAUDE.md checklist against a diff, emit the standard format). Skills contain repeatable _workflows_ only — never project facts (docs/) and never broad behavior (root instruction files).

## 18. Testing Strategy and CI Quality Gates

**Unit tests (Jest, colocated; all I/O mocked at port interfaces):**

- `create-message.service.spec` — message + outbox event created through the transaction helper with the same session; envelope shape (type/version/key/correlationId); timestamp server-set; transaction abort ⇒ neither document persists (helper contract).
- DTO specs — full validation matrix via `validate()`.
- `cursor.spec` — round-trip, tampering, sortOrder mismatch.
- `list-messages.service.spec` — range query construction asc/desc, `limit+1` → `hasMore`/`nextCursor`.
- `publisher.service.spec` — claim → publish → mark-published; failure → backoff scheduling (`attempts`, `nextAttemptAt`); max-attempts → `failed` (and `failed` rows never re-claimed by the poll query); lease-expired reclaim; **marking uses the `{ _id, lockedBy, status: 'publishing' }` filter and a no-match is logged, not overwritten**; sequential in-order dispatch.
- `message-created.consumer.spec` — happy path projects only mapped fields, doc id = message.id; retryable vs non-retryable error classification; exhaustion → DLQ publish with headers; duplicate event → identical idempotent call; unknown version → skip + counter.
- `es-message-search.spec` — query DSL assembly, read-alias targeting, hit mapping (`score`, `total`).
- `index-manager.spec` — create-if-missing, alias binding, reindex + atomic swap sequencing (mocked client).

**API contract e2e (`test/e2e`, supertest):** Nest api app + `MongoMemoryReplSet` (transactions work), fake publisher/search ports via `overrideProvider`. Covers: 201 + shape + outbox row created atomically; full 400 matrix; 401 without/with-bad key; cursor pagination walk (25 docs, both orders, equal-timestamp tiebreak); invalid cursor 400; search mapping + 400 missing `q`. Fast, Docker-free — runs on every push.

**Integration tests (`test/integration`, Testcontainers — real MongoDB single-node replica set, Kafka, Elasticsearch; sequential Jest project, generous timeouts):**

1. **Atomic outbox write:** POST → message + outbox event exist; forced abort (fault-injected repository) ⇒ neither exists.
2. **Publisher emits:** pending outbox row → event on `messages.message-created.v1` with key = conversationId and valid envelope → row `published`.
3. **Publish failure is retryable:** broker unreachable (stopped container / bad port) → row stays `pending` with `attempts` incremented and future `nextAttemptAt`; broker restored → eventually `published`.
4. **Indexer indexes:** produce event → doc appears in ES via read alias with `_id = message.id`.
5. **Idempotency:** same event produced twice → one doc, no error, second delivery logged as re-index.
6. **DLQ:** poison event (fails non-retryably) → lands on DLQ with error headers; main-topic consumption continues.
7. **DLQ re-drive:** run `dlq:redrive` → message back on main topic → indexed.
8. **End-to-end search:** POST via HTTP (real api app wired to containers) → poll until searchable → search returns it, filtered by conversationId, other conversations excluded.
9. **Reindex:** seed docs → `es:reindex --to v2` → counts match, aliases point at v2, search still serves.

**CI (`.github/workflows/ci.yml`) — jobs, all required checks before merge:**

1. `lint` (eslint + prettier check) → 2. `unit` (+ coverage artifact) → 3. `build` (tsc all apps) → 4. `e2e` (contract suite) → 5. `integration` (Testcontainers; runs on the Docker-enabled runner) → 6. `docker-build` (all Dockerfile targets, no push) → 7. `audit` (`pnpm audit --prod --audit-level high`, non-blocking warn initially, ratcheted to blocking once baseline is clean — noted in decisions.md). Branch protection: 1–6 required.

## 19. README Structure

1. **Title + description** — what the service does, the three endpoints, one-line architecture
2. **Architecture** — diagram (§4 style): api / outbox-publisher / search-indexer / cli; a paragraph each on the outbox pattern and eventual consistency of search
3. **Tech stack** — versions
4. **Prerequisites** — Docker + Compose v2, Node ≥ 20
5. **Quick start** — `cp .env.example .env` (incl. generating a dev API key hash) → `docker compose up --build` → curl smoke sequence (create → list → search)
6. **Development mode** — infra-only compose + per-runtime `start:dev` commands
7. **API reference** — endpoints incl. auth header, params, example request/response, error shape; link `docs/api-examples.md`
8. **Operations** — health/readiness/metrics endpoints, CLI commands (`outbox:inspect|redrive`, `dlq:redrive`, `es:reindex`), links to runbooks
9. **Design decisions (summary)** — outbox, keyed partitioning, idempotent indexing, aliases/versioning, cursor pagination, auth trust model; link `docs/decisions.md` and `docs/security.md`
10. **Testing** — unit / e2e / integration commands, what each layer covers, Testcontainers requirements
11. **Project structure** — annotated apps/libs tree
12. **Production notes** — real Mongo replica set, secured ES, ≥3 Kafka brokers, index-build deploy step, publisher scaling constraint, JWT extension path

## 20. Step-by-Step Implementation Order

**Implementation rule — one vertical slice at a time.** The four-runtime monorepo must not be built breadth-first. Complete and validate each slice end-to-end before starting the next:

1. API writes Message + OutboxEvent transactionally.
2. Publisher drains OutboxEvent to Kafka.
3. Indexer consumes Kafka into Elasticsearch.
4. Search endpoint reads Elasticsearch.
5. CLI and runbooks harden operations.

The step order below follows this rule; a slice is "complete" only when its tests pass and it is verified against the local stack.

1. **Scaffold:** NestJS monorepo (`nest new` + convert to monorepo mode; apps `api`, `outbox-publisher`, `search-indexer`, `cli`; empty libs), strict TS, ESLint/Prettier → **initial commit**.
2. **AGENTS.md + CLAUDE.md** (§17) → commit.
3. **docs/ memory seed:** this plan → `docs/implementation-plan.md`; initialize `progress-log.md`, `handoff.md`, `decisions.md` (seed decisions), `api-examples.md` stub; create empty runbook/observability/security stubs with owners-note headers → commit.
4. **Infra:** Compose (mongo-rs + init, kafka, es + healthchecks), multi-target Dockerfile, `.env.example`; verify infra healthy.
5. **Foundations:** `config` lib (per-runtime Joi), `observability` lib (pino + correlation middleware, metrics module, health indicators); api app boots with health/readiness/metrics.
6. **Domain + persistence:** `domain` lib (model, event, ports), `persistence` lib (schemas incl. outbox + all §9 indexes, repositories, `withTransaction`), `MongoMemoryReplSet` test harness.
7. **API write/read path:** DTOs, `AuthModule` guard, `CreateMessageService` (transactional message+outbox), `ListMessagesService` + cursor, controllers, exception filter. Unit + contract e2e for everything so far green.
8. **Messaging lib + outbox publisher:** kafkajs lifecycle, topic-init, producer; publisher worker (claim/lease/backoff/metrics) as its own runtime with health. Verify event flow on the topic locally.
9. **Search lib + indexer:** ES module, `IndexManagerService` (v1 + aliases), `EsMessageSearch`; search-indexer worker (retry classification, DLQ). `SearchMessagesService` + search endpoint in api.
10. **CLI:** `outbox:inspect`, `outbox:redrive`, `dlq:redrive`, `es:reindex` (v2 mapping fixture for tests).
11. **Integration suite:** Testcontainers harness + the nine scenarios (§18); fix until green.
12. **CI:** `ci.yml` with all jobs; verify green on a PR; set required checks.
13. **Docs completion:** README, `api-examples.md` with captured responses, all four runbooks, `observability.md`, `security.md`, decisions top-up.
14. **Final validation:** clean `docker compose down -v && up --build`; full manual sequence — create → outbox published → indexed → searchable; kill/restart each worker mid-flow and confirm recovery; DLQ re-drive drill; all test suites + lint green.
15. **Final handoff:** `handoff.md` + closing `progress-log.md` entry; final commit.

Commit at each step boundary (conventional commits); `progress-log.md` entry per phase (§21).

## 21. Phased Execution Plan

Milestone-gated, not clock-gated. Each phase ends with its validation green, a commit, and a `progress-log.md` entry; `handoff.md` is updated at every phase boundary so work can pause/resume or change hands at any gate.

| Phase                                  | Steps (§20) | Exit criteria                                                                                              |
| -------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------- |
| **P1 — Repo & agent workspace**        | 1–3         | Monorepo builds; instruction files + docs seed committed                                                   |
| **P2 — Infra & foundations**           | 4–5         | Compose infra healthy; api boots with logs/metrics/health; env validation fails fast                       |
| **P3 — Core API (system of record)**   | 6–7         | POST (transactional outbox write) + paginated GET live behind auth; unit + contract e2e green              |
| **P4 — Event pipeline**                | 8–9         | create → outbox → Kafka → indexer → ES → search verified locally end-to-end; DLQ path exercised            |
| **P5 — Operability tooling**           | 10          | All four CLI commands work against the local stack                                                         |
| **P6 — Verification depth**            | 11–12       | Integration suite green locally and in CI; required checks configured                                      |
| **P7 — Documentation & ops readiness** | 13          | README quick start reproduces from clean clone; runbooks executable as written                             |
| **P8 — Final validation & handoff**    | 14–15       | Clean-slate stack passes the full manual drill incl. worker kill/restart and DLQ re-drive; handoff current |

Priority rule if anything must be re-sequenced: correctness of the write path (P3) and the event pipeline (P4) precede tooling and docs, but **no phase is dropped** — later phases are the production-readiness bar, not polish.

## 22. Risks and Trade-offs

- **Single outbox-publisher replica** is required for strict per-key ordering. Trade-off: publisher throughput ceiling and a brief publishing pause during restart (bounded by lease reclaim). Accepted: consumers are idempotent and Kafka keying re-establishes order at the partition level; key-hash sharding is the documented scale-out.
- **At-least-once, not exactly-once:** publisher crash between Kafka ack and mark-published duplicates an event. Accepted by design — idempotent ES indexing makes duplicates harmless; Kafka EOS/transactions would add operational complexity for no user-visible gain (recorded decision).
- **Search eventual consistency** (poll interval + consumer lag + ES refresh, typically ~1–2 s). Inherent to the architecture; surfaced in the API contract and README so it is a documented property, not a surprise.
- **Blocking in-process consumer retry** stalls one partition during ES degradation (bounded ≤ ~15 s before DLQ). Deliberate: preserves per-conversation ordering; non-blocking retry topics would sacrifice it.
- **Outbox polling adds constant MongoDB load.** Bounded by index #2 (§9) and tunable interval/batch; change streams are a documented alternative if poll load ever matters (adds resume-token state management — not justified yet).
- **API-key auth is service-level only.** Correct for the stated trust model; the JWT path for user-facing exposure is documented, and `senderId` trust is explicitly conditioned on it (§13).
- **Testcontainers integration suite is heavy** (multi-container, minutes in CI). Accepted: it is the only honest verification of transaction atomicity, publisher recovery, idempotency, and DLQ behavior; the fast unit + contract layers keep the inner loop quick.
- **Single physical ES index per version** (no time-based indices). Right for this data shape; the alias layer means introducing rollover later touches no application code.

## 23. What to Intentionally Skip

Deliberate exclusions with reasons — not shortcuts:

- **Chat-product features** (conversation/user entities, edit/delete, receipts, WebSockets) — outside the message-management mandate.
- **Kafka schema registry (Avro/Protobuf)** — one event type with a typed envelope and versioned topics; registry becomes worthwhile with multiple producers/consumers, documented as the evolution path.
- **CQRS buses / event sourcing / sagas** — the outbox + one consumer is the entire flow; these add indirection without new guarantees here.
- **Caching (Redis)** — reads are one indexed Mongo query and one ES query; no measured pressure to justify a cache and its invalidation burden.
- **Mongo change streams for the outbox** — polling on a covered index is simpler and sufficient; revisit at scale.
- **Kubernetes manifests / Helm** — Compose defines the runtime contract (per-runtime images, health checks, env); orchestrator packaging is a deployment concern beyond this repo's scope.
- **Distributed tracing backend (OTel collector/Jaeger)** — correlation IDs propagate end-to-end (HTTP → outbox → Kafka headers → indexer logs) and the design is metrics/tracing-ready; wiring an OTel SDK is a documented next step in `observability.md`.
- **Rate limiting / WAF** — belongs at the gateway for service-to-service APIs; noted in `security.md`.
- **DLQ re-drive UI / automated re-drive** — CLI + runbook is the correct first operational tool; automation without human judgment on poison messages is a hazard.
- **Repo agent skills during initial build** (§17).

## 24. Final Submission Checklist

- [x] Clean `.env` from example → `docker compose down -v` + `docker compose up -d mongodb mongodb-init kafka elasticsearch` → infra healthy; API, outbox-publisher, and search-indexer readiness green; Docker targets build
- [x] POST /api/messages (valid key) → 201; message **and** outbox event in MongoDB; fault-injection test proves atomicity
- [x] Outbox publisher emits to `messages.message-created.v1` keyed by conversationId; row transitions pending → published (marking verified against lock owner); Kafka-down window leaves rows retryable and they drain on recovery; max-attempts events become `failed` and stay terminal until `outbox:redrive`
- [x] Indexer writes ES doc via `messages-write` alias with `_id = message.id`; duplicate delivery proven idempotent; poison message lands in DLQ with error headers; `dlq:redrive` returns it and it indexes
- [x] GET messages: cursor walk, asc/desc, stable equal-timestamp tiebreak; invalid cursor → 400
- [x] Search: term found, conversation-filtered, other conversations excluded, `score`/`total` present; ES-down → 503 on search while POST still succeeds
- [x] `es:reindex` to v2 fixture: counts verified, atomic alias swap, search uninterrupted, rollback path documented
- [x] Auth: missing/invalid `x-api-key` → 401 standard shape; valid key logged by name; no secrets in logs (redaction verified)
- [x] All error responses use the standard shape with correlationId; correlation ID traceable HTTP → outbox → Kafka header → indexer log
- [x] `/health/liveness`, `/health/readiness`, `/metrics` correct per runtime; graceful shutdown drill (SIGTERM each runtime) loses no events
- [x] Lint, unit, contract e2e, integration suites green locally **and** in CI; Docker builds green; required checks configured; audit job running
- [x] `outbox_oldest_pending_age_seconds` and DLQ counters observable; `outbox:inspect` reflects reality
- [x] README quick start reproduces verbatim; `docs/api-examples.md` has real captured responses incl. error matrix
- [x] All docs current: decisions.md covers every §22 trade-off; four runbooks executable as written; observability.md matches emitted signals; security.md states the senderId trust model
- [x] AGENTS.md + CLAUDE.md ≤ ~1 page each, pointing at docs/ (no plan duplication)
- [x] No secrets committed; `.env` gitignored; clean conventional-commit history at §20 boundaries; `handoff.md` reflects final state
