# Security

Update this file in the same change that changes authentication, authorization,
input validation, request limits, secret handling, dependency posture, or
deployment exposure.

## API-Key Boundary

Message endpoints require `x-api-key`:

- `POST /api/messages`
- `GET /api/conversations/:conversationId/messages`
- `GET /api/conversations/:conversationId/messages/search`

`API_KEYS` is a comma-separated list of `name:sha256(raw-key)` entries. Raw keys
are never stored in config. The guard hashes the presented key with SHA-256 and
compares it to configured hashes with `timingSafeEqual`; on success it attaches
the configured key name to the request object for audit use.

Missing or invalid keys return the standard `401` error shape with message
`Invalid API key`.

Generate a local development hash:

```sh
DEV_API_KEY='local-dev-key' node -e 'const crypto = require("node:crypto"); process.stdout.write(crypto.createHash("sha256").update(process.env.DEV_API_KEY).digest("hex"));'
```

Then set:

```dotenv
API_KEYS=local-dev:<printed-sha256-hash>
```

## Key Rotation

Use overlapping keys:

1. Add a new `name:hash` entry to `API_KEYS` while keeping existing entries.
2. Deploy/restart all API instances.
3. Move callers to the new raw key.
4. Confirm old-key traffic has stopped in logs/gateway telemetry.
5. Remove the old entry and deploy/restart again.

Never commit raw keys or hashes for real environments. Store them in the
deployment secret manager and inject them as environment variables.

## Secret Handling

- `.env` is for local development and must stay out of git.
- `x-api-key`, `authorization`, and `cookie` request headers are redacted from
  structured logs.
- Do not log request bodies in production; message content and metadata can be
  sensitive.
- Elasticsearch credentials/TLS are not configured for local Compose and must be
  supplied by production deployment configuration.

## senderId Trust Model

`senderId` is caller-asserted and trusted only because this API is scoped to
API-key-authenticated internal services. The service does not verify that
`senderId` belongs to an end user.

For a public or user-facing deployment, remove or ignore body `senderId` and
derive sender identity from the authenticated principal, for example a JWT `sub`
claim validated through Passport/JWKS or an API gateway. That JWT extension path
is documented as future work and is not implemented in this repo.

## Health And Metrics Exposure

`GET /health/liveness`, `GET /health/readiness`, and `GET /metrics` are
unauthenticated in the application. This is acceptable only for local
development, private networks, or deployments where an external gateway/service
mesh protects operational routes.

Do not expose `/metrics` publicly. It can reveal runtime, dependency, and volume
information useful to attackers.

## OpenAPI Documentation Exposure

`GET /docs` and `GET /docs-json` are unauthenticated in the API application.
They document the public HTTP API only; internal Kafka, worker, and CLI
operations are not exposed as HTTP APIs.

Treat documentation routes as deployment-sensitive. They are useful in local and
private-network environments, but public-facing deployments should restrict them
at the gateway, service mesh, or network boundary.

## Input Validation And Request Limits

- Global validation uses `whitelist`, `forbidNonWhitelisted`, `transform`, and
  explicit numeric transforms only.
- Unknown JSON properties are rejected.
- `conversationId` and `senderId` are trimmed opaque IDs with max length 128 and
  pattern `^[A-Za-z0-9_:.-]+$`.
- `content` is trimmed, non-empty, and capped at 5,000 characters.
- `metadata` must be a top-level plain JSON object and is capped at 10 KB
  serialized.
- Express JSON body size is capped at `100kb`.

Message content is stored and indexed as data. The service does not HTML-sanitize
content; output encoding is the responsibility of clients that render content.

## Dependency And CI Posture

CI runs lint, typecheck, unit, e2e, integration, build, Docker builds, and a
production dependency audit. The audit job is currently non-blocking by design
while baseline policy is finalized, but findings must still be reviewed.

Keep `@elastic/elasticsearch` on the same major as the Elasticsearch cluster.
The current local stack uses Elasticsearch `8.14.3` and client `8.14.x`.
