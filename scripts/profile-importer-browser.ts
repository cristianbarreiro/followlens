import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const cli = resolve('node_modules/@playwright/test/cli.js');
const result = spawnSync(
  process.execPath,
  [
    cli,
    'test',
    '--config=playwright.browser-benchmark.config.ts',
    '--grep',
    'measures medium synthetic relationship import|measures a valid import at the cumulative 30 MiB boundary',
    '--repeat-each=2',
  ],
  {
    env: { ...process.env, FOLLOWLENS_CPU_PROFILE: '1' },
    stdio: 'inherit',
  },
);

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
