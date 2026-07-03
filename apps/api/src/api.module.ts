import { Module } from '@nestjs/common';
import { MessageManagementConfigModule } from '@app/config';
import { ObservabilityModule } from '@app/observability';
import { PersistenceModule } from '@app/persistence';

import { AuthModule } from './auth/auth.module';
import { HealthController } from './health/health.controller';
import { MessagesModule } from './messages/messages.module';
import { MetricsController } from './metrics/metrics.controller';

@Module({
  controllers: [HealthController, MetricsController],
  imports: [
    MessageManagementConfigModule.forRuntime('api'),
    ObservabilityModule,
    AuthModule,
    PersistenceModule,
    MessagesModule,
  ],
})
export class ApiModule {}
