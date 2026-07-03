export { ElasticsearchHealthIndicator } from './elasticsearch-health.indicator';
export { EsMessageSearch, projectMessageDocument } from './es-message-search';
export { IndexManagerService } from './index-manager.service';
export { messagesV1IndexDefinition } from './mappings/messages-v1.mapping';
export {
  MESSAGES_INDEX_VERSION,
  MESSAGES_PHYSICAL_INDEX,
  MESSAGES_READ_ALIAS,
  MESSAGES_WRITE_ALIAS,
} from './search.constants';
export { SearchModule } from './search.module';
