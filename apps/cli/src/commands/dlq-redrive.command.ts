import { Command, CommandRunner, Option } from 'nest-commander';

import { DlqRedriveService } from '../services/dlq-redrive.service';
import { parsePositiveInteger } from './option-parsers';

type DlqRedriveOptions = {
  confirm?: boolean;
  dryRun?: boolean;
  idleTimeoutMs?: number;
  limit?: number;
};

@Command({
  name: 'dlq:redrive',
  description: 'Consume message-created DLQ records and republish them to the main topic.',
})
export class DlqRedriveCommand extends CommandRunner {
  constructor(private readonly dlqRedrive: DlqRedriveService) {
    super();
  }

  override async run(_passedParams: string[], options: DlqRedriveOptions): Promise<void> {
    const dryRun = options.dryRun === true || options.confirm !== true;
    const result = await this.dlqRedrive.redrive({
      dryRun,
      idleTimeoutMs: options.idleTimeoutMs ?? 5_000,
      limit: options.limit ?? 100,
    });

    console.log(dryRun ? 'DLQ redrive dry-run' : 'DLQ redrive applied');
    console.log(`  consumed from DLQ: ${result.consumedCount}`);
    console.log(`  republished to main topic: ${result.republishedCount}`);
    console.log(`  committed offsets: ${result.committedCount}`);
    console.log(`  stop reason: ${result.stopReason}`);
  }

  @Option({
    flags: '--confirm',
    description: 'Apply the redrive. Without this flag the command only previews DLQ records.',
  })
  parseConfirm(): boolean {
    return true;
  }

  @Option({
    flags: '--dry-run',
    description: 'Consume without republishing or committing redrive offsets.',
  })
  parseDryRun(): boolean {
    return true;
  }

  @Option({
    flags: '--idle-timeout-ms <milliseconds>',
    description: 'Stop after this many milliseconds without seeing a DLQ record.',
  })
  parseIdleTimeoutMs(value: string): number {
    return parsePositiveInteger(value, '--idle-timeout-ms');
  }

  @Option({
    flags: '--limit <limit>',
    description: 'Maximum DLQ records to inspect or redrive.',
  })
  parseLimit(value: string): number {
    return parsePositiveInteger(value, '--limit');
  }
}
