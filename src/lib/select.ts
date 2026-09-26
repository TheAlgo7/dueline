/** Derived views over the store, shared by screens and sheets. */

import { useEffect, useMemo, useState } from 'react';
import { addDays, diffDays, todayIn } from '../core/dates';
import { AUTO_LABEL, METHOD_LABEL } from '../core/presets';
import { buildItems, dueWindow, occId } from '../core/timeline';
import type { Item, Obligation } from '../core/types';
import { hostOf } from '../core/upi';
import { getState, useStore, type State } from './store';

/** Today in the person's timezone; flips at midnight and when the app wakes. */
export function useToday(): string {
  const tz = useStore((s) => s.profile?.tz ?? 'Asia/Kolkata');
  const [today, setToday] = useState(() => todayIn(tz));
  useEffect(() => {
    const check = () => setToday(todayIn(tz));
    check();
    const timer = setInterval(check, 60_000);
    document.addEventListener('visibilitychange', check);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', check);
    };
  }, [tz]);
  return today;
}

export function useItems(from: string, to: string, orphans = false): Item[] {
  const obligations = useStore((s) => s.obligations);
  const occs = useStore((s) => s.occs);
  const check = useStore((s) => s.profile?.autopayCheck ?? 'ask');
  const today = useToday();
  return useMemo(
    () => buildItems(obligations, occs, { today, from, to, autopayCheck: check, orphans }),
    [obligations, occs, today, from, to, check, orphans],
  );
}

export function useDueItems(): Item[] {
  const today = useToday();
  const { from, to } = dueWindow(today, 45);
  return useItems(from, to);
}

/** Any single cycle by its key, including stopped obligations and far dates. */
export function itemFor(key: string, s: State = getState()): Item | null {
  const m = key.match(/^(.+)_(\d{4})(\d{2})(\d{2})$/);
  if (!m) return null;
  const ob = s.obligations.find((o) => o.id === m[1]);
  if (!ob) return null;
  const due = `${m[2]}-${m[3]}-${m[4]}`;
  const occ = s.occs.get(occId(ob.id, due));
  const eff = occ?.moveTo || due;
  const from = eff < due ? eff : due;
  const to = eff > due ? eff : due;
  const today = todayIn(s.profile?.tz ?? 'Asia/Kolkata');
  const items = buildItems([{ ...ob, active: true }], s.occs, {
    today,
    from,
    to,
    autopayCheck: s.profile?.autopayCheck ?? 'ask',
    orphans: true,
  });
  return items.find((i) => i.key === key) ?? null;
}

export function useItem(key: string | undefined): Item | null {
  const obligations = useStore((s) => s.obligations);
  const occs = useStore((s) => s.occs);
  const profile = useStore((s) => s.profile);
  const today = useToday();
  return useMemo(
    () => (key ? itemFor(key) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key, obligations, occs, profile, today],
  );
}

/** The next unsettled cycle of an obligation, for "Next due" displays. */
export function nextItem(ob: Obligation, today: string, s: State = getState()): Item | null {
  const items = buildItems([{ ...ob, active: true }], s.occs, {
    today,
    from: addDays(today, -120),
    to: addDays(today, 800),
    autopayCheck: s.profile?.autopayCheck ?? 'ask',
  });
  return items.find((i) => i.state !== 'paid' && i.state !== 'autopaid' && i.state !== 'skipped') ?? null;
}

/** "HDFC Regalia ••4821" under a title of "HDFC Regalia" reads as "••4821". */
function withoutTitle(account: string, title: string): string {
  const a = account.trim();
  const t = title.trim();
  if (t && a.toLowerCase().startsWith(t.toLowerCase()) && a.length > t.length) return a.slice(t.length).trim() || a;
  return a;
}

/** "UPI · rahul@okaxis", "AutoPay · HDFC ••4821", "jio.com", "Cash". */
export function routeText(ob: Obligation): string {
  if (ob.handling === 'auto') {
    const via = ob.account || (ob.autoVia ? AUTO_LABEL[ob.autoVia] : '');
    return via ? `AutoPay · ${via}` : 'AutoPay';
  }
  switch (ob.method) {
    case 'upi':
      return ob.payTo ? `UPI to ${ob.payTo}` : ob.upi ? `UPI · ${ob.upi}` : 'UPI';
    case 'web':
      if (ob.category === 'card' && ob.account) return withoutTitle(ob.account, ob.title);
      return hostOf(ob.url) || 'Website or app';
    case 'card':
      return ob.account ? `Card · ${withoutTitle(ob.account, ob.title)}` : 'Card';
    case 'bank':
      return ob.account ? `Bank · ${ob.account}` : 'Bank transfer';
    case 'cash':
      return 'Cash';
  }
  return METHOD_LABEL[ob.method];
}

export function daysBetween(a: string, b: string) {
  return diffDays(a, b);
}
