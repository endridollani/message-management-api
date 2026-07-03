import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type MessageDocument = HydratedDocument<MessageEntity>;
export const MESSAGE_MODEL_NAME = 'Message';

@Schema({
  collection: 'messages',
  versionKey: false,
})
export class MessageEntity {
  _id!: Types.ObjectId;

  @Prop({ required: true, type: String })
  conversationId!: string;

  @Prop({ required: true, type: String })
  senderId!: string;

  @Prop({ required: true, type: String })
  content!: string;

  @Prop({ required: true, type: Date })
  timestamp!: Date;

  @Prop({ required: false, type: MongooseSchema.Types.Mixed })
  metadata?: Record<string, unknown>;
}

export const MessageSchema = SchemaFactory.createForClass(MessageEntity);

MessageSchema.index({ conversationId: 1, timestamp: -1, _id: -1 });
