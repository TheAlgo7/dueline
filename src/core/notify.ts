/**
 * What to tell someone, and when.
 *
 * Runs on the reminder server every hour and in the app (to preview the next
 * reminders). It is a pure function of the schedule and the clock; the server
 * adds the only state, a `sent` log keyed by Notice.id, which makes every tick
 * idempotent: a notice is sent once no matter how many ticks see it.
 *
 * Tone rules: calm assistant, not a collections desk. AutoPays are announced,
 * never demanded. Nothing says "PAY NOW".
 */

import { addDays, mediumDate, todayIn, zonedToUtc } from './dates';
import { inr } from './money';
import { buildItems, isDone, OVERDUE_LOOKBACK, type OccMap } from './timeline';
import type { ISODate, Item, Obligation, Profile } from './types';

export type NoticeKind = 'before' | 'due' | 'evening' | 'late' | 'auto' | 'check';

export interface NoticeAction {
  action: string;
  title: string;
  url: string;
}

export interface Notice {
  /** Dedupe key. Unique per cycle, effective due date and reminder. */
  id: string;
  fireAt: number;
  kind: NoticeKind;
  itemKey: string;
  title: string;
  body: string;
  url: string;
  tag: string;
  actions: NoticeAction[];
  /** Counts toward "needs you" in a digest. */
  needsYou: boolean;
  amountText: string;
  label: string;
}

/** Overdue nudges, in days after the due date. Then it goes quiet. */
export const LATE_STEPS = [1, 3, 7, 14];
/** A notice more than this late is dropped, not sent (server was down, etc.). */
export const STALE_MS = 18 * 3600_000;
/** Ticks run hourly with ±59 min jitter, so a notice may go out a little early. */
export const LOOKAHEAD_MS = 45 * 60_000;

function amountText(it: Item): string {
  if (it.amount == null) return 'amount pending';
  return it.estimate ? `about ${inr(it.amount)}` : inr(it.amount);
}

function viaText(ob: Obligation): string {
  if (ob.handling !== 'auto') return '';
  if (ob.account) return ` from ${ob.account}`;
  switch (ob.autoVia) {
    case 'card': return ' on your card';
    case 'upi': return ' through UPI AutoPay';
    case 'bank': return ' from your bank';
    case 'wallet': return ' from your wallet';
    default: return '';
  }
}

function days(n: number): string {
  return n === 1 ? '1 day' : `${n} days`;
}

export function planNotices(
  profile: Pick<Profile, 'tz' | 'remindHour' | 'evening' | 'eveningHour' | 'autopayCheck'>,
  obligations: readonly Obligation[],
  occs: OccMap,
  now: number,
  /** Days ahead to plan. The server only needs what can fire soon; previews want more. */
  horizon?: number,
): Notice[] {
  const today = todayIn(profile.tz, now);
  const maxLead = Math.max(1, ...obligations.flatMap((o) => o.remind ?? []));
  const items = buildItems(obligations, occs, {
    today,
    from: addDays(today, -Math.min(OVERDUE_LOOKBACK, 20)),
    to: addDays(today, Math.max(horizon ?? 0, maxLead + 1)),
    autopayCheck: profile.autopayCheck,
  });

  const out: Notice[] = [];
  const at = (date: ISODate, hour: number) => zonedToUtc(date, hour, profile.tz);

  for (const it of items) {
    if (isDone(it.state)) continue;
    const ob = it.ob;
    const amt = amountText(it);
    const label = ob.title;
    const open = `/?open=${encodeURIComponent(it.key)}`;
    const base = { itemKey: it.key, tag: it.key, amountText: amt, label };
    const snooze = it.occ?.snoozeUntil ?? null;
    const push = (n: Omit<Notice, keyof typeof base | 'id'> & { date: ISODate; suffix: string }) => {
      if (snooze && n.date < snooze) return;
      if (n.fireAt < ob.createdAt) return; // added after this reminder's moment
      const { date: _d, suffix, ...rest } = n;
      out.push({ ...base, ...rest, id: `${it.key}_${it.due.replace(/-/g, '')}_${suffix}` });
    };

    const manualActions: NoticeAction[] = [
      { action: 'pay', title: 'Pay', url: `${open}&do=pay` },
      { action: 'paid', title: 'Mark paid', url: `${open}&do=paid` },
    ];

    if (ob.handling === 'manual' || it.occ?.status === 'failed') {
      const pendingAmount = it.amount == null || it.estimate;
      for (const lead of ob.remind ?? []) {
        if (lead <= 0) continue;
        const date = addDays(it.due, -lead);
        push({
          date,
          suffix: `b${lead}`,
          kind: 'before',
          fireAt: at(date, profile.remindHour),
          title: `${label} · ${amt}`,
          body:
            (lead === 1 ? 'Due tomorrow.' : `Due in ${days(lead)}, ${mediumDate(it.due)}.`) +
            (pendingAmount && ob.amountType === 'variable' ? ' Add the amount when the bill arrives.' : ' Pay when ready.'),
          url: open,
          actions: manualActions,
          needsYou: true,
        });
      }
      if ((ob.remind ?? []).includes(0)) {
        push({
          date: it.due,
          suffix: 'd0',
          kind: 'due',
          fireAt: at(it.due, profile.remindHour),
          title: `${label} · ${amt} due today`,
          body: 'Needs your attention today.',
          url: open,
          actions: manualActions,
          needsYou: true,
        });
      }
      if (profile.evening && (ob.remind ?? []).length) {
        push({
          date: it.due,
          suffix: 'eve',
          kind: 'evening',
          fireAt: at(it.due, profile.eveningHour),
          title: `${label} is still unpaid`,
          body: `${amt[0].toUpperCase()}${amt.slice(1)} was due today.`,
          url: open,
          actions: manualActions,
          needsYou: true,
        });
      }
      for (const step of (ob.remind ?? []).length ? LATE_STEPS : []) {
        const date = addDays(it.due, step);
        push({
          date,
          suffix: `l${step}`,
          kind: 'late',
          fireAt: at(date, profile.remindHour),
          title: `${label} is ${days(step)} overdue`,
          body: `${amt[0].toUpperCase()}${amt.slice(1)} is still marked unpaid.`,
          url: open,
          actions: manualActions,
          needsYou: true,
        });
      }
      continue;
    }

    // AutoPay: one heads-up the day before, then (if asked) one check after.
    if ((ob.remind ?? []).length) {
      const date = addDays(it.due, -1);
      push({
        date,
        suffix: 'a1',
        kind: 'auto',
        fireAt: at(date, profile.remindHour),
        title: `${label} · ${amt}`,
        body: `Expected to AutoPay tomorrow${viaText(ob)}. Nothing to do.`,
        url: open,
        actions: [],
        needsYou: false,
      });
    }
    if (profile.autopayCheck === 'ask') {
      const date = addDays(it.due, 1);
      push({
        date,
        suffix: 'chk',
        kind: 'check',
        fireAt: at(date, profile.remindHour),
        title: `Did ${label} go through?`,
        body: `${amt[0].toUpperCase()}${amt.slice(1)} was due to AutoPay yesterday.`,
        url: open,
        actions: [
          { action: 'autopaid', title: 'Yes, it did', url: `${open}&do=autopaid` },
          { action: 'failed', title: 'It failed', url: `${open}&do=failed` },
        ],
        needsYou: false,
      });
    }
  }
  return out.sort((a, b) => a.fireAt - b.fireAt);
}

/** The notices a tick at `now` should send, before checking the sent log. */
export function dueNow(notices: readonly Notice[], now: number): Notice[] {
  return notices.filter((n) => n.fireAt <= now + LOOKAHEAD_MS && n.fireAt > now - STALE_MS);
}

export interface PushPayload {
  title: string;
  body: string;
  tag: string;
  url: string;
  actions: NoticeAction[];
  /** Unix ms, for the notification timestamp. */
  ts: number;
}

/**
 * One or two notices go out as themselves. Three or more in the same tick
 * become a single digest, because five buzzes at 9 AM is exactly the noise
 * this app exists to remove.
 */
export function toPayloads(notices: readonly Notice[], now: number, today: ISODate): PushPayload[] {
  if (notices.length <= 2) {
    return notices.map((n) => ({ title: n.title, body: n.body, tag: n.tag, url: n.url, actions: n.actions, ts: now }));
  }
  const need = notices.filter((n) => n.needsYou);
  const title = need.length
    ? `${need.length} ${need.length === 1 ? 'payment needs' : 'payments need'} you`
    : `${notices.length} AutoPays coming up`;
  const listed = (need.length ? need : notices).slice(0, 3).map((n) => `${n.label} ${n.amountText}`);
  const more = (need.length ? need.length : notices.length) - listed.length;
  const autoNote = need.length && notices.length > need.length ? ` ${notices.length - need.length} more on AutoPay.` : '';
  return [
    {
      title,
      body: listed.join(', ') + (more > 0 ? `, +${more} more.` : '.') + autoNote,
      tag: `digest-${today}`,
      url: '/',
      actions: [],
      ts: now,
    },
  ];
}

/** Next few reminders for display ("Next reminder: Tomorrow 9 AM, Parking"). */
export function upcomingNotices(notices: readonly Notice[], now: number, limit = 5): Notice[] {
  return notices.filter((n) => n.fireAt > now).slice(0, limit);
}

