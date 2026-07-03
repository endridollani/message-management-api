# API Examples

Owner note: Fill this with real captured requests and responses when the API endpoints are implemented. Keep examples aligned with the current DTOs, auth behavior, and error shape.

## Planned Coverage

- `POST /api/messages`
- `GET /api/conversations/:conversationId/messages`
- `GET /api/conversations/:conversationId/messages/search`
- Health endpoints
- Metrics sample
- Validation and authentication error matrix

## Implemented Endpoints

All message endpoints require `x-api-key`. The examples below use `valid-api-key` as a
placeholder raw key; local keys must match an `API_KEYS=name:sha256(raw-key)` entry.

### Create Message

```bash
curl -i -X POST http://localhost:3000/api/messages \
  -H 'content-type: application/json' \
  -H 'x-api-key: valid-api-key' \
  -H 'x-correlation-id: example-correlation-id' \
  -d '{
    "conversationId": "conversation-1",
    "senderId": "sender-1",
    "content": "hello world",
    "metadata": { "channel": "sms" }
  }'
```

Response:

```json
{
  "id": "64f2d8e7a088f5d3d879c001",
  "conversationId": "conversation-1",
  "senderId": "sender-1",
  "content": "hello world",
  "timestamp": "2026-07-03T09:00:00.000Z",
  "metadata": { "channel": "sms" }
}
```

The API also writes a pending `message.created` v1 outbox event in the same MongoDB
transaction. The outbox publisher and search-indexer asynchronously publish and
index the event, so search is eventually consistent.

### List Conversation Messages

```bash
curl -i 'http://localhost:3000/api/conversations/conversation-1/messages?limit=20&sortOrder=desc' \
  -H 'x-api-key: valid-api-key'
```

Response:

```json
{
  "data": [
    {
      "id": "64f2d8e7a088f5d3d879c001",
      "conversationId": "conversation-1",
      "senderId": "sender-1",
      "content": "hello world",
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

When `hasMore` is `true`, pass the opaque `nextCursor` back as `cursor` with the same
`sortOrder`.

### Search Conversation Messages

```bash
curl -i 'http://localhost:3000/api/conversations/conversation-1/messages/search?q=hello&page=1&limit=20' \
  -H 'x-api-key: valid-api-key'
```

Response:

```json
{
  "data": [
    {
      "id": "64f2d8e7a088f5d3d879c001",
      "conversationId": "conversation-1",
      "senderId": "sender-1",
      "content": "hello world",
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

If Elasticsearch is unavailable, the search endpoint returns the standard error
shape with `503 Service Unavailable`. Create and list behavior still use MongoDB,
but API readiness marks the runtime not ready while the search dependency is down.

### Validation Error

```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": [
    "property extra should not exist",
    "conversationId should not be empty",
    "content should not be empty"
  ],
  "path": "/api/messages",
  "timestamp": "2026-07-03T09:00:00.000Z",
  "correlationId": "..."
}
```

### Authentication Error

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

## Still Out Of Scope

- CLI commands for outbox inspection/redrive, DLQ redrive, and Elasticsearch reindexing.
