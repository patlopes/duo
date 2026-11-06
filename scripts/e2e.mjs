// `npm run e2e`: uses the shared browser folder on this machine when it exists, so the small root
// disk stays free. Elsewhere (CI) Playwright falls back to its default location.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const shared = resolve('..', 'tools/playwright/browsers');
const env = { ...process.env };
if (!env.PLAYWRIGHT_BROWSERS_PATH && existsSync(shared)) env.PLAYWRIGHT_BROWSERS_PATH = shared;

const { status } = spawnSync('npx', ['playwright', 'test', ...process.argv.slice(2)], {
  stdio: 'inherit',
  env,
});
process.exit(status ?? 1);
