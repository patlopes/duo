// `npm run release`: publishes a committed build to GitHub Pages, which is free and needs no server
// of ours. It goes to a separate branch so an ordinary push to main never reaches the phones, and
// the tree must be clean so every published version corresponds to a commit.
import { execFileSync, execSync } from 'node:child_process';
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';

const REMOTE = 'git@github.com:patlopes/duo.git';
const BRANCH = 'gh-pages';
const BASE = '/duo/';
const run = (command) => execSync(command, { encoding: 'utf8' }).trim();

if (run('git status --porcelain') !== '') {
  console.error('Há mudanças sem commit: a versão publicada não corresponderia a nenhum commit.');
  process.exit(1);
}

execSync('npm run build', { stdio: 'inherit', env: { ...process.env, DUO_BASE: BASE } });
execSync('npm run check:bundle', { stdio: 'inherit' });

const sha = run('git rev-parse --short HEAD');
const site = resolve('..', 'duo-release', 'pages');
mkdirSync(resolve(site, '..'), { recursive: true });

const git = (...args) => execFileSync('git', ['-C', site, ...args], { stdio: 'inherit' });
if (!existsSync(join(site, '.git'))) {
  mkdirSync(site, { recursive: true });
  execFileSync('git', ['init', '-q', '-b', BRANCH, site], { stdio: 'inherit' });
  git('remote', 'add', 'origin', REMOTE);
  // These commits are public and automated: they carry no personal or work e-mail.
  git('config', 'user.name', 'Meu Bem release');
  git('config', 'user.email', 'patlopes@users.noreply.github.com');
  git('config', 'commit.gpgsign', 'false');
}

for (const entry of readdirSync(site)) {
  if (entry !== '.git') rmSync(join(site, entry), { recursive: true });
}
cpSync('dist', site, { recursive: true });
// Pages has no SPA fallback: a deep link gets 404.html, which is the app itself.
copyFileSync(join(site, 'index.html'), join(site, '404.html'));
writeFileSync(join(site, '.nojekyll'), '');

git('add', '-A');
git('commit', '-q', '--allow-empty', '-m', `release ${sha}`);
git('push', '-q', '--force', 'origin', BRANCH);

console.log(`publicado: ${sha} em https://patlopes.github.io/duo/`);
