/**
 * Templates + what happened = the timeline.
 *
 * Every screen and the reminder server read cycles through buildItems, so
 * "what is due, what is handled, what needs you" has exactly one definition.
 *
 * The one rule that must never bend: expected is not confirmed. An AutoPay
 * whose date has passed is 'confirm' (we ask) unless the person told us to
 * assume, or a week has gone by without an answer.
 */

import { addDays, daysInMonth, diffDays, parts, ymd } from './dates';
import { cyclesBetween } from './recurrence';
import type { ISODate, Item, ItemState, Obligation, OccurrenceDoc, Paise } from './types';

export function occId(obligationId: string, due: ISODate): string {
  return `${obligationId}_${due.replace(/-/g, '')}`;
}

export type OccMap = ReadonlyMap<string, OccurrenceDoc>;

export interface BuildOptions {
  today: ISODate;
  from: ISODate;
  to: ISODate;
  autopayCheck: 'ask' | 'assume';
  /**
   * Also include settled cycles the schedule no longer produces: payments of
   * a stopped obligation, or cycles from before its schedule was changed.
   * Calendars and history want these; the Due screen doesn't.
   */
  orphans?: boolean;
}

/** How long an unanswered AutoPay check waits before it is assumed paid. */
export const CONFIRM_DAYS = 7;
/** How far back an unpaid manual cycle can still surface as overdue. */
export const OVERDUE_LOOKBACK = 120;

export function deriveState(
  ob: Obligation,
  occ: OccurrenceDoc | undefined,
  due: ISODate,
  today: ISODate,
  autopayCheck: 'ask' | 'assume',
): { state: ItemState; assumed?: boolean } {
  const status = occ?.status ?? null;
  if (status === 'paid') return { state: 'paid' };
  if (status === 'skipped') return { state: 'skipped' };
  if (status === 'autopaid') return { state: 'autopaid' };
  const days = diffDays(today, due);
  if (ob.handling === 'manual' || status === 'failed') {
    if (days < 0) return { state: 'overdue' };
    if (days === 0) return { state: 'today' };
    if (days <= 7) return { state: 'soon' };
    return { state: 'upcoming' };
  }
  if (days >= 0) return { state: 'auto' };
  if (autopayCheck === 'assume' || days < -CONFIRM_DAYS) return { state: 'autopaid', assumed: true };
  return { state: 'confirm' };
}

function makeItem(ob: Obligation, originalDue: ISODate, index: number, occ: OccurrenceDoc | undefined, opts: BuildOptions): Item {
  const due = occ?.moveTo || originalDue;
  const { state, assumed } = deriveState(ob, occ, due, opts.today, opts.autopayCheck);
  const known = occ?.amount ?? (ob.amountType === 'fixed' ? ob.amount : null);
  const settledAmount = state === 'paid' ? occ?.paidAmount ?? known : known;
  return {
    key: occId(ob.id, originalDue),
    ob,
    occ,
    due,
    originalDue,
    amount: settledAmount ?? ob.amount ?? null,
    estimate: settledAmount == null && ob.amount != null && ob.amountType === 'variable',
    state,
    daysLeft: diffDays(opts.today, due),
    cycle: index + 1,
    assumed,
  };
}

/** Every cycle whose effective due date falls in [from, to]. */
export function buildItems(obligations: readonly Obligation[], occs: OccMap, opts: BuildOptions): Item[] {
  const out: Item[] = [];
  const seen = new Set<string>();
  const byOb = new Map<string, Obligation>();
  const everyOb = new Map(obligations.map((o) => [o.id, o]));
  for (const ob of obligations) {
    if (!ob.active) continue;
    byOb.set(ob.id, ob);
    for (const c of cyclesBetween(ob.recurrence, opts.from, opts.to)) {
      const key = occId(ob.id, c.date);
      const occ = occs.get(key);
      const eff = occ?.moveTo || c.date;
      if (eff < opts.from || eff > opts.to) continue;
      seen.add(key);
      out.push(makeItem(ob, c.date, c.index, occ, opts));
    }
  }
  // A cycle moved into the window from outside it.
  for (const occ of occs.values()) {
    if (!occ.moveTo || seen.has(occ.id)) continue;
    const ob = byOb.get(occ.obligationId);
    if (!ob || occ.moveTo < opts.from || occ.moveTo > opts.to) continue;
    const idx = cyclesBetween(ob.recurrence, occ.due, occ.due)[0]?.index;
    if (idx == null) continue;
    seen.add(occ.id);
    out.push(makeItem(ob, occ.due, idx, occ, opts));
  }
  if (opts.orphans) {
    for (const occ of occs.values()) {
      if (seen.has(occ.id) || !occ.status || occ.status === 'failed') continue;
      const ob = everyOb.get(occ.obligationId);
      const eff = occ.moveTo || occ.due;
      if (!ob || eff < opts.from || eff > opts.to) continue;
      const idx = cyclesBetween(ob.recurrence, occ.due, occ.due)[0]?.index ?? 0;
      seen.add(occ.id);
      out.push(makeItem(ob, occ.due, idx, occ, opts));
    }
  }
  return out.sort(compareItems);
}

const STATE_ORDER: Record<ItemState, number> = {
  overdue: 0,
  confirm: 1,
  today: 2,
  soon: 3,
  upcoming: 4,
  auto: 5,
  paid: 6,
  autopaid: 7,
  skipped: 8,
};

export function compareItems(a: Item, b: Item): number {
  if (a.due !== b.due) return a.due < b.due ? -1 : 1;
  const s = STATE_ORDER[a.state] - STATE_ORDER[b.state];
  if (s) return s;
  return (b.amount ?? 0) - (a.amount ?? 0) || a.ob.title.localeCompare(b.ob.title);
}

export const needsYou = (s: ItemState) => s === 'overdue' || s === 'today' || s === 'soon' || s === 'upcoming';
export const isDone = (s: ItemState) => s === 'paid' || s === 'autopaid' || s === 'skipped';
/**
 * Money we know left: paid by hand, or an AutoPay the person confirmed. An
 * assumed AutoPay is off the to-do list but never counts as paid.
 */
export const confirmedPaid = (i: Pick<Item, 'state' | 'assumed'>) => i.state === 'paid' || (i.state === 'autopaid' && !i.assumed);

export interface Total {
  amount: Paise;
  count: number;
  /** Items whose amount is an estimate. */
  estimates: number;
  /** Items with no amount at all. */
  unknown: number;
}

export function total(items: readonly Item[]): Total {
  const t: Total = { amount: 0, count: 0, estimates: 0, unknown: 0 };
  for (const it of items) {
    t.count++;
    if (it.amount == null) t.unknown++;
    else {
      t.amount += it.amount;
      if (it.estimate) t.estimates++;
    }
  }
  return t;
}

/** The next date salary lands, strictly after today. */
export function nextPayday(today: ISODate, day: number): ISODate {
  const { y, m, d } = parts(today);
  const clamp = (yy: number, mm: number) => ymd(yy, mm, Math.min(day, daysInMonth(yy, mm)));
  const thisMonth = clamp(y, m);
  if (Number(thisMonth.slice(8)) > d) return thisMonth;
  return m === 12 ? clamp(y + 1, 1) : clamp(y, m + 1);
}

export interface Summary {
  /** Needs you within 7 days, overdue included. */
  week: Total;
  overdue: Total;
  /** AutoPays expected within 7 days. */
  auto: Total;
  confirm: number;
  /** Everything unpaid before the next payday (needs you + AutoPay). */
  payday?: { date: ISODate; total: Total };
}

export function summarize(items: readonly Item[], today: ISODate, payday?: number | null): Summary {
  const week = items.filter((i) => needsYou(i.state) && i.daysLeft <= 7);
  const s: Summary = {
    week: total(week),
    overdue: total(items.filter((i) => i.state === 'overdue')),
    auto: total(items.filter((i) => i.state === 'auto' && i.daysLeft <= 7)),
    confirm: items.filter((i) => i.state === 'confirm').length,
  };
  if (payday) {
    const date = nextPayday(today, payday);
    s.payday = {
      date,
      total: total(items.filter((i) => (needsYou(i.state) || i.state === 'auto') && i.due < date)),
    };
  }
  return s;
}

export type SectionId = 'confirm' | 'overdue' | 'today' | 'tomorrow' | 'week' | 'later';

export interface Section {
  id: SectionId;
  title: string;
  items: Item[];
}

/**
 * The Due screen's groups. Settled cycles stay visible (muted) in the group
 * of their date so a tap on "Paid" has somewhere to land; past settled ones
 * drop off.
 */
export function sections(items: readonly Item[], today?: ISODate): Section[] {
  const groups: Record<SectionId, Item[]> = { confirm: [], overdue: [], today: [], tomorrow: [], week: [], later: [] };
  for (const it of items) {
    if (it.state === 'confirm') groups.confirm.push(it);
    else if (it.state === 'overdue') groups.overdue.push(it);
    // Settled today: stays in Today so the tap has a visible result.
    else if (isDone(it.state) && it.daysLeft < 0 && today && it.occ?.paidOn === today) groups.today.push(it);
    else if (isDone(it.state) && it.daysLeft < 0) continue;
    else if (it.daysLeft <= 0) groups.today.push(it);
    else if (it.daysLeft === 1) groups.tomorrow.push(it);
    else if (it.daysLeft <= 7) groups.week.push(it);
    else groups.later.push(it);
  }
  const titles: Record<SectionId, string> = {
    confirm: 'Did these go through?',
    overdue: 'Overdue',
    today: 'Today',
    tomorrow: 'Tomorrow',
    week: 'This week',
    later: 'Later',
  };
  return (Object.keys(groups) as SectionId[])
    .filter((id) => groups[id].length)
    .map((id) => ({ id, title: titles[id], items: groups[id] }));
}

/** Window used by the Due screen and the reminder server. */
export function dueWindow(today: ISODate, ahead = 45): { from: ISODate; to: ISODate } {
  return { from: addDays(today, -OVERDUE_LOOKBACK), to: addDays(today, ahead) };
}
