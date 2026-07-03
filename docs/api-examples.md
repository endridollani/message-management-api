# API Examples

These examples match the current DTOs, auth behavior, and error shape. IDs,
timestamps, scores, and correlation IDs vary by run.

All message endpoints require `x-api-key`. The local examples assume `.env`
contains `API_KEYS=local-dev:<sha256(local-dev-key)>`.

## POST /api/messages

```sh
curl -i -X POST 'http://localhost:3000/api/messages' \
  -H 'content-type: application/json' \
  -H 'x-api-key: local-dev-key' \
  -H 'x-correlation-id: example-create-1' \
  -d '{
    "conversationId": "conversation-1",
    "senderId": "sender-1",
    "content": "hello searchable world",
    "metadata": { "channel": "sms" }
  }'
```

```http
HTTP/1.1 201 Created
x-correlation-id: example-create-1
content-type: application/json; charset=utf-8
```

```json
{
  "id": "64f2d8e7a088f5d3d879c001",
  "conversationId": "conversation-1",
  "senderId": "sender-1",
  "content": "hello searchable world",
  "timestamp": "2026-07-03T09:00:00.000Z",
  "metadata": { "channel": "sms" }
}
```

The API also writes a pending `message.created` v1 outbox event in the same
MongoDB transaction. Kafka and Elasticsearch availability do not affect this
request.

## GET /api/conversations/:conversationId/messages

```sh
curl -i 'http://localhost:3000/api/conversations/conversation-1/messages?limit=20&sortOrder=desc' \
  -H 'x-api-key: local-dev-key'
```

```json
{
  "data": [
    {
      "id": "64f2d8e7a088f5d3d879c001",
      "conversationId": "conversation-1",
      "senderId": "sender-1",
      "content": "hello searchable world",
      "timestamp": "2026-07-03T09:00:00.000Z",
      "metadata": { "channel": "sms" }
    }
  ],
  "pagination": {
    "limit": 20,
    "nextCursor": null,
    "hasMore": false,
    "sortOrder": "desc"
  }
}
```

When `hasMore` is `true`, pass `nextCursor` back as `cursor` with the same
`sortOrder`.

## GET /api/conversations/:conversationId/messages/search

```sh
curl -i 'http://localhost:3000/api/conversations/conversation-1/messages/search?q=hello&page=1&limit=20' \
  -H 'x-api-key: local-dev-key'
```

```json
{
  "data": [
    {
      "id": "64f2d8e7a088f5d3d879c001",
      "conversationId": "conversation-1",
      "senderId": "sender-1",
      "content": "hello searchable world",
      "timestamp": "2026-07-03T09:00:00.000Z",
      "metadata": { "channel": "sms" },
      "score": 1.25
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "totalPages": 1
  }
}
```

Search is eventually consistent. Retry after a short delay if a just-created
message is not visible yet.

## Validation 400

```sh
curl -i -X POST 'http://localhost:3000/api/messages' \
  -H 'content-type: application/json' \
  -H 'x-api-key: local-dev-key' \
  -d '{"conversationId":"","senderId":"sender-1","content":"","extra":"forbidden"}'
```

```http
HTTP/1.1 400 Bad Request
```

```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": [
    "property extra should not exist",
    "conversationId should not be empty",
    "conversationId must match /^[A-Za-z0-9_:.-]+$/ regular expression",
    "content should not be empty"
  ],
  "path": "/api/messages",
  "timestamp": "2026-07-03T09:00:00.000Z",
  "correlationId": "..."
}
```

## Auth 401

```sh
curl -i -X POST 'http://localhost:3000/api/messages' \
  -H 'content-type: application/json' \
  -d '{}'
```

```http
HTTP/1.1 401 Unauthorized
```

```json
{
  "statusCode": 401,
  "error": "Unauthorized",
  "message": "Invalid API key",
  "path": "/api/messages",
  "timestamp": "2026-07-03T09:00:00.000Z",
  "correlationId": "..."
}
```

## Search Unavailable 503

If Elasticsearch is down or the read alias is unavailable, search returns the
standard error shape:

```json
{
  "statusCode": 503,
  "error": "Service Unavailable",
  "message": "Search is temporarily unavailable",
  "path": "/api/conversations/conversation-1/messages/search?q=hello",
  "timestamp": "2026-07-03T09:00:00.000Z",
  "correlationId": "..."
}
```

Create and list still use MongoDB, but API readiness is red while Elasticsearch
is unavailable.

## Health And Readiness

```sh
curl -s 'http://localhost:3000/health/liveness'
curl -s 'http://localhost:3000/health/readiness'
curl -s 'http://localhost:3001/health/readiness'
curl -s 'http://localhost:3002/health/readiness'
```

API readiness shape:

```json
{
  "status": "ok",
  "info": {
    "runtime": {
      "status": "up",
      "runtime": "api",
      "dependencies": ["mongodb", "elasticsearch"]
    },
    "mongodb": { "status": "up", "readyState": 1 },
    "elasticsearch": { "status": "up", "alias": "messages-read" }
  },
  "error": {},
  "details": {
    "runtime": {
      "status": "up",
      "runtime": "api",
      "dependencies": ["mongodb", "elasticsearch"]
    },
    "mongodb": { "status": "up", "readyState": 1 },
    "elasticsearch": { "status": "up", "alias": "messages-read" }
  }
}
```

## Metrics Sample

```sh
curl -s 'http://localhost:3000/metrics' | sed -n '1,40p'
```

```text
# HELP message_management_process_cpu_user_seconds_total Total user CPU time spent in seconds.
# TYPE message_management_process_cpu_user_seconds_total counter
message_management_process_cpu_user_seconds_total 0.123

# HELP message_management_http_requests_total Total HTTP requests observed by the API runtime.
# TYPE message_management_http_requests_total counter

# HELP message_management_http_request_duration_seconds HTTP request duration observed by the API runtime.
# TYPE message_management_http_request_duration_seconds histogram
```

Outbox and search-indexer runtimes expose their own metrics on ports `3001` and
`3002`.
