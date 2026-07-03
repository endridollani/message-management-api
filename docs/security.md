# Security

Owner note: Update this file in the same change that changes authentication, authorization, input validation, request limits, secret handling, dependency posture, or deployment exposure.

## Planned Coverage

- API-key auth mechanism and rotation procedure.
- `senderId` trust model.
- JWT extension path for user-facing deployments.
- Health and `/metrics` exposure assumptions.
- Injection, size-limit, and secrets-handling notes.

## P3 Implemented Security Boundary

### API Keys

- `POST /api/messages` and `GET /api/conversations/:conversationId/messages` require
  the `x-api-key` header.
- `API_KEYS` is a comma-separated list of `name:sha256(raw-key)` entries. Raw keys are
  never stored in config.
- The guard hashes the presented key with SHA-256 and compares it to configured hashes
  with `timingSafeEqual`.
- Missing or invalid keys return the standard `401` error shape.
- `x-api-key` is redacted from structured request logs.

### Public Operational Routes

`GET /health/liveness`, `GET /health/readiness`, and `GET /metrics` remain unauthenticated
in P3. They must be exposed only on private networks or protected externally in any
public-facing deployment.

### Input Validation

- Global validation uses `whitelist`, `forbidNonWhitelisted`, and explicit transform.
- `conversationId` and `senderId` are trimmed opaque IDs with max length 128 and pattern
  `^[A-Za-z0-9_:.-]+$`.
- `content` is trimmed, non-empty, and capped at 5,000 characters.
- `metadata` must be a top-level plain JSON object and is capped at 10 KB serialized.
- The request body limit remains `100kb`.

### senderId Trust Model

`senderId` is trusted only because this API is scoped to API-key-authenticated internal
services. A public user-facing deployment must derive sender identity from an
authenticated principal, such as a JWT `sub`, and remove or ignore body `senderId`.
