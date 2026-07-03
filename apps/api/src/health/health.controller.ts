import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckResult, HealthCheckService } from '@nestjs/terminus';
import { RuntimeHealthIndicator } from '@app/observability';
import { MongoHealthIndicator } from '@app/persistence';

import { Public } from '../auth/public.decorator';

@Public()
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly runtimeHealthIndicator: RuntimeHealthIndicator,
    private readonly mongoHealthIndicator: MongoHealthIndicator,
  ) {}

  @Get('liveness')
  @HealthCheck()
  liveness(): Promise<HealthCheckResult> {
    return this.health.check([() => this.runtimeHealthIndicator.isLive('api')]);
  }

  @Get('readiness')
  @HealthCheck()
  readiness(): Promise<HealthCheckResult> {
    return this.health.check([
      () => this.runtimeHealthIndicator.isReady('api', ['mongodb']),
      () => this.mongoHealthIndicator.isReady(),
    ]);
  }
}
