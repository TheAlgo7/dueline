/**
 * Security rules, run against the Firestore emulator:
 *   npm run test:rules
 * The person owns everything under users/{uid}. The reminder robot can read
 * schedules and create `sent` entries, and can never touch money data.
 */
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collectionGroup, deleteDoc, doc, getDoc, getDocs, serverTimestamp, setDoc, Timestamp, updateDoc } from 'firebase/firestore';

const ROBOT = readFileSync('firestore.rules', 'utf8').match(/request\.auth\.uid == '([^']+)'/)![1];
let env: RulesTestEnvironment;

const now = Date.now();
const profile = { tz: 'Asia/Kolkata', remindHour: 9, evening: true, eveningHour: 20, autopayCheck: 'ask', payday: null, createdAt: now, updatedAt: now };
const ob = {
  title: 'Parking', category: 'person', amountType: 'fixed', amount: 150000, handling: 'manual', method: 'upi',
  upi: 'rahul@okaxis', payTo: 'Rahul', recurrence: { freq: 'months', interval: 1, start: '2026-10-01' },
  remind: [1, 0], active: true, createdAt: now, updatedAt: now,
};
const occ = { obligationId: 'o1', due: '2026-10-01', status: 'paid', paidOn: '2026-10-01', paidAmount: 150000, updatedAt: now };
const device = { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys: { p256dh: 'x', auth: 'y' }, label: 'Chrome on Android', createdAt: now, lastSeenAt: now };

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'dueline-app',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  });
});

afterAll(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users/alice'), profile);
    await setDoc(doc(db, 'users/alice/obligations/o1'), ob);
    await setDoc(doc(db, 'users/alice/devices/d1'), device);
  });
});

const as = (uid: string) => env.authenticatedContext(uid).firestore();

describe('owner', () => {
  it('reads and writes their own data', async () => {
    const db = as('alice');
    await assertSucceeds(getDoc(doc(db, 'users/alice/obligations/o1')));
    await assertSucceeds(setDoc(doc(db, 'users/alice/obligations/o2'), { ...ob, title: 'Maid' }));
    await assertSucceeds(setDoc(doc(db, 'users/alice/occurrences/o1_20261001'), occ));
    await assertSucceeds(setDoc(doc(db, 'users/alice/payees/p1'), { name: 'Rahul', upi: 'rahul@okaxis', createdAt: now, updatedAt: now }));
    await assertSucceeds(updateDoc(doc(db, 'users/alice'), { remindHour: 8, updatedAt: now + 1 }));
    await assertSucceeds(deleteDoc(doc(db, 'users/alice/obligations/o1')));
  });

  it('cannot write malformed money or unknown profile keys', async () => {
    const db = as('alice');
    await assertFails(setDoc(doc(db, 'users/alice/obligations/bad'), { ...ob, amount: 15.5 }));
    await assertFails(setDoc(doc(db, 'users/alice/obligations/bad'), { ...ob, amount: -100 }));
    await assertFails(setDoc(doc(db, 'users/alice/obligations/bad'), { ...ob, title: '' }));
    await assertFails(setDoc(doc(db, 'users/alice/occurrences/x'), { ...occ, due: '1 Oct' }));
    await assertFails(updateDoc(doc(db, 'users/alice'), { isAdmin: true, updatedAt: now }));
    await assertFails(setDoc(doc(db, 'users/alice/devices/d2'), { ...device, endpoint: 'http://evil' }));
  });

  it('cannot write a schedule the engine would choke on', async () => {
    const db = as('alice');
    const bad = (patch: object) => setDoc(doc(db, 'users/alice/obligations/bad'), { ...ob, ...patch });
    const rec = (patch: object) => bad({ recurrence: { ...ob.recurrence, ...patch } });
    await assertSucceeds(bad({
      handling: 'auto', autoVia: 'card', payeeId: null,
      recurrence: { freq: 'months', interval: 1, start: '2026-10-31', eom: true, until: null, count: 12 },
      remind: [30, 15, 0],
    }));
    await assertFails(bad({ category: 'gambling' }));
    await assertFails(bad({ autoVia: 'crypto' }));
    await assertFails(bad({ payeeId: 42 }));
    await assertFails(bad({ isVerified: true }));
    await assertFails(bad({ remind: [1, 99] }));
    await assertFails(bad({ remind: ['1'] }));
    await assertFails(rec({ every: 'day' }));
    await assertFails(rec({ eom: 'yes' }));
    await assertFails(rec({ count: 0 }));
    await assertFails(rec({ count: 2.5 }));
    await assertFails(rec({ until: 'next year' }));
    await assertFails(setDoc(doc(db, 'users/alice/occurrences/o1_20261001'), { ...occ, extra: 1 }));
    await assertFails(setDoc(doc(db, 'users/alice/payees/p1'), { name: 'Rahul', createdAt: now, updatedAt: now, pin: '1234' }));
    await assertFails(setDoc(doc(db, 'users/alice/devices/d2'), { ...device, extra: 1 }));
    await assertFails(setDoc(doc(db, 'users/alice/devices/d2'), { ...device, keys: { ...device.keys, other: 'z' } }));
  });

  it('cannot write the reminder log or rewrite history', async () => {
    const db = as('alice');
    await assertFails(setDoc(doc(db, 'users/alice/sent/n1'), { at: now }));
    await assertSucceeds(setDoc(doc(db, 'users/alice/events/e1'), { at: now, action: 'paid' }));
    await assertFails(updateDoc(doc(db, 'users/alice/events/e1'), { action: 'edited' }));
  });
});

describe('heartbeat', () => {
  it('only the robot writes it, anyone signed in reads it', async () => {
    await assertSucceeds(setDoc(doc(as(ROBOT), 'system/tick'), { at: now }));
    await assertFails(setDoc(doc(as(ROBOT), 'system/tick'), { at: now, extra: 1 }));
    await assertFails(setDoc(doc(as('alice'), 'system/tick'), { at: now }));
    await assertSucceeds(getDoc(doc(as('alice'), 'system/tick')));
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'system/tick')));
  });
});

describe('strangers', () => {
  it('see and touch nothing', async () => {
    const db = as('mallory');
    await assertFails(getDoc(doc(db, 'users/alice')));
    await assertFails(getDoc(doc(db, 'users/alice/obligations/o1')));
    await assertFails(setDoc(doc(db, 'users/alice/obligations/o9'), ob));
    await assertFails(getDocs(collectionGroup(db, 'devices')));
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'users/alice')));
  });
});

describe('robot', () => {
  it('reads schedules and devices across users', async () => {
    const db = as(ROBOT);
    await assertSucceeds(getDoc(doc(db, 'users/alice')));
    await assertSucceeds(getDocs(collectionGroup(db, 'devices')));
    await assertSucceeds(getDoc(doc(db, 'users/alice/obligations/o1')));
  });

  it('claims a notice exactly once, on the server clock', async () => {
    const db = as(ROBOT);
    await assertFails(setDoc(doc(db, 'users/alice/sent/n0'), { at: now, kind: 'before' }));
    await assertFails(setDoc(doc(db, 'users/alice/sent/n0'), { at: now, kind: 'before', claimedAt: Timestamp.fromMillis(now + 86400000) }));
    await assertSucceeds(setDoc(doc(db, 'users/alice/sent/n1'), { at: now, kind: 'before', claimedAt: serverTimestamp() }));
    await assertFails(setDoc(doc(db, 'users/alice/sent/n1'), { at: now + 1, kind: 'before', claimedAt: serverTimestamp() }));
  });

  it('releases a fresh claim so the next tick retries, but not a stale one', async () => {
    const db = as(ROBOT);
    await assertSucceeds(setDoc(doc(db, 'users/alice/sent/n1'), { at: now, kind: 'due', claimedAt: serverTimestamp() }));
    await assertSucceeds(deleteDoc(doc(db, 'users/alice/sent/n1')));
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users/alice/sent/n2'), { at: now, kind: 'due', claimedAt: Timestamp.fromMillis(Date.now() - 20 * 60000) });
      await setDoc(doc(ctx.firestore(), 'users/alice/sent/n3'), { at: now, kind: 'due' });
    });
    await assertFails(deleteDoc(doc(db, 'users/alice/sent/n2')));
    await assertFails(deleteDoc(doc(db, 'users/alice/sent/n3')));
  });

  it('prunes only month-old reminder log entries', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users/alice/sent/old'), { at: now - 40 * 86400000 });
      await setDoc(doc(ctx.firestore(), 'users/alice/sent/new'), { at: now - 2 * 86400000 });
    });
    const db = as(ROBOT);
    await assertSucceeds(deleteDoc(doc(db, 'users/alice/sent/old')));
    await assertFails(deleteDoc(doc(db, 'users/alice/sent/new')));
  });

  it('prunes dead devices but never writes money data or payees', async () => {
    const db = as(ROBOT);
    await assertSucceeds(deleteDoc(doc(db, 'users/alice/devices/d1')));
    await assertFails(setDoc(doc(db, 'users/alice/obligations/o1'), { ...ob, amount: 1 }));
    await assertFails(setDoc(doc(db, 'users/alice/occurrences/o1_20261001'), occ));
    await assertFails(getDoc(doc(db, 'users/alice/payees/p1')));
    await assertFails(setDoc(doc(db, 'users/alice'), profile));
  });
});
