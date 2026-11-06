/** Dates stay as `YYYY-MM-DD` strings: they sort correctly and never shift across time zones. */

export function toDay(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function today(): string {
  return toDay(new Date());
}

export function monthOf(day: string): string {
  return day.slice(0, 7);
}

function split(month: string): [number, number] {
  return [Number(month.slice(0, 4)), Number(month.slice(5, 7))];
}

export function addMonths(month: string, delta: number): string {
  const [y, m] = split(month);
  const index = y * 12 + (m - 1) + delta;
  const year = Math.floor(index / 12);
  return `${year}-${String(index - year * 12 + 1).padStart(2, '0')}`;
}

/** Whole months from `from` to `to`; negative when `to` comes first. */
export function monthDiff(from: string, to: string): number {
  const [y1, m1] = split(from);
  const [y2, m2] = split(to);
  return (y2 - y1) * 12 + (m2 - m1);
}

export function daysInMonth(month: string): number {
  const [y, m] = split(month);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Day 31 in a 30-day month lands on the 30th. */
export function dayInMonth(month: string, day: number): string {
  return `${month}-${String(Math.min(day, daysInMonth(month))).padStart(2, '0')}`;
}

export function addDays(day: string, delta: number): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

export function dayNumber(day: string): number {
  return Number(day.slice(8, 10));
}

export function lastDayOf(month: string): string {
  return dayInMonth(month, 31);
}

const utc = (day: string) => new Date(`${day}T12:00:00Z`);

const MONTH_FMT = new Intl.DateTimeFormat('pt-BR', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});
const MONTH_NAME_FMT = new Intl.DateTimeFormat('pt-BR', { month: 'long', timeZone: 'UTC' });
const MONTH_SHORT_FMT = new Intl.DateTimeFormat('pt-BR', { month: 'short', timeZone: 'UTC' });
const DAY_FMT = new Intl.DateTimeFormat('pt-BR', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});
const SHORT_DAY_FMT = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: 'short',
  timeZone: 'UTC',
});

/** "novembro de 2026" */
export function monthLabel(month: string): string {
  return MONTH_FMT.format(utc(`${month}-15`));
}

/** "novembro" */
export function monthName(month: string): string {
  return MONTH_NAME_FMT.format(utc(`${month}-15`));
}

/** "nov" */
export function monthShort(month: string): string {
  return MONTH_SHORT_FMT.format(utc(`${month}-15`)).replace('.', '');
}

/** "Hoje", "Ontem" or "ter., 3 de nov." */
export function dayLabel(day: string, now: string = today()): string {
  if (day === now) return 'Hoje';
  if (day === addDays(now, -1)) return 'Ontem';
  if (day === addDays(now, 1)) return 'Amanhã';
  return DAY_FMT.format(utc(day));
}

/** "03 de nov." */
export function shortDay(day: string): string {
  return SHORT_DAY_FMT.format(utc(day));
}

export function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let m = from; m <= to; m = addMonths(m, 1)) out.push(m);
  return out;
}
