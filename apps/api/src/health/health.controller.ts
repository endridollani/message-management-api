import { Controller, Get } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { HealthCheck, HealthCheckResult, HealthCheckService } from '@nestjs/terminus';
import { RuntimeHealthIndicator } from '@app/observability';
import { MongoHealthIndicator } from '@app/persistence';
import { ElasticsearchHealthIndicator } from '@app/search';

import { Public } from '../auth/public.decorator';

@Public()
@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly runtimeHealthIndicator: RuntimeHealthIndicator,
    private readonly mongoHealthIndicator: MongoHealthIndicator,
    private readonly elasticsearchHealthIndicator: ElasticsearchHealthIndicator,
  ) {}

  @Get('liveness')
  @HealthCheck()
  @ApiOperation({ summary: 'Report API process liveness' })
  @ApiOkResponse({
    description: 'The API process is live.',
    schema: {
      example: {
        status: 'ok',
        info: { process: { status: 'up' } },
        error: {},
        details: { process: { status: 'up' } },
      },
    },
  })
  liveness(): Promise<HealthCheckResult> {
    return this.health.check([() => this.runtimeHealthIndicator.isLive('api')]);
  }

  @Get('readiness')
  @HealthCheck()
  @ApiOperation({
    summary: 'Report API readiness',
    description: 'Checks runtime, MongoDB, and Elasticsearch read-alias readiness.',
  })
  @ApiOkResponse({
    description: 'The API runtime and required dependencies are ready.',
    schema: {
      example: {
        status: 'ok',
        info: {
          runtime: {
            status: 'up',
            runtime: 'api',
            dependencies: ['mongodb', 'elasticsearch'],
          },
          mongodb: { status: 'up', readyState: 1 },
          elasticsearch: { status: 'up', alias: 'messages-read' },
        },
        error: {},
        details: {
          runtime: {
            status: 'up',
            runtime: 'api',
            dependencies: ['mongodb', 'elasticsearch'],
          },
          mongodb: { status: 'up', readyState: 1 },
          elasticsearch: { status: 'up', alias: 'messages-read' },
        },
      },
    },
  })
  @ApiServiceUnavailableResponse({
    description: 'One or more required readiness checks failed.',
  })
  readiness(): Promise<HealthCheckResult> {
    return this.health.check([
      () => this.runtimeHealthIndicator.isReady('api', ['mongodb', 'elasticsearch']),
      () => this.mongoHealthIndicator.isReady(),
      () => this.elasticsearchHealthIndicator.isReadReady(),
    ]);
  }
}
