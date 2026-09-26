/**
 * When is this due? Pure date generation from a Recurrence.
 *
 * Nothing is scheduled ahead of time. Cycles are computed on demand for any
 * window, so there is no "create next month's row" job to forget or double-run.
 */

import { addDays, daysInMonth, diffDays, ordinal, parts, toDay, ymd } from './dates';
import type { ISODate, Recurrence } from './types';

export interface Cycle {
  date: ISODate;
  /** 0-based index from the start date. */
  index: number;
}

function withinLimits(rec: Recurrence, index: number, date: ISODate): boolean {
  if (rec.count != null && index >= rec.count) return false;
  if (rec.until && date > rec.until) return false;
  return true;
}

/** The date of cycle `index`. */
export function cycleDate(rec: Recurrence, index: number): ISODate {
  const n = Math.max(1, Math.floor(rec.interval || 1));
  switch (rec.freq) {
    case 'once':
      return rec.start;
    case 'days':
      return addDays(rec.start, index * n);
    case 'weeks':
      return addDays(rec.start, index * 7 * n);
    case 'months': {
      const s = parts(rec.start);
      const total = s.m - 1 + index * n;
      const y = s.y + Math.floor(total / 12);
      const m = (total % 12) + 1;
      const last = daysInMonth(y, m);
      // "31st" in a 30-day month is the 30th, and February is the 28th/29th.
      const d = rec.eom ? last : Math.min(s.d, last);
      return ymd(y, m, d);
    }
    case 'years': {
      const s = parts(rec.start);
      const y = s.y + index * n;
      return ymd(y, s.m, Math.min(s.d, daysInMonth(y, s.m)));
    }
  }
}

/** A cycle index at or before the first cycle on/after `from`, cheaply. */
function firstIndexNear(rec: Recurrence, from: ISODate): number {
  const gap = diffDays(rec.start, from);
  if (gap <= 0) return 0;
  const n = Math.max(1, Math.floor(rec.interval || 1));
  switch (rec.freq) {
    case 'once':
      return 0;
    case 'days':
      return Math.max(0, Math.floor(gap / n) - 1);
    case 'weeks':
      return Math.max(0, Math.floor(gap / (7 * n)) - 1);
    case 'months':
      return Math.max(0, Math.floor(gap / (31 * n)) - 1);
    case 'years':
      return Math.max(0, Math.floor(gap / (366 * n)) - 1);
  }
}

/** Every cycle with from <= date <= to, in order. */
export function cyclesBetween(rec: Recurrence, from: ISODate, to: ISODate): Cycle[] {
  const out: Cycle[] = [];
  if (to < from) return out;
  if (rec.freq === 'once') {
    if (rec.start >= from && rec.start <= to && withinLimits(rec, 0, rec.start)) out.push({ date: rec.start, index: 0 });
    return out;
  }
  let i = firstIndexNear(rec, from);
  // Hard stop so a malformed rule can never spin.
  for (let guard = 0; guard < 5000; guard++, i++) {
    const date = cycleDate(rec, i);
    if (date > to) break;
    if (!withinLimits(rec, i, date)) break;
    if (date >= from) out.push({ date, index: i });
  }
  return out;
}

/** The first cycle on or after `from`, or null when the schedule has ended. */
export function nextCycle(rec: Recurrence, from: ISODate): Cycle | null {
  if (rec.freq === 'once') {
    return rec.start >= from && withinLimits(rec, 0, rec.start) ? { date: rec.start, index: 0 } : null;
  }
  let i = firstIndexNear(rec, from);
  for (let guard = 0; guard < 5000; guard++, i++) {
    const date = cycleDate(rec, i);
    if (!withinLimits(rec, i, date)) return null;
    if (date >= from) return { date, index: i };
  }
  return null;
}

/** Index of the cycle whose date is exactly `date`, or -1. */
export function indexOfDate(rec: Recurrence, date: ISODate): number {
  const hits = cyclesBetween(rec, date, date);
  return hits.length ? hits[0].index : -1;
}

/** The last cycle date, when the schedule is finite. */
export function lastCycle(rec: Recurrence): ISODate | null {
  if (rec.freq === 'once') return rec.start;
  if (rec.count != null) return cycleDate(rec, rec.count - 1);
  if (rec.until) {
    const all = cyclesBetween(rec, rec.start, rec.until);
    return all.length ? all[all.length - 1].date : null;
  }
  return null;
}

/** Human description: "Every month on the 5th", "Every 28 days", "Once". */
export function describe(rec: Recurrence): string {
  const n = Math.max(1, rec.interval || 1);
  const { d } = parts(rec.start);
  const tail = rec.count ? `, ${rec.count} times` : '';
  switch (rec.freq) {
    case 'once':
      return 'Once';
    case 'days':
      return n === 1 ? `Every day${tail}` : `Every ${n} days${tail}`;
    case 'weeks': {
      const wd = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][
        (((toDay(rec.start) + 4) % 7) + 7) % 7
      ];
      return n === 1 ? `Every ${wd}${tail}` : `Every ${n} weeks on ${wd}${tail}`;
    }
    case 'months': {
      const on = rec.eom ? 'the last day' : `the ${ordinal(d)}`;
      if (n === 1) return `Monthly on ${on}${tail}`;
      if (n === 3) return `Every quarter on ${on}${tail}`;
      if (n === 6) return `Every 6 months on ${on}${tail}`;
      return `Every ${n} months on ${on}${tail}`;
    }
    case 'years': {
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const { m } = parts(rec.start);
      return n === 1 ? `Yearly on ${d} ${months[m - 1]}${tail}` : `Every ${n} years on ${d} ${months[m - 1]}${tail}`;
    }
  }
}
