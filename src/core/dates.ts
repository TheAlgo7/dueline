/**
 * Calendar-day arithmetic.
 *
 * Due dates are days, not instants. They are handled as 'YYYY-MM-DD' strings
 * and converted to a day number (days since 1970-01-01, computed in UTC so no
 * local offset or DST can shift them) only to do maths. "Today" is always
 * asked of a specific timezone, because the reminder server runs in UTC and a
 * 9 AM reminder in Delhi is a 03:30 job there.
 */

import type { ISODate } from './types';

const MS_DAY = 86_400_000;

export function toDay(iso: ISODate): number {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  const d = Number(iso.slice(8, 10));
  return Math.round(Date.UTC(y, m - 1, d) / MS_DAY);
}

export function fromDay(n: number): ISODate {
  const dt = new Date(n * MS_DAY);
  const y = dt.getUTCFullYear();
  const m = dt.getUTCMonth() + 1;
  const d = dt.getUTCDate();
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function ymd(y: number, m: number, d: number): ISODate {
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function parts(iso: ISODate): { y: number; m: number; d: number } {
  return { y: Number(iso.slice(0, 4)), m: Number(iso.slice(5, 7)), d: Number(iso.slice(8, 10)) };
}

export function addDays(iso: ISODate, n: number): ISODate {
  return fromDay(toDay(iso) + n);
}

/** b minus a, in days. */
export function diffDays(a: ISODate, b: ISODate): number {
  return toDay(b) - toDay(a);
}

export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** 0 = Sunday. */
export function weekday(iso: ISODate): number {
  // 1970-01-01 was a Thursday.
  return (((toDay(iso) + 4) % 7) + 7) % 7;
}

export function isValidISODate(s: unknown): s is ISODate {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const { y, m, d } = parts(s);
  return m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m);
}

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function zoneFormatter(tz: string): Intl.DateTimeFormat {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    fmtCache.set(tz, f);
  }
  return f;
}

/** Wall-clock date and time in a timezone. */
export function zoned(tz: string, at: number = Date.now()): { date: ISODate; hour: number; minute: number } {
  let f: Intl.DateTimeFormat;
  try {
    f = zoneFormatter(tz);
  } catch {
    f = zoneFormatter('Asia/Kolkata');
  }
  const p = Object.fromEntries(f.formatToParts(new Date(at)).map((x) => [x.type, x.value]));
  const hour = Number(p.hour) % 24;
  return { date: `${p.year}-${p.month}-${p.day}`, hour, minute: Number(p.minute) };
}

export function todayIn(tz: string, at: number = Date.now()): ISODate {
  return zoned(tz, at).date;
}

/**
 * The UTC instant of a local wall-clock time. Guesses with the offset at that
 * moment, then corrects once, which is exact everywhere outside the skipped
 * hour of a DST jump.
 */
export function zonedToUtc(date: ISODate, hour: number, tz: string, minute = 0): number {
  const { y, m, d } = parts(date);
  const wall = Date.UTC(y, m - 1, d, hour, minute);
  const offsetAt = (t: number) => {
    const z = zoned(tz, t);
    const p = parts(z.date);
    return Date.UTC(p.y, p.m - 1, p.d, z.hour, z.minute) - t;
  };
  let t = wall - offsetAt(wall);
  t = wall - offsetAt(t);
  return t;
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Browser timezone, defaulting to India. */
export function deviceTimeZone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return tz && isValidTimeZone(tz) ? tz : 'Asia/Kolkata';
  } catch {
    return 'Asia/Kolkata';
  }
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const monthName = (m: number, long = false) => (long ? MONTHS_LONG : MONTHS)[m - 1];
export const dayName = (wd: number, long = false) => (long ? DAYS_LONG : DAYS)[wd];

/** "4 Oct" */
export function shortDate(iso: ISODate): string {
  const { m, d } = parts(iso);
  return `${d} ${MONTHS[m - 1]}`;
}

/** "Sat, 4 Oct" (adds the year when it differs from `today`'s). */
export function mediumDate(iso: ISODate, today?: ISODate): string {
  const { y, m, d } = parts(iso);
  const yearPart = today && parts(today).y !== y ? ` ${y}` : '';
  return `${DAYS[weekday(iso)]}, ${d} ${MONTHS[m - 1]}${yearPart}`;
}

/** "Saturday, 26 September" */
export function longDate(iso: ISODate): string {
  const { m, d } = parts(iso);
  return `${DAYS_LONG[weekday(iso)]}, ${d} ${MONTHS_LONG[m - 1]}`;
}

/** Relative phrasing for a due date: "Today", "Tomorrow", "In 5 days", "2 days late". */
export function relative(daysLeft: number): string {
  if (daysLeft === 0) return 'Today';
  if (daysLeft === 1) return 'Tomorrow';
  if (daysLeft === -1) return 'Yesterday';
  if (daysLeft > 1) return `In ${daysLeft} days`;
  return `${-daysLeft} days late`;
}

/** "9 AM", "8 PM", "12 PM" */
export function hourLabel(h: number): string {
  const suffix = h < 12 ? 'AM' : 'PM';
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh} ${suffix}`;
}

export function ordinal(n: number): string {
  const s = n % 100;
  if (s >= 11 && s <= 13) return `${n}th`;
  switch (n % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}
