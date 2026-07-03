export { PersistenceModule } from './persistence.module';
export { MongoMessageRepository } from './repositories/mongo-message.repository';
export { MongoOutboxRepository } from './repositories/mongo-outbox.repository';
export { MongoHealthIndicator } from './health/mongo-health.indicator';
export { MongooseTransactionManager } from './transactions/mongoose-transaction.manager';
export {
  MESSAGE_MODEL_NAME,
  MessageEntity,
  MessageSchema,
  type MessageDocument,
} from './schemas/message.schema';
export {
  OUTBOX_EVENT_MODEL_NAME,
  OUTBOX_EVENT_STATUSES,
  OutboxEventEntity,
  OutboxEventSchema,
  type OutboxEventDocument,
} from './schemas/outbox-event.schema';
