import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ElasticsearchModule } from '@nestjs/elasticsearch';

import { MESSAGE_SEARCH } from '@app/domain';

import { ElasticsearchHealthIndicator } from './elasticsearch-health.indicator';
import { EsMessageSearch } from './es-message-search';
import { IndexManagerService } from './index-manager.service';

@Module({
  exports: [
    MESSAGE_SEARCH,
    ElasticsearchHealthIndicator,
    ElasticsearchModule,
    EsMessageSearch,
    IndexManagerService,
  ],
  imports: [
    ConfigModule,
    ElasticsearchModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        node: configService.getOrThrow<string>('elasticsearch.node'),
      }),
    }),
  ],
  providers: [
    ElasticsearchHealthIndicator,
    EsMessageSearch,
    IndexManagerService,
    {
      provide: MESSAGE_SEARCH,
      useExisting: EsMessageSearch,
    },
  ],
})
export class SearchModule {}
