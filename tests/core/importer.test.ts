import { describe, expect, it } from 'vitest';
import { planImport, type ImportPlan } from '../../src/core/importer';
import { brandFor } from '../../src/ui/brands';
import { ob } from './helpers';

let n = 0;
const ids = () => `new${++n}`;

const file = {
  app: 'Dueline',
  obligations: [
    { id: 'a', title: 'Parking', category: 'person', amountType: 'fixed', amount: 70000, handling: 'manual', method: 'upi', payeeId: 'p1', upi: 'x@ybl', recurrence: { freq: 'months', interval: 1, start: '2026-10-01' }, remind: [1, 0], active: true, sneaky: true },
    { id: 'b', title: 'Jio recharge', category: 'mobile', amountType: 'fixed', amount: 90090, handling: 'manual', method: 'web', recurrence: { freq: 'days', interval: 90, start: '2026-09-22', bogus: 1 }, remind: [3, 0, 99], active: true },
    { id: 'c', title: 'Broken', category: 'mobile', amountType: 'fixed', amount: 12.5, handling: 'manual', method: 'web', recurrence: { freq: 'months', interval: 1, start: '2026-10-01' }, remind: [] },
  ],
  occurrences: [
    { obligationId: 'b', due: '2026-09-22', status: 'paid', paidOn: '2026-09-22', paidAmount: 90090, extra: 'x' },
    { obligationId: 'zzz', due: '2026-09-22', status: 'paid' },
  ],
  payees: [{ id: 'p1', name: 'Rahul Verma', upi: 'x@ybl', secret: 1 }],
};

describe('planImport', () => {
  it('keeps only the rule-shaped fields, remaps ids and counts what it drops', () => {
    const plan = planImport(file, { obligations: [], payees: [] }, ids, 1000) as ImportPlan;
    expect(plan.obligations.map((o) => o.data.title)).toEqual(['Parking', 'Jio recharge']);
    expect(plan.rejected).toBe(2); // the fractional amount, the orphaned cycle
    const [parking, jio] = plan.obligations;
    expect(parking.data).not.toHaveProperty('sneaky');
    expect(parking.data.payeeId).toBe(plan.payees[0].id);
    expect(plan.payees[0].data).not.toHaveProperty('secret');
    expect(jio.data.recurrence).toEqual({ freq: 'days', interval: 90, start: '2026-09-22' });
    expect(jio.data.remind).toEqual([3, 0]);
    expect(plan.occurrences).toHaveLength(1);
    expect(plan.occurrences[0].id).toBe(`${jio.id}_20260922`);
    expect(plan.occurrences[0].data).not.toHaveProperty('extra');
  });

  it('skips payments and payees that are already there, and their history', () => {
    const existing = { obligations: [ob({ title: 'jio  Recharge' })], payees: [{ id: 'mine', name: 'Someone', upi: 'X@ybl', createdAt: 0, updatedAt: 0 }] };
    const plan = planImport(file, existing, ids) as ImportPlan;
    expect(plan.obligations.find((o) => o.data.title === 'Jio recharge')?.duplicate).toBe(true);
    expect(plan.occurrences).toHaveLength(0);
    expect(plan.payees).toHaveLength(0);
    expect(plan.obligations[0].data.payeeId).toBe('mine');
  });

  it('refuses something that is not a Dueline file', () => {
    expect(planImport({ hello: 1 }, { obligations: [], payees: [] }, ids)).toHaveProperty('error');
    expect(planImport([1, 2], { obligations: [], payees: [] }, ids)).toHaveProperty('error');
  });
});

describe('brandFor', () => {
  it('matches by name first, then by link, and never guesses', () => {
    expect(brandFor({ title: 'Spotify Premium' })?.name).toBe('Spotify');
    expect(brandFor({ title: 'ChatGPT Plus' })?.path).toBeTruthy();
    expect(brandFor({ title: 'Canva Pro' })).toMatchObject({ name: 'Canva', path: null, letter: 'C' });
    expect(brandFor({ title: 'Claude Pro' })?.path).toBeTruthy();
    expect(brandFor({ title: 'Music', url: 'https://music.youtube.com/paid' })?.name).toBe('YouTube Music');
    expect(brandFor({ title: 'Jio recharge' })?.name).toBe('Jio');
    expect(brandFor({ title: 'School fees class vi' })).toBeNull();
    expect(brandFor({ title: 'Parking' })).toBeNull();
  });
});
