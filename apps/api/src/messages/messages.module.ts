import { Module } from '@nestjs/common';
import { CreateMessageService, ListMessagesService, SearchMessagesService } from '@app/application';
import { PersistenceModule } from '@app/persistence';
import { SearchModule } from '@app/search';

import { ConversationMessagesController } from './conversation-messages.controller';
import { MessagesController } from './messages.controller';

@Module({
  controllers: [MessagesController, ConversationMessagesController],
  imports: [PersistenceModule, SearchModule],
  providers: [CreateMessageService, ListMessagesService, SearchMessagesService],
})
export class MessagesModule {}
