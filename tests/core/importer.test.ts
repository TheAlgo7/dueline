import { describe, expect, it } from 'vitest';
import { planImport, type ImportPlan } from '../../src/core/importer';
import { markFor, payeeMark } from '../../src/ui/marks';
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
    const jio = ob({ title: 'jio  Recharge', method: 'web', recurrence: { freq: 'days', interval: 90, start: '2026-06-24' } });
    const existing = { obligations: [jio], payees: [{ id: 'mine', name: 'Someone', upi: 'X@ybl', createdAt: 0, updatedAt: 0 }] };
    const plan = planImport(file, existing, ids) as ImportPlan;
    expect(plan.obligations.find((o) => o.data.title === 'Jio recharge')?.duplicate).toBe(true);
    expect(plan.occurrences).toHaveLength(0);
    expect(plan.payees).toHaveLength(0);
    expect(plan.obligations[0].data.payeeId).toBe('mine');
  });

  it('matches payees by UPI ID or phone, never by name alone', () => {
    const rahul = { id: 'r1', name: 'Rahul', upi: 'rahul1@ybl', phone: '+91 98765 43210', createdAt: 0, updatedAt: 0 };
    const other = { app: 'Dueline', obligations: [], payees: [{ id: 'a', name: 'Rahul', upi: 'rahul2@okaxis' }, { id: 'b', name: 'R. Kumar', phone: '9876543210' }] };
    const plan = planImport(other, { obligations: [], payees: [rahul] }, ids) as ImportPlan;
    expect(plan.payees.map((p) => p.data.upi)).toEqual(['rahul2@okaxis']); // a different Rahul is a new payee
  });

  it('keeps two same-named payments on different cards apart, and one payment listed twice counts once', () => {
    const card = (id: string, account: string) => ({ id, title: 'HDFC Credit Card', category: 'card', amountType: 'variable', amount: null, handling: 'manual', method: 'web', account, recurrence: { freq: 'months', interval: 1, start: '2026-10-05' }, remind: [] });
    const existing = { obligations: [ob({ title: 'HDFC Credit Card', method: 'web', account: 'Regalia ••4821' })], payees: [] };
    const plan = planImport({ obligations: [card('a', 'Regalia ••4821'), card('b', 'Millennia ••1234'), card('c', 'Millennia ••1234')] }, existing, ids) as ImportPlan;
    expect(plan.obligations.map((o) => o.duplicate)).toEqual([true, false, true]);
  });

  it('refuses something that is not a Dueline file', () => {
    expect(planImport({ hello: 1 }, { obligations: [], payees: [] }, ids)).toHaveProperty('error');
    expect(planImport([1, 2], { obligations: [], payees: [] }, ids)).toHaveProperty('error');
  });
});

describe('markFor', () => {
  it('matches by name first, then by link, and never guesses', () => {
    expect(markFor({ title: 'Spotify Premium' })?.name).toBe('Spotify');
    expect(markFor({ title: 'ChatGPT Plus' })?.path).toBeTruthy();
    expect(markFor({ title: 'Canva Pro' })).toMatchObject({ name: 'Canva', path: null, letter: 'C' });
    expect(markFor({ title: 'Claude Pro' })?.path).toBeTruthy();
    expect(markFor({ title: 'Music', url: 'https://music.youtube.com/paid' })?.name).toBe('YouTube Music');
    expect(markFor({ title: 'Jio recharge' })?.name).toBe('Jio');
    expect(markFor({ title: 'PG rent' })?.name).toBe('Rent');
    expect(markFor({ title: 'Some random bill' })).toBeNull();
  });

  it('gives everyday payments an icon, most specific first, without stealing card or tax bills', () => {
    const name = (title: string) => markFor({ title })?.name ?? null;
    expect(markFor({ title: 'Parking' })?.Icon).toBeTruthy();
    expect(name('Car wash')).toBe('Car wash');
    expect(name('Doodh wala')).toBe('Milk');
    expect(name('Kamla bai')).toBe('Cleaning');
    expect(name('Iron Gym')).toBe('Gym');
    expect(name("Mom's medicine")).toBe('Medicine');
    expect(name('School fees class vi')).toBe('School');
    expect(name('Maths tuition')).toBe('Tuition');
    expect(name('LPG cylinder')).toBe('Gas');
    expect(name('HDFC credit card annual fee')).toBeNull();
    expect(name('Tax return')).toBeNull();
  });

  it('shows a payee what you pay them for', () => {
    const parking = ob({ id: 'o1', title: 'Parking', payeeId: 'p1' });
    expect(payeeMark({ id: 'p1', name: 'Neha', note: '' }, [parking])?.name).toBe('Parking');
    expect(payeeMark({ id: 'p2', name: 'Suresh', note: 'Milkman' }, [parking])?.name).toBe('Milk');
  });
});
