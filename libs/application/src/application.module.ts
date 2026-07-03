import { Module } from '@nestjs/common';

import { CreateMessageService } from './messages/create-message.service';
import { ListMessagesService } from './messages/list-messages.service';
import { SearchMessagesService } from './messages/search-messages.service';

@Module({
  exports: [CreateMessageService, ListMessagesService, SearchMessagesService],
  providers: [CreateMessageService, ListMessagesService, SearchMessagesService],
})
export class ApplicationModule {}
