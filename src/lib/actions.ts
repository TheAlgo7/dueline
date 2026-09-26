/**
 * Every write the app makes. Writes are not awaited by the UI: Firestore
 * applies them to the local cache at once (the snapshot listeners re-render
 * immediately) and syncs when it can, so marking something paid on a train
 * with no signal still works. Failures surface through the toast bus.
 */

import { addDoc, collection, deleteDoc, doc, getDocs, setDoc, writeBatch } from 'firebase/firestore';
import { todayIn } from '../core/dates';
import { occId } from '../core/timeline';
import type { Item, Obligation, OccurrenceDoc, Paise, Payee, Profile } from '../core/types';
import { db } from './firebase';
import { newId } from './ids';
import { detachListeners, getState, uid } from './store';
import { toast } from './toast';

function userDoc() {
  return doc(db, 'users', uid());
}

function background(p: Promise<unknown>, what: string) {
  p.catch((e) => {
    console.error(what, e);
    toast(`Couldn't save: ${what}. ${navigator.onLine ? 'Try again.' : 'You are offline.'}`, { tone: 'late' });
  });
}

function event(action: string, data: Record<string, unknown> = {}) {
  background(addDoc(collection(userDoc(), 'events'), { at: Date.now(), action, ...data }), 'history');
}

export function today(): string {
  return todayIn(getState().profile?.tz ?? 'Asia/Kolkata');
}

/* Obligations ------------------------------------------------------------ */

export type ObligationInput = Omit<Obligation, 'id' | 'createdAt' | 'updatedAt'>;

export function saveObligation(input: ObligationInput, prev?: Obligation): string {
  const id = prev?.id ?? newId();
  const now = Date.now();
  const data: Obligation = { ...input, id, createdAt: prev?.createdAt ?? now, updatedAt: now };
  const { id: _omit, ...stored } = data;
  background(setDoc(doc(userDoc(), 'obligations', id), stored), 'payment');
  event(prev ? 'edited' : 'created', { ob: id, title: input.title });
  return id;
}

export function setActive(ob: Obligation, active: boolean) {
  const { id, ...rest } = ob;
  background(setDoc(doc(userDoc(), 'obligations', id), { ...rest, active, updatedAt: Date.now() }), 'payment');
  event(active ? 'resumed' : 'stopped', { ob: id, title: ob.title });
}

/** Removes the obligation and every cycle record under it. */
export async function deleteObligation(ob: Obligation) {
  const batch = writeBatch(db);
  batch.delete(doc(userDoc(), 'obligations', ob.id));
  for (const occ of getState().occs.values()) {
    if (occ.obligationId === ob.id) batch.delete(doc(userDoc(), 'occurrences', occ.id));
  }
  background(batch.commit(), 'delete');
  event('deleted', { ob: ob.id, title: ob.title });
}

/* Cycles ----------------------------------------------------------------- */

function writeOcc(item: Item, patch: Partial<OccurrenceDoc>) {
  const id = occId(item.ob.id, item.originalDue);
  const prev = getState().occs.get(id);
  const next: Omit<OccurrenceDoc, 'id'> = {
    ...(prev ? stripId(prev) : {}),
    obligationId: item.ob.id,
    due: item.originalDue,
    ...patch,
    updatedAt: Date.now(),
  };
  background(setDoc(doc(userDoc(), 'occurrences', id), next), 'payment');
}

function stripId(o: OccurrenceDoc): Omit<OccurrenceDoc, 'id'> {
  const { id: _id, ...rest } = o;
  return rest;
}

/** Puts a cycle back exactly as it was (for Undo). */
export function restoreOcc(item: Item, prev: OccurrenceDoc | undefined) {
  const id = occId(item.ob.id, item.originalDue);
  const ref = doc(userDoc(), 'occurrences', id);
  if (!prev) background(deleteDoc(ref), 'undo');
  else background(setDoc(ref, { ...stripId(prev), updatedAt: Date.now() }), 'undo');
  event('undone', { occ: id, title: item.ob.title });
}

export interface PaidInput {
  amount: Paise | null;
  on: string;
  ref?: string;
  via?: string;
}

export function markPaid(item: Item, p: PaidInput) {
  writeOcc(item, {
    status: 'paid',
    paidOn: p.on,
    paidAmount: p.amount,
    ref: p.ref?.trim() || '',
    via: p.via || '',
    title: item.ob.title,
    snoozeUntil: null,
  });
  event('paid', { occ: item.key, title: item.ob.title, amount: p.amount, ref: p.ref?.trim() || '' });
}

export function confirmAutopay(item: Item, ok: boolean) {
  writeOcc(item, ok
    ? { status: 'autopaid', paidOn: item.due, paidAmount: item.amount, title: item.ob.title }
    : { status: 'failed', title: item.ob.title });
  event(ok ? 'autopaid' : 'autopay-failed', { occ: item.key, title: item.ob.title });
}

/** Back to unpaid, keeping any amount or date change made to the cycle. */
export function unsettle(item: Item) {
  writeOcc(item, { status: null, paidOn: null, paidAmount: null, ref: '', via: '' });
  event('unsettled', { occ: item.key, title: item.ob.title });
}

/**
 * A one-off payment made from the Payees screen ("Pay any amount"): recorded
 * as a single paid cycle so it shows up in history like everything else.
 */
export function recordOneOff(p: { title: string; payeeId: string; upi?: string; amount: Paise | null; ref?: string }) {
  const on = today();
  const id = saveObligation({
    title: p.title,
    category: 'person',
    amountType: 'fixed',
    amount: p.amount,
    handling: 'manual',
    method: 'upi',
    payeeId: p.payeeId,
    upi: p.upi ?? '',
    payTo: p.title,
    recurrence: { freq: 'once', interval: 1, start: on },
    remind: [],
    active: true,
  });
  const occ = occId(id, on);
  background(
    setDoc(doc(userDoc(), 'occurrences', occ), {
      obligationId: id,
      due: on,
      status: 'paid',
      paidOn: on,
      paidAmount: p.amount,
      ref: p.ref?.trim() || '',
      via: 'UPI',
      title: p.title,
      updatedAt: Date.now(),
    }),
    'payment',
  );
  event('paid', { occ, title: p.title, amount: p.amount });
}

export function skipCycle(item: Item) {
  writeOcc(item, { status: 'skipped', title: item.ob.title });
  event('skipped', { occ: item.key, title: item.ob.title });
}

export function setCycleAmount(item: Item, amount: Paise | null) {
  writeOcc(item, { amount });
  event('amount', { occ: item.key, title: item.ob.title, amount });
}

export function moveCycle(item: Item, date: string) {
  writeOcc(item, { moveTo: date === item.originalDue ? null : date, snoozeUntil: null });
  event('moved', { occ: item.key, title: item.ob.title, to: date });
}

export function snoozeCycle(item: Item, until: string) {
  writeOcc(item, { snoozeUntil: until });
  event('snoozed', { occ: item.key, title: item.ob.title, until });
}

/* Payees ----------------------------------------------------------------- */

export type PayeeInput = Omit<Payee, 'id' | 'createdAt' | 'updatedAt'>;

export function savePayee(input: PayeeInput, prev?: Payee): string {
  const id = prev?.id ?? newId();
  const now = Date.now();
  background(
    setDoc(doc(userDoc(), 'payees', id), { ...input, createdAt: prev?.createdAt ?? now, updatedAt: now }),
    'payee',
  );
  return id;
}

export function deletePayee(p: Payee) {
  background(deleteDoc(doc(userDoc(), 'payees', p.id)), 'payee');
}

/* Profile ---------------------------------------------------------------- */

export function updateProfile(patch: Partial<Profile>) {
  const current = getState().profile;
  if (!current) return;
  background(setDoc(userDoc(), { ...current, ...patch, updatedAt: Date.now() }), 'settings');
}

/* Your data -------------------------------------------------------------- */

const SUBCOLLECTIONS = ['obligations', 'occurrences', 'payees', 'events', 'devices', 'sent'] as const;

export async function exportData(): Promise<Blob> {
  const base = userDoc();
  const out: Record<string, unknown> = {
    app: 'Dueline',
    exportedAt: new Date().toISOString(),
    note: 'Amounts are in paise (1 rupee = 100 paise). Dates are YYYY-MM-DD in your timezone.',
    profile: getState().profile,
  };
  for (const name of ['obligations', 'occurrences', 'payees', 'events'] as const) {
    const snap = await getDocs(collection(base, name));
    out[name] = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }
  return new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
}

/** Deletes every document this person owns. The auth account is removed by the caller. */
export async function eraseAllData() {
  const base = userDoc();
  detachListeners();
  for (const name of SUBCOLLECTIONS) {
    const snap = await getDocs(collection(base, name));
    for (let i = 0; i < snap.docs.length; i += 400) {
      const batch = writeBatch(db);
      for (const d of snap.docs.slice(i, i + 400)) batch.delete(d.ref);
      await batch.commit();
    }
  }
  await deleteDoc(base);
}

/** Copies a guest's data into the account just signed into (ids are random, so nothing collides). */
export async function copyInto(targetUid: string, data: { obligations: Obligation[]; occs: OccurrenceDoc[]; payees: Payee[] }) {
  const base = doc(db, 'users', targetUid);
  const writes: Array<[string, string, object]> = [
    ...data.obligations.map((o) => ['obligations', o.id, o] as [string, string, object]),
    ...data.occs.map((o) => ['occurrences', o.id, o] as [string, string, object]),
    ...data.payees.map((p) => ['payees', p.id, p] as [string, string, object]),
  ];
  for (let i = 0; i < writes.length; i += 400) {
    const batch = writeBatch(db);
    for (const [col, id, value] of writes.slice(i, i + 400)) {
      const { id: _id, ...rest } = value as { id?: string };
      batch.set(doc(base, col, id), rest);
    }
    await batch.commit();
  }
}
