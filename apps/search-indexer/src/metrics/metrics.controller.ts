import { Controller, Get, Res } from '@nestjs/common';
import { MetricsService } from '@app/observability';
import type { Response } from 'express';

@Controller('metrics')
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  @Get()
  async metrics(@Res({ passthrough: true }) response: Response): Promise<string> {
    response.type(this.metricsService.contentType());
    return this.metricsService.metrics();
  }
}
