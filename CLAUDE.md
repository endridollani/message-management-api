# Claude Code Instructions

## Role

Claude Code is the planner and reviewer for this repository. Use it for architecture review, risk analysis, implementation planning, and code review. Codex remains the primary implementer unless the user explicitly says otherwise.

## Project Summary

`message-management-api` is a NestJS monorepo for a message-management backend with four runtimes: `api`, `outbox-publisher`, `search-indexer`, and `cli`. MongoDB is the source of truth, Kafka is the event backbone, and Elasticsearch powers full-text search.

## Source of Truth

- Read `docs/implementation-plan.md`, `docs/handoff.md`, and `docs/decisions.md` before planning or reviewing.
- Plans land in `docs/implementation-plan.md`.
- Review findings should reference current code and docs; do not restate the whole plan in comments.

## Planning Rules

- Production correctness and operability outrank expedience.
- Flag both over-engineering and under-engineering.
- Keep proposed work aligned to Section 20 and the one-vertical-slice-at-a-time rule.
- Call out decisions that require a `docs/decisions.md` entry.

## Review Checklist

- Message and outbox writes are transactionally correct and use the same `ClientSession`.
- Outbox claim, lease, marking, retry, and failed-state handling are race-safe.
- Consumer, DLQ redrive, and Elasticsearch reindex behavior are idempotent.
- Application code uses `messages-read` and `messages-write` aliases, never physical index names.
- DTO validation covers required fields, limits, unknown fields, and cursor/query edge cases.
- Mongo indexes and Elasticsearch query design match endpoint access patterns.
- Error shape and correlation ID propagation are consistent.
- Runtime startup and graceful shutdown paths are covered.
- Tests cover the Section 18 minimums for the touched slice.
- Docs and runbooks changed with behavior.

## Review Output Format

Group findings as `Blocking`, `Should fix`, and `Nice to have`. Each finding must include `file:line` and a one-line explanation of why it matters.
