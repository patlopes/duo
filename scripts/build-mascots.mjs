// `npm run mascots`: draws the giraffe and the little monkey as vectors, renders them with VectorCraft
// and optimizes them with sharp. Poses are parameters of one drawing, so they always stay on model.
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';

const INK = '#3B2A33';
const W = 400;
const H = 460;

const svg = (body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${body}</svg>`;

function eye(cx, cy, r, mood, side) {
  if (mood === 'cheer' || (mood === 'wink' && side === 'right')) {
    return `<path d="M${cx - r} ${cy + 4} Q${cx} ${cy - r} ${cx + r} ${cy + 4}" fill="none" stroke="${INK}" stroke-width="8" stroke-linecap="round"/>`;
  }
  const pupil = mood === 'worried' ? r * 0.62 : r * 0.72;
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#fff"/><circle cx="${cx}" cy="${cy + 2}" r="${pupil}" fill="${INK}"/><circle cx="${cx + r * 0.28}" cy="${cy - r * 0.28}" r="${r * 0.26}" fill="#fff"/>`;
}

function brows(left, right, y, mood) {
  if (mood !== 'worried') return '';
  return `<path d="M${left - 22} ${y} L${left + 18} ${y - 14}" stroke="${INK}" stroke-width="7" stroke-linecap="round"/><path d="M${right + 22} ${y} L${right - 18} ${y - 14}" stroke="${INK}" stroke-width="7" stroke-linecap="round"/>`;
}

function mouth(cx, cy, mood) {
  if (mood === 'cheer') {
    return `<path d="M${cx - 30} ${cy - 6} Q${cx} ${cy + 44} ${cx + 30} ${cy - 6} Z" fill="#8E2F4B"/><path d="M${cx - 16} ${cy + 12} Q${cx} ${cy + 34} ${cx + 16} ${cy + 12} Q${cx} ${cy + 20} ${cx - 16} ${cy + 12} Z" fill="#F28FA6"/>`;
  }
  if (mood === 'worried') {
    return `<path d="M${cx - 22} ${cy + 8} Q${cx - 11} ${cy - 6} ${cx} ${cy + 6} T${cx + 22} ${cy + 2}" fill="none" stroke="${INK}" stroke-width="7" stroke-linecap="round"/>`;
  }
  return `<path d="M${cx - 26} ${cy} Q${cx} ${cy + 26} ${cx + 26} ${cy}" fill="none" stroke="${INK}" stroke-width="7" stroke-linecap="round"/>`;
}

function extras(mood) {
  if (mood === 'cheer') {
    const star = (x, y, s, c) =>
      `<path d="M${x} ${y - s} L${x + s * 0.28} ${y - s * 0.28} L${x + s} ${y} L${x + s * 0.28} ${y + s * 0.28} L${x} ${y + s} L${x - s * 0.28} ${y + s * 0.28} L${x - s} ${y} L${x - s * 0.28} ${y - s * 0.28} Z" fill="${c}"/>`;
    return (
      star(52, 90, 22, '#F5A524') +
      star(352, 62, 26, '#E87BA4') +
      star(350, 240, 15, '#1BAF7A') +
      star(40, 250, 13, '#2A78D6')
    );
  }
  if (mood === 'worried') {
    return `<path d="M340 34 C328 56 322 66 322 78 A18 18 0 0 0 358 78 C358 66 352 56 340 34 Z" fill="#7CC4F2"/>`;
  }
  return '';
}

function giraffe(mood) {
  const body = '#F7C24F';
  const spot = '#C97B2A';
  const pale = '#FDE9C4';
  const horn = '#E9A93A';
  return svg(`
    ${extras(mood)}
    <path d="M150 300 C146 360 138 420 128 460 L272 460 C262 420 254 360 250 300 Z" fill="${body}"/>
    <ellipse cx="172" cy="352" rx="17" ry="21" fill="${spot}"/>
    <ellipse cx="226" cy="392" rx="20" ry="24" fill="${spot}"/>
    <ellipse cx="166" cy="430" rx="19" ry="17" fill="${spot}"/>
    <ellipse cx="228" cy="326" rx="12" ry="14" fill="${spot}"/>
    <rect x="146" y="46" width="20" height="74" rx="10" fill="${horn}" transform="rotate(-8 156 80)"/>
    <rect x="234" y="46" width="20" height="74" rx="10" fill="${horn}" transform="rotate(8 244 80)"/>
    <circle cx="150" cy="44" r="19" fill="${spot}"/>
    <circle cx="250" cy="44" r="19" fill="${spot}"/>
    <ellipse cx="74" cy="150" rx="46" ry="21" fill="${body}" transform="rotate(${mood === 'cheer' ? -34 : mood === 'worried' ? 18 : -14} 74 150)"/>
    <ellipse cx="74" cy="150" rx="26" ry="10" fill="#F2A29A" transform="rotate(${mood === 'cheer' ? -34 : mood === 'worried' ? 18 : -14} 74 150)"/>
    <ellipse cx="326" cy="150" rx="46" ry="21" fill="${body}" transform="rotate(${mood === 'cheer' ? 34 : mood === 'worried' ? -18 : 14} 326 150)"/>
    <ellipse cx="326" cy="150" rx="26" ry="10" fill="#F2A29A" transform="rotate(${mood === 'cheer' ? 34 : mood === 'worried' ? -18 : 14} 326 150)"/>
    <path d="M200 76 C276 76 300 130 296 192 C292 262 256 312 200 312 C144 312 108 262 104 192 C100 130 124 76 200 76 Z" fill="${body}"/>
    <ellipse cx="136" cy="118" rx="14" ry="18" fill="${spot}" transform="rotate(20 136 118)"/>
    <ellipse cx="268" cy="112" rx="11" ry="15" fill="${spot}" transform="rotate(-20 268 112)"/>
    <ellipse cx="200" cy="96" rx="15" ry="11" fill="${spot}"/>
    <path d="M200 192 C262 192 276 226 270 256 C262 296 232 312 200 312 C168 312 138 296 130 256 C124 226 138 192 200 192 Z" fill="${pale}"/>
    ${eye(156, 158, 25, mood, 'left')}
    ${eye(244, 158, 25, mood, 'right')}
    ${brows(156, 244, 122, mood)}
    <circle cx="180" cy="222" r="6.5" fill="${INK}"/>
    <circle cx="220" cy="222" r="6.5" fill="${INK}"/>
    ${mouth(200, 252, mood)}
    <circle cx="124" cy="222" r="17" fill="#F2A29A" opacity=".6"/>
    <circle cx="276" cy="222" r="17" fill="#F2A29A" opacity=".6"/>
  `);
}

function monkey(mood) {
  const fur = '#8F5B3D';
  const dark = '#6E4329';
  const face = '#F3D3AE';
  const arm = (d) =>
    `<path d="${d}" fill="none" stroke="${fur}" stroke-width="34" stroke-linecap="round"/>`;
  const hand = (x, y) => `<circle cx="${x}" cy="${y}" r="21" fill="${face}"/>`;
  let arms;
  if (mood === 'cheer') {
    arms =
      arm('M142 338 Q86 300 74 214') +
      hand(72, 204) +
      arm('M258 338 Q314 300 326 214') +
      hand(328, 204);
  } else if (mood === 'worried') {
    arms =
      arm('M146 340 Q92 300 112 232') +
      hand(116, 224) +
      arm('M254 340 Q308 300 288 232') +
      hand(284, 224);
  } else {
    arms =
      arm('M146 342 Q100 368 96 410') +
      hand(96, 416) +
      arm('M258 338 Q322 306 338 226') +
      hand(340, 214);
  }
  return svg(`
    ${extras(mood)}
    <path d="M272 416 C352 436 388 376 356 332 C340 310 306 322 316 348" fill="none" stroke="${dark}" stroke-width="20" stroke-linecap="round"/>
    <ellipse cx="200" cy="360" rx="86" ry="92" fill="${fur}"/>
    <ellipse cx="200" cy="376" rx="55" ry="64" fill="${face}"/>
    <ellipse cx="156" cy="440" rx="42" ry="20" fill="${dark}"/>
    <ellipse cx="244" cy="440" rx="42" ry="20" fill="${dark}"/>
    ${arms}
    <circle cx="74" cy="150" r="42" fill="${fur}"/>
    <circle cx="74" cy="150" r="24" fill="${face}"/>
    <circle cx="326" cy="150" r="42" fill="${fur}"/>
    <circle cx="326" cy="150" r="24" fill="${face}"/>
    <circle cx="200" cy="146" r="122" fill="${fur}"/>
    <path d="M200 62 C232 62 240 82 240 92 C268 82 298 108 296 150 C294 216 254 250 200 250 C146 250 106 216 104 150 C102 108 132 82 160 92 C160 82 168 62 200 62 Z" fill="${face}"/>
    ${eye(158, 142, 25, mood, 'left')}
    ${eye(242, 142, 25, mood, 'right')}
    ${brows(158, 242, 104, mood)}
    <ellipse cx="200" cy="184" rx="11" ry="8" fill="${dark}"/>
    ${mouth(200, 204, mood)}
    <circle cx="128" cy="186" r="17" fill="#EE9A8B" opacity=".6"/>
    <circle cx="272" cy="186" r="17" fill="#EE9A8B" opacity=".6"/>
  `);
}

const POSES = ['happy', 'cheer', 'worried', 'wink'];
const sourceDir = 'assets/mascots';
const outDir = 'public/mascots';
const work = join(tmpdir(), `duo-mascots-${process.pid}`);
mkdirSync(sourceDir, { recursive: true });
mkdirSync(outDir, { recursive: true });
mkdirSync(work, { recursive: true });

for (const [name, draw] of [
  ['giraffe', giraffe],
  ['monkey', monkey],
]) {
  for (const pose of POSES) {
    const file = `${name}-${pose}`;
    const source = join(sourceDir, `${file}.svg`);
    writeFileSync(source, draw(pose));
    const png = join(work, `${file}.png`);
    execFileSync('vectorcraft-cli', ['run', '--in', source, '--export', png, '--scale', '1.5'], {
      stdio: ['ignore', 'ignore', 'inherit'],
    });
    await sharp(png)
      .webp({ quality: 88, alphaQuality: 90 })
      .toFile(join(outDir, `${file}.webp`));
  }
}
rmSync(work, { recursive: true, force: true });
console.log(`mascots written to ${outDir}`);
