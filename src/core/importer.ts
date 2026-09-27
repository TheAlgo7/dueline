/**
 * Reading a Dueline file back in: an export from another account or device,
 * or a list prepared for someone. Only the shape the security rules accept
 * survives: unknown keys are dropped and anything malformed is skipped, so an
 * import can never write something the app would choke on later.
 *
 * Everything gets a fresh id (two accounts can import the same file), and a
 * payment already in the account (same name, account, UPI ID and kind of
 * schedule) is left alone, so importing twice adds nothing the second time.
 */

import { occId } from './timeline';
import type { Category, Obligation, OccurrenceDoc, Payee } from './types';

type NewObligation = Omit<Obligation, 'id'>;
type NewOccurrence = Omit<OccurrenceDoc, 'id'>;
type NewPayee = Omit<Payee, 'id'>;

export interface ImportPlan {
  obligations: Array<{ id: string; data: NewObligation; duplicate: boolean }>;
  occurrences: Array<{ id: string; data: NewOccurrence }>;
  payees: Array<{ id: string; data: NewPayee }>;
  /** Records that were not valid Dueline data and will not be imported. */
  rejected: number;
}

const CATEGORIES: Category[] = ['card', 'rent', 'mobile', 'internet', 'electricity', 'utility', 'subscription', 'emi', 'insurance', 'person', 'tax', 'other'];
const FREQS = ['once', 'days', 'weeks', 'months', 'years'];
const ISO = /^\d{4}-\d{2}-\d{2}$/;

type Raw = Record<string, unknown>;
const isObj = (v: unknown): v is Raw => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, max: number) => (typeof v === 'string' && v.length <= max ? v : undefined);
const int = (v: unknown, lo: number, hi: number) => (Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi ? (v as number) : undefined);
const paise = (v: unknown) => (v == null ? null : int(v, 0, 100_000_000_000));
const date = (v: unknown) => (typeof v === 'string' && ISO.test(v) ? v : undefined);

function cleanObligation(r: Raw, now: number): NewObligation | null {
  const title = str(r.title, 80)?.trim();
  const rec = isObj(r.recurrence) ? r.recurrence : null;
  if (!title || !rec) return null;
  const category = CATEGORIES.includes(r.category as Category) ? (r.category as Category) : 'other';
  const freq = FREQS.includes(rec.freq as string) ? (rec.freq as Obligation['recurrence']['freq']) : null;
  const interval = int(rec.interval, 1, 400);
  const start = date(rec.start);
  const amount = paise(r.amount);
  if (!freq || !interval || !start || amount === undefined) return null;
  if (!['fixed', 'variable'].includes(r.amountType as string)) return null;
  if (!['manual', 'auto'].includes(r.handling as string)) return null;
  if (!['upi', 'card', 'bank', 'cash', 'web'].includes(r.method as string)) return null;
  const remind = Array.isArray(r.remind) ? r.remind.filter((d): d is number => int(d, 0, 30) !== undefined) : [];
  const recurrence: Obligation['recurrence'] = { freq, interval, start };
  if (rec.eom === true) recurrence.eom = true;
  const count = int(rec.count, 1, 10000);
  if (count) recurrence.count = count;
  const until = date(rec.until);
  if (until) recurrence.until = until;
  const autoVia = ['card', 'upi', 'bank', 'wallet', 'other'].includes(r.autoVia as string) ? (r.autoVia as Obligation['autoVia']) : null;
  return {
    title,
    category,
    amountType: r.amountType as Obligation['amountType'],
    amount,
    handling: r.handling as Obligation['handling'],
    method: r.method as Obligation['method'],
    autoVia: r.handling === 'auto' ? autoVia : null,
    account: str(r.account, 80) ?? '',
    payeeId: typeof r.payeeId === 'string' ? r.payeeId : null,
    upi: str(r.upi, 120) ?? '',
    payTo: str(r.payTo, 80) ?? '',
    url: str(r.url, 600) ?? '',
    recurrence,
    remind: [...new Set(remind)].sort((a, b) => b - a).slice(0, 6),
    note: str(r.note, 600) ?? '',
    active: r.active !== false,
    createdAt: now,
    updatedAt: now,
  };
}

function cleanOccurrence(r: Raw, obligationId: string, now: number): NewOccurrence | null {
  const due = date(r.due);
  if (!due) return null;
  const out: NewOccurrence = { obligationId, due, updatedAt: now };
  if (['paid', 'skipped', 'autopaid', 'failed'].includes(r.status as string)) out.status = r.status as OccurrenceDoc['status'];
  for (const k of ['moveTo', 'paidOn', 'snoozeUntil'] as const) {
    const v = date(r[k]);
    if (v) out[k] = v;
  }
  for (const k of ['amount', 'paidAmount'] as const) {
    const v = paise(r[k]);
    if (v != null) out[k] = v;
  }
  const lim = { ref: 80, via: 40, note: 600, title: 80 } as const;
  for (const k of Object.keys(lim) as Array<keyof typeof lim>) {
    const v = str(r[k], lim[k]);
    if (v) out[k] = v;
  }
  return out;
}

function cleanPayee(r: Raw, now: number): NewPayee | null {
  const name = str(r.name, 80)?.trim();
  if (!name) return null;
  return {
    name,
    upi: str(r.upi, 120) ?? '',
    phone: str(r.phone, 20) ?? '',
    url: str(r.url, 600) ?? '',
    note: str(r.note, 600) ?? '',
    createdAt: now,
    updatedAt: now,
  };
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

export function planImport(
  raw: unknown,
  existing: { obligations: readonly Obligation[]; payees: readonly Payee[] },
  newId: () => string,
  now = Date.now(),
): ImportPlan | { error: string } {
  if (!isObj(raw) || !Array.isArray(raw.obligations)) {
    return { error: 'That isn\'t a Dueline file. It should be a .json export from Dueline.' };
  }
  const plan: ImportPlan = { obligations: [], occurrences: [], payees: [], rejected: 0 };

  // Payees first. One already here is reused only on the same UPI ID, or failing
  // that the same phone number: two different Rahuls share a name, not an account.
  const payeeIds = new Map<string, string>();
  const digits = (s?: string) => (s ?? '').replace(/\D/g, '').slice(-10);
  for (const p of Array.isArray(raw.payees) ? raw.payees : []) {
    const data = isObj(p) ? cleanPayee(p, now) : null;
    if (!data || !isObj(p)) {
      plan.rejected++;
      continue;
    }
    const same =
      (data.upi ? existing.payees.find((e) => e.upi && norm(e.upi) === norm(data.upi!)) : undefined) ??
      (digits(data.phone).length === 10 ? existing.payees.find((e) => digits(e.phone) === digits(data.phone)) : undefined);
    const id = same?.id ?? newId();
    if (!same) plan.payees.push({ id, data });
    if (typeof p.id === 'string') payeeIds.set(p.id, id);
  }

  // The same payment means the same name, paid the same way, on the same kind of
  // schedule. Two "HDFC Credit Card" bills on different cards are two payments.
  const fingerprint = (o: Pick<Obligation, 'title' | 'account' | 'upi' | 'recurrence'>) =>
    [norm(o.title), norm(o.account ?? ''), norm(o.upi ?? ''), o.recurrence.freq, o.recurrence.interval].join('|');
  const taken = new Set(existing.obligations.filter((o) => o.active).map(fingerprint));
  const obIds = new Map<string, string>();
  const skipped = new Set<string>();
  for (const o of raw.obligations) {
    const data = isObj(o) ? cleanObligation(o, now) : null;
    if (!data || !isObj(o)) {
      plan.rejected++;
      continue;
    }
    data.payeeId = data.payeeId ? payeeIds.get(data.payeeId) ?? null : null;
    const duplicate = taken.has(fingerprint(data));
    taken.add(fingerprint(data)); // the same payment twice in one file counts once
    const id = newId();
    plan.obligations.push({ id, data, duplicate });
    if (typeof o.id === 'string') (duplicate ? skipped.add(o.id) : obIds.set(o.id, id));
  }

  for (const c of Array.isArray(raw.occurrences) ? raw.occurrences : []) {
    const oldId = isObj(c) && typeof c.obligationId === 'string' ? c.obligationId : '';
    if (skipped.has(oldId)) continue; // history of a payment that is already here
    const obId = obIds.get(oldId);
    const data = obId && isObj(c) ? cleanOccurrence(c, obId, now) : null;
    if (!obId || !data) {
      plan.rejected++;
      continue;
    }
    plan.occurrences.push({ id: occId(obId, data.due), data });
  }
  return plan;
}
