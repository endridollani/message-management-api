import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

import type { MessageCreatedEvent, OutboxEventStatus } from '@app/domain';

export type OutboxEventDocument = HydratedDocument<OutboxEventEntity>;
export const OUTBOX_EVENT_MODEL_NAME = 'OutboxEvent';
export const OUTBOX_EVENT_STATUSES: readonly OutboxEventStatus[] = [
  'pending',
  'publishing',
  'published',
  'failed',
];

@Schema({
  collection: 'outbox_events',
  versionKey: false,
})
export class OutboxEventEntity {
  _id!: Types.ObjectId;

  @Prop({ required: true, type: String })
  eventId!: string;

  @Prop({ required: true, type: String })
  eventType!: string;

  @Prop({ required: true, type: Number })
  eventVersion!: number;

  @Prop({ required: true, type: String })
  topic!: string;

  @Prop({ required: true, type: String })
  key!: string;

  @Prop({ required: true, type: MongooseSchema.Types.Mixed })
  payload!: MessageCreatedEvent;

  @Prop({ enum: OUTBOX_EVENT_STATUSES, required: true, type: String })
  status!: OutboxEventStatus;

  @Prop({ required: true, type: Number })
  attempts!: number;

  @Prop({ required: true, type: Date })
  nextAttemptAt!: Date;

  @Prop({ required: false, type: String })
  lockedBy?: string;

  @Prop({ required: false, type: Date })
  lockedAt?: Date;

  @Prop({ required: false, type: String })
  lastError?: string;

  @Prop({ required: true, type: Date })
  createdAt!: Date;

  @Prop({ required: false, type: Date })
  publishedAt?: Date;
}

export const OutboxEventSchema = SchemaFactory.createForClass(OutboxEventEntity);

OutboxEventSchema.index({ status: 1, nextAttemptAt: 1, _id: 1 });
OutboxEventSchema.index({ eventId: 1 }, { unique: true });
OutboxEventSchema.index(
  { publishedAt: 1 },
  {
    expireAfterSeconds: 7 * 24 * 60 * 60,
    partialFilterExpression: { status: 'published' },
  },
);
