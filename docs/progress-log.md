# Progress Log

Append one entry after each completed Section 20 phase. Keep entries factual: scope, files touched, validation, open issues, and next action.

## 2026-07-03 - P1 Steps 1-3: Scaffold, agent files, docs seed

- Scope: initialized the NestJS monorepo scaffold for `api`, `outbox-publisher`, `search-indexer`, and `cli`; added root agent instructions; seeded project memory files and runbook placeholders.
- Files touched: scaffold/tooling files at the repo root, `apps/`, `libs/`, `AGENTS.md`, `CLAUDE.md`, `package-lock.json`, and `docs/`.
- Validation:
  - `npm install` - passed; refreshed `package-lock.json`.
  - `npm run format:check` - passed.
  - `npm run lint` - passed.
  - `npm test` - passed; 4 test suites and 4 tests passed.
  - `npm run build` - passed; all four app builds and root typecheck passed.
  - `npm audit --omit=dev --audit-level=high` - passed with network access; found 0 vulnerabilities.
- Open issues: none yet.
- Next action: begin Section 20 step 4 only after confirming the next implementation slice.

## 2026-07-03 - Package manager conversion to pnpm

- Scope: converted the scaffold from npm artifacts to pnpm 11.1.1 before continuing application implementation.
- Files touched: `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `.gitignore`, `AGENTS.md`, `docs/implementation-plan.md`, `docs/decisions.md`, `docs/progress-log.md`, and `docs/handoff.md`; removed `package-lock.json`.
- Validation:
  - `corepack enable` - failed in the sandbox with `EPERM` creating `/usr/local/bin/pnpm`; approved rerun also failed with `EACCES`.
  - `corepack prepare pnpm@11.1.1 --activate` - failed in the sandbox writing the Corepack cache; approved rerun passed.
  - `pnpm install` - initial sandboxed install hit registry DNS failures and was interrupted; approved rerun passed using pnpm 11.1.1 and created `pnpm-lock.yaml`.
  - `pnpm run build` - passed using pnpm 11.1.1.
  - `pnpm run test` - passed using pnpm 11.1.1; 4 test suites and 4 tests passed.
  - `pnpm run lint` - passed using pnpm 11.1.1.
- Open issues: the system `pnpm` shim currently resolves to a different runtime binary, so validation used a temporary PATH shim pointed at the Corepack-cached pnpm 11.1.1 executable.
- Next action: proceed to Section 20 step 4 with pnpm commands only.

## 2026-07-03 - TypeScript 6 baseUrl deprecation cleanup

- Scope: removed the deprecated `compilerOptions.baseUrl` setting and made every `compilerOptions.paths` target explicitly relative to the root `tsconfig.json`.
- Files touched: `tsconfig.json`, `docs/progress-log.md`, and `docs/handoff.md`.
- Validation:
  - `pnpm install --frozen-lockfile` - initial sandboxed install hit registry DNS failures and was interrupted; approved rerun passed using pnpm 11.1.1.
  - `pnpm run build` - passed using pnpm 11.1.1.
  - `pnpm run test` - passed using pnpm 11.1.1; 4 test suites and 4 tests passed.
  - `pnpm run lint` - passed using pnpm 11.1.1.
- Open issues: none for this change.
- Next action: proceed to Section 20 step 4 with pnpm commands only.

## 2026-07-03 - P2A: Local infrastructure and pnpm command consistency

- Scope: added local infrastructure compose services for MongoDB replica set initialization, Kafka in KRaft mode, and Elasticsearch; added `.env.example`; added README infrastructure startup commands; moved the existing pnpm override into `pnpm-workspace.yaml`.
- Files touched: `docker-compose.yml`, `.env.example`, `README.md`, `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `docs/decisions.md`, `docs/progress-log.md`, and `docs/handoff.md`.
- Validation:
  - `pnpm run build` - passed using pnpm 11.1.1.
  - `pnpm run test` - passed using pnpm 11.1.1; 4 test suites and 4 tests passed.
  - `pnpm run lint` - passed using pnpm 11.1.1.
  - `docker compose config` - passed.
  - `docker compose up -d mongodb mongodb-init kafka elasticsearch` - initially failed because host port `27017` was already in use; rerun passed after the port was freed.
  - `docker compose ps` - passed; MongoDB, Kafka, and Elasticsearch were healthy.
  - `docker compose ps -a` - passed; `mongodb-init` exited with code 0 after initializing `rs0`.
- Open issues: none for P2A.
- Next action: proceed to Section 20 step 5.
