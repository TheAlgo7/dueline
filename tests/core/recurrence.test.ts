import { describe as suite, expect, it } from 'vitest';
import { cyclesBetween, describe, lastCycle, nextCycle } from '../../src/core/recurrence';
import { weekday, zonedToUtc, todayIn, relative } from '../../src/core/dates';
import type { Recurrence } from '../../src/core/types';

const dates = (rec: Recurrence, from: string, to: string) => cyclesBetween(rec, from, to).map((c) => c.date);

suite('monthly', () => {
  it('clamps the 31st to short months and returns to the 31st', () => {
    expect(dates({ freq: 'months', interval: 1, start: '2026-01-31' }, '2026-01-01', '2026-05-31')).toEqual([
      '2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31',
    ]);
  });

  it('end of month stays on the last day', () => {
    expect(dates({ freq: 'months', interval: 1, start: '2026-02-28', eom: true }, '2026-02-01', '2026-04-30')).toEqual([
      '2026-02-28', '2026-03-31', '2026-04-30',
    ]);
  });

  it('every quarter crosses the year', () => {
    expect(dates({ freq: 'months', interval: 3, start: '2026-11-15' }, '2026-01-01', '2027-12-31')).toEqual([
      '2026-11-15', '2027-02-15', '2027-05-15', '2027-08-15', '2027-11-15',
    ]);
  });

  it('nothing exists before the start date', () => {
    expect(dates({ freq: 'months', interval: 1, start: '2026-10-01' }, '2026-06-01', '2026-10-15')).toEqual(['2026-10-01']);
  });
});

suite('other frequencies', () => {
  it('every 28 days, like a prepaid recharge', () => {
    expect(dates({ freq: 'days', interval: 28, start: '2026-09-01' }, '2026-09-01', '2026-11-30')).toEqual([
      '2026-09-01', '2026-09-29', '2026-10-27', '2026-11-24',
    ]);
  });

  it('weekly', () => {
    const d = dates({ freq: 'weeks', interval: 1, start: '2026-09-26' }, '2026-09-20', '2026-10-12');
    expect(d).toEqual(['2026-09-26', '2026-10-03', '2026-10-10']);
    expect(d.every((x) => weekday(x) === 6)).toBe(true);
  });

  it('yearly on 29 Feb falls back to the 28th', () => {
    expect(dates({ freq: 'years', interval: 1, start: '2028-02-29' }, '2028-01-01', '2032-12-31')).toEqual([
      '2028-02-29', '2029-02-28', '2030-02-28', '2031-02-28', '2032-02-29',
    ]);
  });

  it('once', () => {
    const rec: Recurrence = { freq: 'once', interval: 1, start: '2026-10-04' };
    expect(dates(rec, '2026-10-01', '2026-10-31')).toEqual(['2026-10-04']);
    expect(dates(rec, '2026-10-05', '2026-10-31')).toEqual([]);
    expect(nextCycle(rec, '2026-10-05')).toBeNull();
  });

  it('a long daily schedule still finds a window years later', () => {
    const d = dates({ freq: 'days', interval: 1, start: '2000-01-01' }, '2026-09-26', '2026-09-28');
    expect(d).toEqual(['2026-09-26', '2026-09-27', '2026-09-28']);
  });
});

suite('limits', () => {
  it('count stops an EMI', () => {
    const rec: Recurrence = { freq: 'months', interval: 1, start: '2026-10-05', count: 3 };
    expect(dates(rec, '2026-01-01', '2027-12-31')).toEqual(['2026-10-05', '2026-11-05', '2026-12-05']);
    expect(lastCycle(rec)).toBe('2026-12-05');
    expect(nextCycle(rec, '2026-12-06')).toBeNull();
  });

  it('until is inclusive', () => {
    const rec: Recurrence = { freq: 'months', interval: 1, start: '2026-10-05', until: '2026-12-05' };
    expect(dates(rec, '2026-01-01', '2027-12-31')).toEqual(['2026-10-05', '2026-11-05', '2026-12-05']);
  });

  it('cycle indexes count from the start', () => {
    const c = cyclesBetween({ freq: 'months', interval: 1, start: '2026-01-10' }, '2026-09-01', '2026-09-30');
    expect(c).toEqual([{ date: '2026-09-10', index: 8 }]);
  });
});

suite('describe', () => {
  it('reads like a person wrote it', () => {
    expect(describe({ freq: 'months', interval: 1, start: '2026-10-01' })).toBe('Monthly on the 1st');
    expect(describe({ freq: 'months', interval: 1, start: '2026-10-22' })).toBe('Monthly on the 22nd');
    expect(describe({ freq: 'months', interval: 1, start: '2026-10-13' })).toBe('Monthly on the 13th');
    expect(describe({ freq: 'months', interval: 1, start: '2026-10-31', eom: true })).toBe('Monthly on the last day');
    expect(describe({ freq: 'months', interval: 3, start: '2026-10-05' })).toBe('Every quarter on the 5th');
    expect(describe({ freq: 'days', interval: 28, start: '2026-10-05' })).toBe('Every 28 days');
    expect(describe({ freq: 'weeks', interval: 1, start: '2026-09-26' })).toBe('Every Saturday');
    expect(describe({ freq: 'years', interval: 1, start: '2026-03-15' })).toBe('Yearly on 15 Mar');
    expect(describe({ freq: 'months', interval: 1, start: '2026-10-05', count: 12 })).toBe('Monthly on the 5th, 12 times');
    expect(describe({ freq: 'once', interval: 1, start: '2026-10-05' })).toBe('Once');
  });
});

suite('dates', () => {
  it('9 AM in Delhi is 03:30 UTC', () => {
    expect(new Date(zonedToUtc('2026-10-01', 9, 'Asia/Kolkata')).toISOString()).toBe('2026-10-01T03:30:00.000Z');
  });

  it('respects DST elsewhere', () => {
    expect(new Date(zonedToUtc('2026-07-01', 9, 'Europe/London')).toISOString()).toBe('2026-07-01T08:00:00.000Z');
    expect(new Date(zonedToUtc('2026-12-01', 9, 'Europe/London')).toISOString()).toBe('2026-12-01T09:00:00.000Z');
  });

  it('today depends on the timezone', () => {
    const t = Date.parse('2026-09-26T20:00:00Z'); // 01:30 on the 27th in Delhi
    expect(todayIn('Asia/Kolkata', t)).toBe('2026-09-27');
    expect(todayIn('America/New_York', t)).toBe('2026-09-26');
  });

  it('relative phrasing', () => {
    expect(relative(0)).toBe('Today');
    expect(relative(1)).toBe('Tomorrow');
    expect(relative(5)).toBe('In 5 days');
    expect(relative(-3)).toBe('3 days late');
  });
});
