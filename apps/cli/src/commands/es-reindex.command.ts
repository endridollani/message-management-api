import { Command, CommandRunner, Option } from 'nest-commander';

import { EsReindexService } from '../services/es-reindex.service';

type EsReindexOptions = {
  confirm?: boolean;
  dryRun?: boolean;
  to?: string;
};

@Command({
  name: 'es:reindex',
  description: 'Create a versioned messages index, reindex, verify counts, and swap aliases.',
})
export class EsReindexCommand extends CommandRunner {
  constructor(private readonly esReindex: EsReindexService) {
    super();
  }

  override async run(_passedParams: string[], options: EsReindexOptions): Promise<void> {
    const dryRun = options.dryRun === true || options.confirm !== true;
    const result = await this.esReindex.reindex({
      dryRun,
      targetIndex: options.to,
    });

    console.log(dryRun ? 'Elasticsearch reindex dry-run' : 'Elasticsearch reindex applied');
    console.log(`  source read alias indices: ${result.sourceIndices.join(', ')}`);
    console.log(`  previous write alias indices: ${result.previousWriteIndices.join(', ')}`);
    console.log(`  target index: ${result.targetIndex}`);
    console.log(`  source count: ${result.sourceCount}`);
    console.log(`  target count: ${result.targetCount ?? 'not created'}`);
    console.log(`  aliases swapped: ${result.aliasesSwapped ? 'yes' : 'no'}`);
    console.log('  old index retained for rollback: yes');
  }

  @Option({
    flags: '--confirm',
    description: 'Apply the reindex and alias swap. Without this flag the command is a dry-run.',
  })
  parseConfirm(): boolean {
    return true;
  }

  @Option({
    flags: '--dry-run',
    description: 'Preview the target index and alias actions without changing Elasticsearch.',
  })
  parseDryRun(): boolean {
    return true;
  }

  @Option({
    flags: '--to <versionOrIndex>',
    description: 'Target version or index name, for example v2, 2, or messages-v2.',
  })
  parseTo(value: string): string {
    return value.trim();
  }
}
