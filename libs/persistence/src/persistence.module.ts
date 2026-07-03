import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { TerminusModule } from '@nestjs/terminus';
import { MESSAGE_REPOSITORY, OUTBOX_REPOSITORY, TRANSACTION_MANAGER } from '@app/domain';

import { MongoHealthIndicator } from './health/mongo-health.indicator';
import { MongoMessageRepository } from './repositories/mongo-message.repository';
import { MongoOutboxRepository } from './repositories/mongo-outbox.repository';
import { MESSAGE_MODEL_NAME, MessageEntity, MessageSchema } from './schemas/message.schema';
import {
  OUTBOX_EVENT_MODEL_NAME,
  OutboxEventEntity,
  OutboxEventSchema,
} from './schemas/outbox-event.schema';
import { MongooseTransactionManager } from './transactions/mongoose-transaction.manager';

@Module({
  exports: [
    MESSAGE_REPOSITORY,
    OUTBOX_REPOSITORY,
    TRANSACTION_MANAGER,
    MongoHealthIndicator,
    MongooseModule,
  ],
  imports: [
    TerminusModule,
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        autoIndex: configService.get<string>('app.nodeEnv') !== 'production',
        uri: configService.getOrThrow<string>('mongodb.uri'),
      }),
    }),
    MongooseModule.forFeature([
      { name: MESSAGE_MODEL_NAME, schema: MessageSchema, collection: 'messages' },
      {
        name: OUTBOX_EVENT_MODEL_NAME,
        schema: OutboxEventSchema,
        collection: 'outbox_events',
      },
    ]),
  ],
  providers: [
    MongoMessageRepository,
    MongoOutboxRepository,
    MongoHealthIndicator,
    MongooseTransactionManager,
    {
      provide: MESSAGE_REPOSITORY,
      useExisting: MongoMessageRepository,
    },
    {
      provide: OUTBOX_REPOSITORY,
      useExisting: MongoOutboxRepository,
    },
    {
      provide: TRANSACTION_MANAGER,
      useExisting: MongooseTransactionManager,
    },
  ],
})
export class PersistenceModule {}

export const persistenceModels = {
  message: MessageEntity,
  outboxEvent: OutboxEventEntity,
};
