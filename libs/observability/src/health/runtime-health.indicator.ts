import { Injectable } from '@nestjs/common';
import { HealthIndicatorResult, HealthIndicatorService } from '@nestjs/terminus';

@Injectable()
export class RuntimeHealthIndicator {
  constructor(private readonly healthIndicatorService: HealthIndicatorService) {}

  isLive(runtime: string): HealthIndicatorResult<'process'> {
    return this.healthIndicatorService.check('process').up({
      runtime,
      uptimeSeconds: Math.round(process.uptime()),
    });
  }

  isReady(runtime: string, dependencies: string[] = []): HealthIndicatorResult<'runtime'> {
    return this.healthIndicatorService.check('runtime').up({
      dependencies,
      runtime,
    });
  }
}
