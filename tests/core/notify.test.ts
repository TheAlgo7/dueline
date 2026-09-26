import { describe, expect, it } from 'vitest';
import { dueNow, LOOKAHEAD_MS, planNotices, STALE_MS, toPayloads } from '../../src/core/notify';
import { ob, occ, occMap } from './helpers';

const profile = { tz: 'Asia/Kolkata', remindHour: 9, evening: true, eveningHour: 20, autopayCheck: 'ask' as const };
const NOW = Date.parse('2026-09-26T06:00:00Z'); // 11:30 in Delhi, Sat 26 Sep

const iso = (t: number) => new Date(t).toISOString().slice(0, 16);

describe('manual reminders', () => {
  const parking = ob({ recurrence: { freq: 'once', interval: 1, start: '2026-10-01' }, remind: [3, 1, 0] });
  const notices = planNotices(profile, [parking], occMap(), NOW, 30);

  it('before, on the day, evening, then overdue steps', () => {
    expect(notices.map((n) => [n.kind, iso(n.fireAt)])).toEqual([
      ['before', '2026-09-28T03:30'],
      ['before', '2026-09-30T03:30'],
      ['due', '2026-10-01T03:30'],
      ['evening', '2026-10-01T14:30'],
      ['late', '2026-10-02T03:30'],
      ['late', '2026-10-04T03:30'],
      ['late', '2026-10-08T03:30'],
      ['late', '2026-10-15T03:30'],
    ]);
  });

  it('ids are unique and stable', () => {
    const ids = notices.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(planNotices(profile, [parking], occMap(), NOW + 3600_000, 30).map((n) => n.id)).toEqual(ids);
    expect(ids[0]).toBe('o1_20261001_20261001_b3');
  });

  it('copy is calm and specific', () => {
    expect(notices[0].title).toBe('Parking · ₹1,500');
    expect(notices[0].body).toBe('Due in 3 days, Thu, 1 Oct. Pay when ready.');
    expect(notices[1].body).toBe('Due tomorrow. Pay when ready.');
    expect(notices[2].title).toBe('Parking · ₹1,500 due today');
    expect(notices[4].title).toBe('Parking is 1 day overdue');
    expect(notices.every((n) => !/—|PAY NOW/.test(n.title + n.body))).toBe(true);
  });

  it('paid cycles go quiet', () => {
    const paid = planNotices(profile, [parking], occMap(occ(parking, '2026-10-01', { status: 'paid' })), NOW, 30);
    expect(paid).toEqual([]);
  });

  it('snooze holds reminders until the given day', () => {
    const s = planNotices(profile, [parking], occMap(occ(parking, '2026-10-01', { snoozeUntil: '2026-10-01' })), NOW, 30);
    expect(s[0].kind).toBe('due');
  });

  it('nothing fires for moments before the obligation was created', () => {
    const created = Date.parse('2026-10-01T10:00:00Z');
    const s = planNotices(profile, [{ ...parking, createdAt: created }], occMap(), NOW, 30);
    expect(s.map((n) => n.kind)).toEqual(['evening', 'late', 'late', 'late', 'late']);
  });

  it('variable bills without an amount ask for it', () => {
    const card = ob({ title: 'HDFC', amountType: 'variable', amount: null, remind: [2], recurrence: { freq: 'once', interval: 1, start: '2026-10-05' } });
    const [first] = planNotices(profile, [card], occMap(), NOW, 30);
    expect(first.title).toBe('HDFC · amount pending');
    expect(first.body).toContain('Add the amount when the bill arrives.');
  });
});

describe('AutoPay reminders', () => {
  const claude = ob({ id: 'cl', title: 'Claude', handling: 'auto', autoVia: 'card', account: 'HDFC ••4821', amount: 199900, remind: [1], recurrence: { freq: 'once', interval: 1, start: '2026-09-28' } });

  it('announces the day before and asks the day after', () => {
    const n = planNotices(profile, [claude], occMap(), NOW, 30);
    expect(n.map((x) => [x.kind, iso(x.fireAt)])).toEqual([
      ['auto', '2026-09-27T03:30'],
      ['check', '2026-09-29T03:30'],
    ]);
    expect(n[0].body).toBe('Expected to AutoPay tomorrow from HDFC ••4821. Nothing to do.');
    expect(n[1].actions.map((a) => a.action)).toEqual(['autopaid', 'failed']);
  });

  it('assume mode never asks', () => {
    const n = planNotices({ ...profile, autopayCheck: 'assume' }, [claude], occMap(), NOW, 30);
    expect(n.map((x) => x.kind)).toEqual(['auto']);
  });
});

describe('ticks', () => {
  const parking = ob({ recurrence: { freq: 'once', interval: 1, start: '2026-10-01' }, remind: [1, 0] });
  const notices = planNotices(profile, [parking], occMap(), NOW, 30);
  const fire = notices[0].fireAt;

  it('sends a little early, never very late', () => {
    expect(dueNow(notices, fire - LOOKAHEAD_MS - 1)).toEqual([]);
    expect(dueNow(notices, fire - LOOKAHEAD_MS + 1).map((n) => n.kind)).toEqual(['before']);
    expect(dueNow(notices, fire + STALE_MS - 1).map((n) => n.kind)).toContain('before');
    expect(dueNow(notices, fire + STALE_MS + 1).map((n) => n.kind)).not.toContain('before');
  });

  it('three or more at once become one digest', () => {
    const many = [1, 2, 3, 4].map((i) =>
      ob({ id: `p${i}`, title: `Bill ${i}`, amount: i * 10000, remind: [0], recurrence: { freq: 'once', interval: 1, start: '2026-09-27' } }),
    );
    const n = dueNow(planNotices(profile, many, occMap(), NOW, 30), Date.parse('2026-09-27T03:40:00Z'));
    expect(n).toHaveLength(4);
    const [p] = toPayloads(n, NOW, '2026-09-27');
    expect(p.title).toBe('4 payments need you');
    expect(p.body).toBe('Bill 4 ₹400, Bill 3 ₹300, Bill 2 ₹200, +1 more.');
    expect(toPayloads(n.slice(0, 2), NOW, '2026-09-27')).toHaveLength(2);
  });
});

describe('reminders off', () => {
  it('an empty reminder list means no notifications at all, overdue included', () => {
    const quiet = ob({ remind: [], recurrence: { freq: 'once', interval: 1, start: '2026-09-20' } });
    expect(planNotices(profile, [quiet], occMap(), NOW, 30)).toEqual([]);
  });
});
