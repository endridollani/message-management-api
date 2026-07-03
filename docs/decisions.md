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

### 13. Use the Bitnami legacy Kafka image for the local KRaft broker

- Context: Section 15 called for `bitnami/kafka:3.7`, but Docker Hub currently exposes no pullable tags for `bitnami/kafka`; exact `3.7.0` and `3.7.1` tags are also unavailable.
- Decision: pin local compose to `bitnamilegacy/kafka:3.7.1-debian-12-r11` with KRaft mode enabled.
- Reason: preserves the Bitnami Kafka/KRaft setup using a concrete, pullable 3.7.1 image.
- Trade-off: the image repository name differs from the original plan and should be revisited if Bitnami restores non-legacy tags.
- Alternatives: switch to the Apache Kafka image; use a newer Bitnami legacy Kafka version; leave the compose stack unpullable.

### 14. Defer application Dockerfile targets until app services are added to compose

- Context: P2A validation only starts local infrastructure services; application logic, health endpoints, and runtime containers are intentionally out of scope for this slice.
- Decision: do not add a Dockerfile in P2A.
- Reason: a multi-stage app Dockerfile cannot be meaningfully validated until app services and health endpoints exist.
- Trade-off: Section 20 step 4's Dockerfile item remains deferred to the first slice that adds compose-managed app services.
- Alternatives: add an unused Dockerfile skeleton now; add app services prematurely.

### 15. Declare Express as a direct dependency for API bootstrap imports

- Context: P2B imports Express runtime APIs and types directly for JSON body limits, response typing, and middleware contracts.
- Decision: add direct `express` and `@types/express` dependencies instead of relying on `@nestjs/platform-express` transitive dependencies.
- Reason: pnpm's strict dependency model does not permit application code to import undeclared transitive packages.
- Trade-off: Express becomes an explicit repo dependency that must stay compatible with the Nest platform adapter.
- Alternatives: avoid direct Express imports and accept weaker typing/less explicit body-parser setup.

### 16. Keep P2B readiness dependency-free until dependency clients exist

- Context: P2B introduces readiness routes before MongoDB and Elasticsearch modules are implemented.
- Decision: `/health/readiness` reports runtime readiness with `dependencies: []` in P2B.
- Reason: adding real MongoDB/Elasticsearch probes before their clients exist would either duplicate future infrastructure code or create unvalidated placeholder clients.
- Trade-off: P2B readiness is not yet the final API dependency policy from the implementation plan.
- Alternatives: add ad hoc raw dependency clients in the API health controller; delay readiness route creation.

### 17. Add MongoDB and contract-test dependencies for P3

- Context: P3 implements the system-of-record write/read path with Mongoose and fast API contract tests against transactional MongoDB.
- Decision: add `@nestjs/mongoose` and `mongoose` as runtime dependencies, and add `mongodb-memory-server`, `supertest`, and `@types/supertest` as dev dependencies. Approve the `mongodb-memory-server` build script in `pnpm-workspace.yaml`.
- Reason: Mongoose is the planned persistence adapter, and `MongoMemoryReplSet` gives Docker-free transaction-capable API contract tests.
- Trade-off: the first install/test run downloads a local MongoDB binary for the memory server.
- Alternatives: mock persistence in API e2e; require Docker/Testcontainers for every API contract test.

### 18. Scope API readiness to MongoDB until search is implemented

- Context: the implementation plan's final API readiness policy includes MongoDB and Elasticsearch because the complete API contract includes search.
- Decision: in P3, readiness checks MongoDB only; Elasticsearch readiness is deferred until P4 adds the ES client and search endpoint.
- Reason: P3 intentionally keeps search behavior out of scope and should not create an unused ES client solely for readiness.
- Trade-off: P3 readiness is not the final all-dependencies production policy.
- Alternatives: keep the P2B placeholder; add an ad hoc Elasticsearch probe before search exists.

### 19. Keep KafkaJS producer idempotence disabled in P4A

- Context: P4A adds the messaging library and outbox publisher. The plan allows
  KafkaJS producer idempotence only if it is stable and documented enough to rely
  on operationally.
- Decision: configure the KafkaJS producer with `acks: -1` on sends and
  `allowAutoTopicCreation: false`, but do not enable `idempotent`.
- Reason: correctness already comes from the transactional outbox, lock-owner-safe
  row transitions, at-least-once delivery, and downstream idempotency; adding an
  idempotent producer is not required for this slice and should not become a
  hidden correctness dependency.
- Trade-off: a crash after Kafka ack and before marking the row published can
  duplicate a publish, which is the accepted at-least-once behavior.
- Alternatives: enable KafkaJS idempotence immediately; use Kafka transactions.

### 20. Use direct MongoDB connections for host-run local runtimes

- Context: local Compose initializes the MongoDB replica set with member host
  `mongodb:27017`, but host-run Nest runtimes connect through `localhost:27017`.
- Decision: document the local host-run `MONGODB_URI` with
  `replicaSet=rs0&directConnection=true`.
- Reason: it preserves transaction-capable replica-set behavior while avoiding
  host DNS discovery of the container-only `mongodb` hostname.
- Trade-off: Compose-managed application containers should use an internal
  container-network URI instead of the host-run example.
- Alternatives: advertise the replica-set member as `localhost`; require a host
  alias for `mongodb`; run all application processes inside Compose.

### 21. Include Elasticsearch in API readiness once search is implemented

- Context: P4B implements the Elasticsearch-backed search endpoint, so the API
  runtime now depends on MongoDB for create/list and Elasticsearch for search.
- Decision: API `/health/readiness` checks MongoDB and the `messages-read`
  Elasticsearch alias.
- Reason: the deployed API contract includes search; routing traffic to an API
  instance that cannot serve search would violate the default production
  readiness policy in the implementation plan.
- Trade-off: a search-only Elasticsearch outage marks the whole API not ready
  even though create/list would still work.
- Alternatives: expose dependency-specific readiness or degraded readiness if a
  deployment wants partial API availability.

### 22. Pin the Elasticsearch JavaScript client to 8.14.0

- Context: P4B initially installed the latest `@elastic/elasticsearch`, which was
  9.x. The local Elasticsearch service is 8.14.3 and rejects v9 compatibility
  headers (`compatible-with=9`).
- Decision: pin `@elastic/elasticsearch` to `8.14.0`, matching the local
  Elasticsearch 8.x stack used by Compose.
- Reason: the official client major must match the cluster major for startup
  index creation, alias checks, indexing, and search to work.
- Trade-off: dependency upgrades must move the Docker Elasticsearch image and
  client major together.
- Alternatives: upgrade the Compose Elasticsearch image to 9.x; override client
  compatibility headers manually.

### 23. Make maintenance CLI mutations opt-in with `--confirm`

- Context: P5 adds operator commands that can mutate outbox rows, republish DLQ
  records, and swap Elasticsearch aliases.
- Decision: state-changing CLI commands default to dry-run behavior and require
  `--confirm` before applying changes. `outbox:redrive --confirm` also requires
  an explicit selector or `--limit`.
- Reason: failed outbox rows and DLQ records can be poison messages; accidental
  bulk redrive is more dangerous than an extra explicit flag.
- Trade-off: routine operator commands are slightly more verbose.
- Alternatives: prompt interactively; mutate by default with only a `--dry-run`
  escape hatch.

### 24. Keep CLI clients lazy and command-scoped

- Context: Importing worker modules into the CLI would connect Kafka producers
  and initialize Elasticsearch aliases even for Mongo-only commands.
- Decision: CLI services construct MongoDB, Kafka, and Elasticsearch clients only
  inside the commands that need them.
- Reason: `outbox:inspect` should not require Kafka producer startup or touch
  Elasticsearch aliases, and `es:reindex --dry-run` should not initialize worker
  side effects.
- Trade-off: the CLI has small operational client wrappers instead of only using
  Nest module providers.
- Alternatives: import `PersistenceModule`, `MessagingModule`, and `SearchModule`
  globally into `CliModule`.

### 25. Do not move existing Elasticsearch aliases during startup bootstrap

- Context: P5 reindexing can move `messages-read` and `messages-write` to a new
  physical index while older code still knows about `messages-v1`.
- Decision: `IndexManagerService` creates missing aliases but does not overwrite
  aliases that already exist.
- Reason: runtime startup must not undo an operator-controlled reindex alias
  swap.
- Trade-off: alias repair after a bad manual migration must be explicit instead
  of silently forced to the bootstrap index.
- Alternatives: always point aliases at the compiled-in physical index during
  startup.
