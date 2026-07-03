import { Command, CommandRunner, Option } from 'nest-commander';

import { OutboxMaintenanceService } from '../services/outbox-maintenance.service';
import { parseCsvOption, parsePositiveInteger } from './option-parsers';

type OutboxRedriveOptions = {
  confirm?: boolean;
  dryRun?: boolean;
  eventIds?: string[];
  ids?: string[];
  limit?: number;
};

@Command({
  name: 'outbox:redrive',
  description: 'Reset selected failed outbox events to pending.',
})
export class OutboxRedriveCommand extends CommandRunner {
  constructor(private readonly outboxMaintenance: OutboxMaintenanceService) {
    super();
  }

  override async run(_passedParams: string[], options: OutboxRedriveOptions): Promise<void> {
    const dryRun = options.dryRun === true || options.confirm !== true;
    const selectorCount = (options.ids?.length ?? 0) + (options.eventIds?.length ?? 0);
    const limit = options.limit ?? (dryRun ? 20 : undefined);

    if (!dryRun && selectorCount === 0 && limit === undefined) {
      throw new Error('Pass --limit, --id, or --event-id with --confirm for outbox:redrive.');
    }

    const result = await this.outboxMaintenance.redriveFailed({
      dryRun,
      eventIds: options.eventIds ?? [],
      ids: options.ids ?? [],
      limit,
      now: new Date(),
    });

    console.log(dryRun ? 'Outbox redrive dry-run' : 'Outbox redrive applied');
    console.log(`  matched failed events: ${result.matchedCount}`);
    console.log(`  reset to pending: ${result.modifiedCount}`);

    if (result.events.length === 0) {
      console.log('  selected events: none');
      return;
    }

    console.log('  selected events:');
    for (const event of result.events) {
      console.log(
        [
          `    id=${event.id}`,
          `eventId=${event.eventId}`,
          `key=${event.key}`,
          `attempts=${event.attempts}`,
        ].join(' '),
      );
    }
  }

  @Option({
    flags: '--confirm',
    description: 'Apply the redrive. Without this flag the command only previews changes.',
  })
  parseConfirm(): boolean {
    return true;
  }

  @Option({
    flags: '--dry-run',
    description: 'Preview selected failed rows without updating MongoDB.',
  })
  parseDryRun(): boolean {
    return true;
  }

  @Option({
    flags: '--event-id <eventIds>',
    description: 'Comma-separated outbox eventId values to redrive.',
  })
  parseEventIds(value: string): string[] {
    return parseCsvOption(value, '--event-id');
  }

  @Option({
    flags: '--id <ids>',
    description: 'Comma-separated MongoDB outbox _id values to redrive.',
  })
  parseIds(value: string): string[] {
    return parseCsvOption(value, '--id');
  }

  @Option({
    flags: '--limit <limit>',
    description: 'Maximum failed events to select, ordered by oldest failed first.',
  })
  parseLimit(value: string): number {
    return parsePositiveInteger(value, '--limit');
  }
}
