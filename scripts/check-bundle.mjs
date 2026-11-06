// Fails when what a first visit must download exceeds the spec's budget (section 9).
// Counts the entry script, its modulepreloads and the entry stylesheets; lazy chunks do not count.
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const BUDGET_KB = 250;
const dist = 'dist';
const html = readFileSync(join(dist, 'index.html'), 'utf8');

const assets = [...html.matchAll(/(?:src|href)="\/(assets\/[^"]+\.(?:js|css))"/g)].map((m) => m[1]);
const unique = [...new Set(assets)];
if (unique.length === 0) throw new Error('No entry assets found in dist/index.html');

let total = 0;
for (const asset of unique) {
  const path = join(dist, asset);
  const gzipped = gzipSync(readFileSync(path), { level: 9 }).length;
  total += gzipped;
  console.log(
    `${(gzipped / 1024).toFixed(1).padStart(8)} KB gzip  ${(statSync(path).size / 1024).toFixed(0).padStart(6)} KB raw  ${asset}`,
  );
}

const totalKb = total / 1024;
console.log(`${totalKb.toFixed(1).padStart(8)} KB gzip  total inicial (limite ${BUDGET_KB} KB)`);
if (totalKb > BUDGET_KB) {
  console.error('Orçamento de bundle estourado.');
  process.exit(1);
}
