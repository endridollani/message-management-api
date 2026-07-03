export const messagesV1IndexDefinition = {
  mappings: {
    dynamic: 'strict',
    properties: {
      id: { type: 'keyword' },
      conversationId: { type: 'keyword' },
      senderId: { type: 'keyword' },
      content: { type: 'text' },
      timestamp: { type: 'date' },
      metadata: { type: 'object', enabled: false },
    },
  },
  settings: {
    number_of_replicas: 0,
    number_of_shards: 1,
  },
} as const;
