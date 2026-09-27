import { describe, expect, it } from 'vitest';
import { buildItems, confirmedPaid, nextPayday, sections, summarize } from '../../src/core/timeline';
import { ob, occ, occMap } from './helpers';

const TODAY = '2026-09-26';
const opts = { today: TODAY, from: '2026-06-01', to: '2026-11-10', autopayCheck: 'ask' as const };

describe('states', () => {
  it('manual cycles move from upcoming to soon, today and overdue', () => {
    const parking = ob({ recurrence: { freq: 'months', interval: 1, start: '2026-08-26' } });
    const items = buildItems([parking], occMap(), opts);
    const byDue = Object.fromEntries(items.map((i) => [i.due, i.state]));
    expect(byDue).toEqual({
      '2026-08-26': 'overdue',
      '2026-09-26': 'today',
      '2026-10-26': 'upcoming',
    });
    expect(items[0].daysLeft).toBe(-31);
  });

  it('paid, skipped and moved cycles', () => {
    const o = ob({ recurrence: { freq: 'months', interval: 1, start: '2026-09-20' } });
    const items = buildItems(
      [o],
      occMap(
        occ(o, '2026-09-20', { status: 'paid', paidAmount: 140000, paidOn: '2026-09-21' }),
        occ(o, '2026-10-20', { moveTo: '2026-10-02' }),
      ),
      opts,
    );
    expect(items.map((i) => [i.originalDue, i.due, i.state, i.amount])).toEqual([
      ['2026-09-20', '2026-09-20', 'paid', 140000],
      ['2026-10-20', '2026-10-02', 'soon', 150000],
    ]);
  });

  it('a cycle moved into the window from outside it still shows', () => {
    const o = ob({ recurrence: { freq: 'months', interval: 1, start: '2026-09-20' } });
    const items = buildItems([o], occMap(occ(o, '2026-11-20', { moveTo: '2026-10-01' })), { ...opts, to: '2026-10-15' });
    expect(items.map((i) => i.due)).toEqual(['2026-09-20', '2026-10-01']);
  });

  it('AutoPay is expected, then asked about, then assumed', () => {
    const netflix = ob({ id: 'n', title: 'Netflix', handling: 'auto', autoVia: 'card', amount: 64900, recurrence: { freq: 'months', interval: 1, start: '2026-08-15' } });
    const states = (check: 'ask' | 'assume', today: string) =>
      buildItems([netflix], occMap(), { ...opts, today, autopayCheck: check }).map((i) => `${i.due}:${i.state}${i.assumed ? '*' : ''}`);
    expect(states('ask', TODAY)).toEqual(['2026-08-15:autopaid*', '2026-09-15:autopaid*', '2026-10-15:auto']);
    expect(states('ask', '2026-09-18')).toEqual(['2026-08-15:autopaid*', '2026-09-15:confirm', '2026-10-15:auto']);
    expect(states('assume', '2026-09-18')).toEqual(['2026-08-15:autopaid*', '2026-09-15:autopaid*', '2026-10-15:auto']);
  });

  it('an assumed AutoPay is never counted as paid; a confirmed one is', () => {
    const netflix = ob({ id: 'n', title: 'Netflix', handling: 'auto', autoVia: 'card', amount: 64900, recurrence: { freq: 'months', interval: 1, start: '2026-08-15' } });
    const items = buildItems([netflix], occMap(occ(netflix, '2026-08-15', { status: 'autopaid' })), opts);
    expect(items.map((i) => `${i.due}:${i.state}${i.assumed ? '*' : ''}:${confirmedPaid(i)}`)).toEqual([
      '2026-08-15:autopaid:true',
      '2026-09-15:autopaid*:false',
      '2026-10-15:auto:false',
    ]);
  });

  it('a failed AutoPay needs you', () => {
    const o = ob({ handling: 'auto', recurrence: { freq: 'once', interval: 1, start: '2026-09-24' } });
    const [item] = buildItems([o], occMap(occ(o, '2026-09-24', { status: 'failed' })), opts);
    expect(item.state).toBe('overdue');
  });

  it('variable bills estimate until the amount is in', () => {
    const card = ob({ id: 'c', title: 'HDFC', amountType: 'variable', amount: 3000000, recurrence: { freq: 'months', interval: 1, start: '2026-10-05' } });
    const [a, b] = buildItems([card], occMap(occ(card, '2026-10-05', { amount: 4872000 })), opts);
    expect([a.amount, a.estimate]).toEqual([4872000, false]);
    expect([b.amount, b.estimate]).toEqual([3000000, true]);
  });

  it('stopped obligations disappear from the timeline', () => {
    expect(buildItems([ob({ active: false })], occMap(), opts)).toEqual([]);
  });
});

describe('summary', () => {
  const items = buildItems(
    [
      ob({ id: 'late', amount: 50000, recurrence: { freq: 'once', interval: 1, start: '2026-09-20' } }),
      ob({ id: 'jio', amount: 79900, recurrence: { freq: 'once', interval: 1, start: '2026-09-26' } }),
      ob({ id: 'park', amount: 150000, recurrence: { freq: 'once', interval: 1, start: '2026-10-01' } }),
      ob({ id: 'far', amount: 999900, recurrence: { freq: 'once', interval: 1, start: '2026-10-20' } }),
      ob({ id: 'hdfc', amountType: 'variable', amount: null, recurrence: { freq: 'once', interval: 1, start: '2026-10-03' } }),
      ob({ id: 'claude', handling: 'auto', amount: 199900, recurrence: { freq: 'once', interval: 1, start: '2026-09-28' } }),
    ],
    occMap(),
    opts,
  );

  it('needs-you in the next 7 days includes overdue, never AutoPay', () => {
    const s = summarize(items, TODAY, 1);
    expect(s.week).toEqual({ amount: 50000 + 79900 + 150000, count: 4, estimates: 0, unknown: 1 });
    expect(s.overdue.amount).toBe(50000);
    expect(s.auto.amount).toBe(199900);
    expect(s.payday?.date).toBe('2026-10-01');
    // Due before 1 Oct: late, jio, claude.
    expect(s.payday?.total.amount).toBe(50000 + 79900 + 199900);
  });

  it('groups for the Due screen', () => {
    expect(sections(items).map((s) => [s.id, s.items.map((i) => i.ob.id)])).toEqual([
      ['overdue', ['late']],
      ['today', ['jio']],
      ['week', ['claude', 'park', 'hdfc']],
      ['later', ['far']],
    ]);
  });
});

describe('payday', () => {
  it('clamps to short months and rolls the year', () => {
    expect(nextPayday('2026-02-10', 31)).toBe('2026-02-28');
    expect(nextPayday('2026-02-28', 31)).toBe('2026-03-31');
    expect(nextPayday('2026-12-15', 1)).toBe('2027-01-01');
    expect(nextPayday('2026-09-01', 1)).toBe('2026-10-01');
  });
});

describe('orphans', () => {
  it('keeps settled cycles visible after the schedule changes or stops', () => {
    const o = ob({ recurrence: { freq: 'months', interval: 1, start: '2026-10-07' } });
    // Paid on the old schedule (the 5th), before it moved to the 7th.
    const docs = occMap(occ(o, '2026-09-05', { status: 'paid', paidAmount: 150000 }));
    const plain = buildItems([o], docs, opts).map((i) => i.due);
    expect(plain).not.toContain('2026-09-05');
    const withOrphans = buildItems([o], docs, { ...opts, orphans: true }).map((i) => `${i.due}:${i.state}`);
    expect(withOrphans).toContain('2026-09-05:paid');
    const stopped = buildItems([{ ...o, active: false }], docs, { ...opts, orphans: true }).map((i) => i.due);
    expect(stopped).toEqual(['2026-09-05']);
  });
});
