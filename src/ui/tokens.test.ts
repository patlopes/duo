import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const css = readFileSync(resolve(__dirname, 'tokens.css'), 'utf8');

function block(selector: string): Record<string, string> {
  const start = css.indexOf(selector);
  if (start < 0) throw new Error(`missing block ${selector}`);
  const open = css.indexOf('{', start);
  const close = css.indexOf('}', open);
  const out: Record<string, string> = {};
  for (const [, name, value] of css.slice(open + 1, close).matchAll(/(--[\w-]+):\s*([^;]+);/g)) {
    out[name!] = value!.trim();
  }
  return out;
}

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const light = block(':root {\n  color-scheme: light;');
const dark = block(":root[data-theme='dark']");

describe.each([
  ['claro', light],
  ['escuro', dark],
])('contraste AA no modo %s', (_mode, t) => {
  const textTokens = [
    '--color-text',
    '--color-text-secondary',
    '--color-primary',
    '--text-expense',
    '--text-income',
    '--text-transfer',
    '--text-warning',
    '--text-member-a',
    '--text-member-b',
  ];

  it.each(textTokens)('%s sobre fundo e superfícies', (token) => {
    for (const bg of ['--color-bg', '--color-surface', '--color-surface-2']) {
      expect(contrast(t[token]!, t[bg]!), `${token} sobre ${bg}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it.each([
    ['--color-bg', '--color-bg-rgb'],
    ['--color-text', '--color-text-rgb'],
  ])('%s e %s descrevem a mesma cor', (hexToken, rgbToken) => {
    const n = parseInt(t[hexToken]!.slice(1), 16);
    expect(t[rgbToken]).toBe(`${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`);
  });

  it('texto sobre a cor primária', () => {
    expect(contrast(t['--color-on-primary']!, t['--color-primary']!)).toBeGreaterThanOrEqual(4.5);
  });
});

it('o bloco escuro por preferência do sistema é igual ao do override manual', () => {
  expect(block(":root:not([data-theme='light'])")).toEqual(dark);
});
