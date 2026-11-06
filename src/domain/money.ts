const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const BRL_ROUND = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  maximumFractionDigits: 0,
});

/** Intl separates "R$" with a no-break space; a plain one keeps text searchable and testable. */
const normalize = (text: string) => text.replace(/\u00a0/g, ' ');

export function formatBRL(cents: number): string {
  return normalize(BRL.format(cents / 100));
}

/** For sentences, where centavos are noise: "R$ 1.234". */
export function formatBRLRound(cents: number): string {
  return normalize(BRL_ROUND.format(Math.round(cents / 100)));
}

/** 100000 / 3 → [33334, 33333, 33333]: the remainder goes to the first parts. */
export function splitEvenly(totalCents: number, parts: number): number[] {
  if (!Number.isInteger(parts) || parts < 1) throw new Error('parts must be a positive integer');
  const floor = Math.floor(totalCents / parts);
  const remainder = totalCents - floor * parts;
  return Array.from({ length: parts }, (_, i) => floor + (i < remainder ? 1 : 0));
}

/** Rounds one side and derives the other, so a centavo is never lost or created. */
export function splitByPct(totalCents: number, pctFirst: number): [number, number] {
  const first = Math.round(totalCents * pctFirst);
  return [first, totalCents - first];
}

export type KeypadKey = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '000' | 'back';

const MAX_CENTS = 99_999_999_999;

/** Bank-style entry: pressing 1, 2, 3, 4 reads R$ 12,34. */
export function pressKeypad(cents: number, key: KeypadKey): number {
  if (key === 'back') return Math.floor(cents / 10);
  const next = cents * (key === '000' ? 1000 : 10) + (key === '000' ? 0 : Number(key));
  return next > MAX_CENTS ? cents : next;
}

/**
 * Reads the amounts banks and spreadsheets write: "1.234,56", "1234.56", "-12,3", "R$ 10".
 * Returns signed cents, or null when the text is not a number.
 */
export function parseAmount(text: string): number | null {
  const cleaned = text.replace(/[^\d,.()-]/g, '');
  if (!/\d/.test(cleaned)) return null;
  const negative = cleaned.includes('-') || cleaned.startsWith('(');
  const digits = cleaned.replace(/[()-]/g, '');
  const lastComma = digits.lastIndexOf(',');
  const lastDot = digits.lastIndexOf('.');
  const separator = Math.max(lastComma, lastDot);
  let whole = digits;
  let fraction = '';
  // A lone separator followed by exactly 3 digits is a thousands mark: "1.234" is 1234 reais.
  const isDecimal =
    separator >= 0 && (digits.length - separator - 1 !== 3 || (lastComma >= 0 && lastDot >= 0));
  if (isDecimal) {
    whole = digits.slice(0, separator);
    fraction = digits.slice(separator + 1);
  }
  whole = whole.replace(/[,.]/g, '');
  if (fraction.length > 2) fraction = fraction.slice(0, 2);
  const value = Number(whole || '0') * 100 + Number(fraction.padEnd(2, '0') || '0');
  return negative ? -value : value;
}
