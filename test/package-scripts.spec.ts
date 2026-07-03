import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('package scripts', () => {
  it('starts the production API from the emitted Nest monorepo path', () => {
    const packageJson = JSON.parse(
      readFileSync(join(process.cwd(), 'package.json'), 'utf8'),
    ) as {
      scripts: Record<string, string>;
    };

    expect(packageJson.scripts['start:prod']).toBe(
      'node dist/apps/api/apps/api/src/main.js',
    );
  });
});
