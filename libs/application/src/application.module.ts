import { Module } from '@nestjs/common';

import { CreateMessageService } from './messages/create-message.service';
import { ListMessagesService } from './messages/list-messages.service';

@Module({
  exports: [CreateMessageService, ListMessagesService],
  providers: [CreateMessageService, ListMessagesService],
})
export class ApplicationModule {}
