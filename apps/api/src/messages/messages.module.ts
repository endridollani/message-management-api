import { Module } from '@nestjs/common';
import { CreateMessageService, ListMessagesService } from '@app/application';
import { PersistenceModule } from '@app/persistence';

import { ConversationMessagesController } from './conversation-messages.controller';
import { MessagesController } from './messages.controller';

@Module({
  controllers: [MessagesController, ConversationMessagesController],
  imports: [PersistenceModule],
  providers: [CreateMessageService, ListMessagesService],
})
export class MessagesModule {}
