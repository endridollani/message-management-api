import { Command, CommandRunner, Option } from 'nest-commander';

import { OutboxMaintenanceService } from '../services/outbox-maintenance.service';
import { parsePositiveInteger } from './option-parsers';

type OutboxInspectOptions = {
  failedLimit?: number;
};

@Command({
  name: 'outbox:inspect',
  description: 'Show outbox status counts, oldest pending age, and failed event summary.',
})
export class OutboxInspectCommand extends CommandRunner {
  constructor(private readonly outboxMaintenance: OutboxMaintenanceService) {
    super();
  }

  override async run(_passedParams: string[], options: OutboxInspectOptions): Promise<void> {
    const inspection = await this.outboxMaintenance.inspect({
      failedLimit: options.failedLimit ?? 10,
      now: new Date(),
    });

    const oldestPendingAge =
      inspection.oldestPendingAgeSeconds === undefined
        ? 'none'
        : `${inspection.oldestPendingAgeSeconds}s`;

    console.log('Outbox status counts');
    console.log(`  pending: ${inspection.counts.pending}`);
    console.log(`  publishing: ${inspection.counts.publishing}`);
    console.log(`  published: ${inspection.counts.published}`);
    console.log(`  failed: ${inspection.counts.failed}`);
    console.log(`Oldest pending age: ${oldestPendingAge}`);

    if (inspection.failedEvents.length === 0) {
      console.log('Failed events: none');
      return;
    }

    console.log('Failed events');
    for (const event of inspection.failedEvents) {
      console.log(
        [
          `  id=${event.id}`,
          `eventId=${event.eventId}`,
          `key=${event.key}`,
          `attempts=${event.attempts}`,
          `nextAttemptAt=${event.nextAttemptAt.toISOString()}`,
          `lastError=${event.lastError ?? 'none'}`,
        ].join(' '),
      );
    }
  }

  @Option({
    flags: '--failed-limit <limit>',
    description: 'Maximum failed events to include in the summary.',
  })
  parseFailedLimit(value: string): number {
    return parsePositiveInteger(value, '--failed-limit');
  }
}
