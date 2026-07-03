import { Controller, Get, Header, Res } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import { MetricsService } from '@app/observability';
import type { Response } from 'express';

import { Public } from '../auth/public.decorator';

@Public()
@ApiTags('Metrics')
@Controller('metrics')
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Render API Prometheus metrics' })
  @ApiProduces('text/plain')
  @ApiOkResponse({
    description: 'Prometheus text exposition format.',
    content: {
      'text/plain': {
        example:
          '# HELP message_management_process_cpu_user_seconds_total Total user CPU time spent in seconds.\n# TYPE message_management_process_cpu_user_seconds_total counter\nmessage_management_process_cpu_user_seconds_total 0.123\n',
        schema: { type: 'string' },
      },
    },
  })
  async metrics(@Res({ passthrough: true }) response: Response): Promise<string> {
    response.type(this.metricsService.contentType());
    return this.metricsService.metrics();
  }
}
