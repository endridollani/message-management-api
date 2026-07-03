import { Module } from '@nestjs/common';
import { MessageManagementConfigModule } from '@app/config';
import { MessagingModule } from '@app/messaging';
import { ObservabilityModule } from '@app/observability';
import { SearchModule } from '@app/search';

import { HealthController } from './health/health.controller';
import { MessageCreatedConsumer } from './message-created.consumer';
import { MetricsController } from './metrics/metrics.controller';

@Module({
  controllers: [HealthController, MetricsController],
  imports: [
    MessageManagementConfigModule.forRuntime('search-indexer'),
    ObservabilityModule,
    MessagingModule,
    SearchModule,
  ],
  providers: [MessageCreatedConsumer],
})
export class SearchIndexerModule {}
