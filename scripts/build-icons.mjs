// Renders the icon master with VectorCraft, then derives every size the PWA needs with sharp.
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';

const master = 'assets/icon/master.svg';
const outDir = 'public/icons';
const background = '#6E2F6B';
const rendered = join(tmpdir(), `duo-icon-${process.pid}.png`);

execFileSync('vectorcraft-cli', ['run', '--in', master, '--export', rendered], {
  stdio: ['ignore', 'ignore', 'inherit'],
});
mkdirSync(outDir, { recursive: true });

// Flattening matters: an alpha channel in a home screen icon shows up as black on iOS.
const flat = () => sharp(rendered).flatten({ background }).removeAlpha();

const sizes = [
  ['apple-touch-icon-180.png', 180],
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['favicon-64.png', 64],
];
for (const [name, size] of sizes) {
  await flat().resize(size, size).png({ compressionLevel: 9 }).toFile(join(outDir, name));
}

// Maskable icons get cropped to a circle, so the art shrinks into the 80% safe zone.
const inner = await flat().resize(410, 410).png().toBuffer();
await sharp({ create: { width: 512, height: 512, channels: 3, background } })
  .composite([{ input: inner, gravity: 'center' }])
  .png({ compressionLevel: 9 })
  .toFile(join(outDir, 'icon-maskable-512.png'));

// iOS shows these while launching; without them the app opens on a blank white screen.
const SPLASHES = [
  [1320, 2868],
  [1206, 2622],
  [1290, 2796],
  [1179, 2556],
  [1284, 2778],
  [1170, 2532],
  [1125, 2436],
  [1242, 2688],
  [828, 1792],
  [750, 1334],
];
mkdirSync('public/splash', { recursive: true });
const artSize = 300;
const art = await flat().resize(artSize, artSize).png().toBuffer();
const mask = Buffer.from(
  `<svg width="${artSize}" height="${artSize}"><rect width="${artSize}" height="${artSize}" rx="66" fill="#fff"/></svg>`,
);
const rounded = await sharp(art)
  .composite([{ input: mask, blend: 'dest-in' }])
  .png()
  .toBuffer();
for (const [width, height] of SPLASHES) {
  await sharp({ create: { width, height, channels: 3, background: '#F7F3EE' } })
    .composite([{ input: rounded, gravity: 'center' }])
    .png({ compressionLevel: 9 })
    .toFile(join('public/splash', `splash-${width}x${height}.png`));
}

rmSync(rendered, { force: true });
console.log(`icons written to ${outDir}`);
