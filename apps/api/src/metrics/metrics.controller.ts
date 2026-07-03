import { Controller, Get, Header, Res } from '@nestjs/common';
import { MetricsService } from '@app/observability';
import type { Response } from 'express';

import { Public } from '../auth/public.decorator';

@Public()
@Controller('metrics')
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  async metrics(@Res({ passthrough: true }) response: Response): Promise<string> {
    response.type(this.metricsService.contentType());
    return this.metricsService.metrics();
  }
}
