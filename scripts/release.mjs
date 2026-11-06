// `npm run release`: publishes a committed build. Test builds in dist/ never reach the phones,
// and the switch is one atomic rename, so a request never sees a half-copied release.
import { execSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, renameSync, rmSync, symlinkSync } from 'node:fs';
import { resolve } from 'node:path';

const run = (command) => execSync(command, { encoding: 'utf8' }).trim();

if (run('git status --porcelain') !== '') {
  console.error('Há mudanças sem commit: a versão publicada não corresponderia a nenhum commit.');
  process.exit(1);
}

execSync('npm run build', { stdio: 'inherit' });
execSync('npm run check:bundle', { stdio: 'inherit' });

const sha = run('git rev-parse --short HEAD');
const releases = resolve('..', 'duo-release');
const target = resolve(releases, sha);
mkdirSync(releases, { recursive: true });
if (existsSync(target)) rmSync(target, { recursive: true });
cpSync('dist', target, { recursive: true });

const temporary = resolve(releases, `.current-${process.pid}`);
symlinkSync(sha, temporary);
renameSync(temporary, resolve(releases, 'current'));

console.log(`publicado: ${sha}`);
