# API Examples

Owner note: Fill this with real captured requests and responses when the API endpoints are implemented. Keep examples aligned with the current DTOs, auth behavior, and error shape.

## Planned Coverage

- `POST /api/messages`
- `GET /api/conversations/:conversationId/messages`
- `GET /api/conversations/:conversationId/messages/search`
- Health endpoints
- Metrics sample
- Validation and authentication error matrix

## P3 Implemented Endpoints

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
transaction. Kafka publishing is intentionally not implemented in P3.

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

- `GET /api/conversations/:conversationId/messages/search` remains unimplemented until
  P4 adds the Elasticsearch-backed search path.
