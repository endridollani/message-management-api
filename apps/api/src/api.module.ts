import { Module } from '@nestjs/common';
import { MessageManagementConfigModule } from '@app/config';
import { ObservabilityModule } from '@app/observability';

import { HealthController } from './health/health.controller';
import { MetricsController } from './metrics/metrics.controller';

@Module({
  controllers: [HealthController, MetricsController],
  imports: [MessageManagementConfigModule.forRuntime('api'), ObservabilityModule],
})
export class ApiModule {}
