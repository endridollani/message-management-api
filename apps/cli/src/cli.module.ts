import { Module } from '@nestjs/common';

import { MessageManagementConfigModule } from '@app/config';

import { DlqRedriveCommand } from './commands/dlq-redrive.command';
import { EsReindexCommand } from './commands/es-reindex.command';
import { OutboxInspectCommand } from './commands/outbox-inspect.command';
import { OutboxRedriveCommand } from './commands/outbox-redrive.command';
import { DlqRedriveService } from './services/dlq-redrive.service';
import { EsReindexService } from './services/es-reindex.service';
import { OutboxMaintenanceService } from './services/outbox-maintenance.service';

@Module({
  imports: [MessageManagementConfigModule.forRuntime('cli')],
  providers: [
    DlqRedriveCommand,
    DlqRedriveService,
    EsReindexCommand,
    EsReindexService,
    OutboxInspectCommand,
    OutboxMaintenanceService,
    OutboxRedriveCommand,
  ],
})
export class CliModule {}
