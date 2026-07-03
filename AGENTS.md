# Codex Instructions

## Role

Codex is the primary implementer for this repository: implement scoped slices, refactor, fix tests, and resolve PR comments. Keep changes narrowly aligned with the current Section 20 step in `docs/implementation-plan.md`.

## Project Summary

`message-management-api` is a NestJS monorepo for a message-management backend with four runtimes: `api`, `outbox-publisher`, `search-indexer`, and `cli`. MongoDB is the source of truth, Kafka is the event backbone, and Elasticsearch powers full-text search.

## Source of Truth

- Read `docs/implementation-plan.md` and `docs/handoff.md` before changing files.
- Treat `docs/` as project memory and source for architecture, decisions, runbooks, and current status.
- Do not duplicate plan details in root instruction files.

## Implementation Rules

- Follow Section 20 phases one vertical slice at a time; do not build all four runtimes breadth-first.
- Respect layer boundaries: controllers contain no business logic; application code depends on ports; infrastructure implements ports.
- Write-path repository methods must take and pass an explicit MongoDB `ClientSession`.
- Kafka payloads must be typed and versioned.
- Elasticsearch writes must project only explicitly mapped fields.
- Record every new dependency or architecture deviation in `docs/decisions.md`.

## Validation Rules

- Use pnpm 11.1.1 for installs and package scripts; do not create npm or yarn lockfiles.
- Run lint and unit tests before declaring a step done.
- Run the integration suite before merging pipeline-touching changes.
- Never mark work complete with failing checks unless the failure is documented in `docs/handoff.md` with the exact command and reason.

## Documentation Rules

- Append `docs/progress-log.md` after each completed phase.
- Update `docs/handoff.md` when stopping or completing a milestone.
- Update runbooks, `docs/observability.md`, and `docs/security.md` in the same change that alters the behavior they describe.

## PR Review Rules

- Address every review comment with a fix or written justification.
- Re-run affected validation suites after changes.
- Log material resolutions in `docs/progress-log.md`.
