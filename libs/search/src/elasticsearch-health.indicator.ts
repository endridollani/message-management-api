import { Injectable } from '@nestjs/common';
import { ElasticsearchService } from '@nestjs/elasticsearch';
import { HealthCheckError, HealthIndicatorResult, HealthIndicatorService } from '@nestjs/terminus';

import { MESSAGES_READ_ALIAS, MESSAGES_WRITE_ALIAS } from './search.constants';

@Injectable()
export class ElasticsearchHealthIndicator {
  constructor(
    private readonly elasticsearch: ElasticsearchService,
    private readonly healthIndicatorService: HealthIndicatorService,
  ) {}

  isReadReady(): Promise<HealthIndicatorResult<'elasticsearch'>> {
    return this.checkAlias(MESSAGES_READ_ALIAS);
  }

  isWriteReady(): Promise<HealthIndicatorResult<'elasticsearch'>> {
    return this.checkAlias(MESSAGES_WRITE_ALIAS);
  }

  private async checkAlias(alias: string): Promise<HealthIndicatorResult<'elasticsearch'>> {
    const indicator = this.healthIndicatorService.check('elasticsearch');

    try {
      await this.elasticsearch.ping();
      const exists = await this.elasticsearch.indices.existsAlias({ name: alias });

      if (!exists) {
        throw new Error(`Alias ${alias} does not exist`);
      }

      return indicator.up({ alias });
    } catch (error) {
      throw new HealthCheckError(
        'Elasticsearch is not ready',
        indicator.down({
          alias,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }
}
