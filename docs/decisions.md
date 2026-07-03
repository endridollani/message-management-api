# Decisions

This file is the ADR-lite log for durable technical decisions. Record decisions when they are made or when implementation deviates from `docs/implementation-plan.md`.

## Seed Decisions From The Implementation Plan

### 1. Use a transactional outbox instead of publishing directly from the API

- Context: message creation must persist the message and eventually publish `message.created`.
- Decision: write `Message` and `OutboxEvent` atomically in one MongoDB transaction; publish later from a worker.
- Reason: avoids dual-write loss and keeps Kafka out of the request path.
- Trade-off: search becomes eventually consistent and a publisher worker is required.
- Alternatives: direct Kafka publish in the API; Kafka transaction coupling.

### 2. Use kafkajs instead of Nest Kafka microservice transport

- Context: the indexer needs manual retry, DLQ, and per-message error control.
- Decision: wrap kafkajs in `MessagingModule`.
- Reason: kafkajs exposes the controls required by the reliability design.
- Trade-off: more infrastructure code than Nest transport.
- Alternatives: Nest microservice Kafka transport.

### 3. Keep the outbox publisher single-replica initially

- Context: event order matters per conversation.
- Decision: run one publisher replica in the default deployment.
- Reason: simple deterministic dispatch; Kafka keying preserves per-conversation order downstream.
- Trade-off: publisher throughput ceiling.
- Alternatives: key-hash sharded publishers once scale requires it.

### 4. Use cursor pagination for message listing

- Context: conversation message lists must be stable under inserts.
- Decision: use an opaque cursor over `(timestamp, _id)` with asc/desc support.
- Reason: stable, index-aligned pagination without offset drift.
- Trade-off: cursors are less human-readable than page numbers.
- Alternatives: offset pagination.

### 5. Do not add a senderId MongoDB index

- Context: no endpoint queries by sender.
- Decision: index only the access pattern used by list messages.
- Reason: unused indexes tax every write.
- Trade-off: future sender queries will need a migration.
- Alternatives: preemptive sender index.

### 6. Use from/size for bounded Elasticsearch paging

- Context: search pages are capped at page 100 and limit 50.
- Decision: use `from`/`size` initially.
- Reason: simple and safely below the default 10k result window.
- Trade-off: not suitable if product requirements raise limits.
- Alternatives: `search_after`.

### 7. Use API-key auth with a documented senderId trust model

- Context: callers are trusted internal services.
- Decision: authenticate services with API keys and trust body `senderId` only under that boundary.
- Reason: fits service-to-service scope without building user identity.
- Trade-off: not safe for public user-facing use without JWT-derived identity.
- Alternatives: JWT guard from day one.

### 8. Use versioned Elasticsearch indices behind aliases

- Context: mappings need to evolve without changing application code.
- Decision: use `messages-vN` physical indices and `messages-read`/`messages-write` aliases.
- Reason: supports atomic alias swaps and safer reindexing.
- Trade-off: requires operational runbook and alias discipline.
- Alternatives: write directly to a physical index.

### 9. Prefer at-least-once delivery plus idempotency over exactly-once semantics

- Context: publisher and consumer crashes can duplicate delivery.
- Decision: accept at-least-once and make ES indexing idempotent with `_id = message.id`.
- Reason: simpler and sufficient for convergent search state.
- Trade-off: logs and metrics must tolerate duplicates.
- Alternatives: Kafka EOS/transactions.

### 10. TTL-clean published outbox events

- Context: published outbox rows should not grow forever.
- Decision: use a TTL index on `publishedAt` for published rows.
- Reason: keeps collection growth bounded without a cleanup job.
- Trade-off: published event history is short-lived in MongoDB.
- Alternatives: scheduled cleanup job; retain indefinitely.

### 11. Override transitive multer to a patched release

- Context: the initial Nest scaffold installed `@nestjs/platform-express`, which brought a transitive `multer` version flagged by `npm audit --omit=dev --audit-level=high`.
- Decision: add a narrow pnpm override for `multer` at `^2.2.0`.
- Reason: resolves the production audit finding without downgrading Nest or changing the HTTP platform.
- Trade-off: keep the override under review when `@nestjs/platform-express` updates its own dependency range.
- Alternatives: downgrade via `npm audit fix --force`; switch away from Express; ignore the audit finding until a later phase.

### 12. Standardize on pnpm 11.1.1

- Context: the scaffold was initially installed with npm artifacts, but the approved package manager is pnpm 11.1.1.
- Decision: declare `packageManager: pnpm@11.1.1`, commit `pnpm-lock.yaml`, and keep `pnpm-workspace.yaml` for `apps/*` and `libs/*`.
- Reason: gives all contributors, agents, scripts, and CI one package-manager contract.
- Trade-off: Corepack or a compatible pnpm 11.1.1 executable must be available in local and CI environments.
- Alternatives: continue with npm; allow mixed package managers.
