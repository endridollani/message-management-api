import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckResult, HealthCheckService } from '@nestjs/terminus';
import { RuntimeHealthIndicator } from '@app/observability';

@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly runtimeHealthIndicator: RuntimeHealthIndicator,
  ) {}

  @Get('liveness')
  @HealthCheck()
  liveness(): Promise<HealthCheckResult> {
    return this.health.check([() => this.runtimeHealthIndicator.isLive('api')]);
  }

  @Get('readiness')
  @HealthCheck()
  readiness(): Promise<HealthCheckResult> {
    return this.health.check([() => this.runtimeHealthIndicator.isReady('api')]);
  }
}
