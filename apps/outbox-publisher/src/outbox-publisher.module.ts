import { Module } from '@nestjs/common';
import { MessageManagementConfigModule } from '@app/config';
import { MessagingModule } from '@app/messaging';
import { ObservabilityModule } from '@app/observability';
import { PersistenceModule } from '@app/persistence';

import { HealthController } from './health/health.controller';
import { MetricsController } from './metrics/metrics.controller';
import { PublisherService } from './publisher.service';

@Module({
  controllers: [HealthController, MetricsController],
  imports: [
    MessageManagementConfigModule.forRuntime('outbox-publisher'),
    ObservabilityModule,
    PersistenceModule,
    MessagingModule,
  ],
  providers: [PublisherService],
})
export class OutboxPublisherModule {}
