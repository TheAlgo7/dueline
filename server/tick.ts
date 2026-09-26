/**
 * GET /api/tick. The reminder engine.
 *
 * Vercel Hobby allows 100 cron jobs per project but each may run only once a
 * day, so vercel.json registers 24 of them, one per UTC hour. Each run:
 *
 *   1. lists every push-enabled device (one collection-group read),
 *   2. for each person, plans notices from their schedule (src/core/notify),
 *   3. keeps the ones due around now that are not in their `sent` log,
 *   4. claims each by creating `sent/{id}` (create-only in the rules, so a
 *      concurrent or repeated tick loses the race and sends nothing),
 *   5. pushes to every device, pruning subscriptions the push service says
 *      are gone.
 *
 * Missed ticks self-heal: anything not yet sent and under 18 hours late goes
 * out on the next run.
 */

import {
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  setDoc,
  where,
} from 'firebase/firestore/lite';
import { addDays, todayIn } from '../src/core/dates';
import { dueNow, planNotices, toPayloads, type Notice } from '../src/core/notify';
import { DEFAULT_PROFILE, type Obligation, type OccurrenceDoc, type Profile } from '../src/core/types';
import { sendPush, type Subscription } from './push';
import { robot } from './robot';

interface UserReport {
  uid: string;
  devices: number;
  planned: number;
  sent: number;
  pushes: number;
  pruned: number;
  error?: string;
}

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get('authorization') === `Bearer ${secret}`;
}

type Device = Subscription & { id: string; createdAt: number };

/** New subscriptions can read as "gone" until FCM propagates them; never prune those. */
const PRUNE_GRACE_MS = 10 * 60_000;

async function processUser(uid: string, subs: Device[], now: number, dry: boolean): Promise<UserReport> {
  const { db } = await robot();
  const report: UserReport = { uid: uid.slice(0, 6), devices: subs.length, planned: 0, sent: 0, pushes: 0, pruned: 0 };
  const userRef = doc(db, 'users', uid);
  const [pSnap, obSnap, occSnap, sentSnap] = await Promise.all([
    getDoc(userRef),
    getDocs(collection(userRef, 'obligations')),
    getDocs(query(collection(userRef, 'occurrences'), where('due', '>=', addDays(todayIn('UTC', now), -60)))),
    getDocs(query(collection(userRef, 'sent'), where('at', '>', now - 3 * 86400_000))),
  ]);
  const profile: Profile = { ...DEFAULT_PROFILE, createdAt: 0, updatedAt: 0, ...(pSnap.data() as Partial<Profile> | undefined) };
  const obligations = obSnap.docs.map((d) => ({ ...(d.data() as Obligation), id: d.id }));
  const occs = new Map(occSnap.docs.map((d) => [d.id, { ...(d.data() as OccurrenceDoc), id: d.id }]));
  const already = new Set(sentSnap.docs.map((d) => d.id));

  // Once a day, drop log entries older than a month (the rules allow nothing younger).
  if (!dry && new Date(now).getUTCHours() === 21) {
    const old = await getDocs(query(collection(userRef, 'sent'), where('at', '<', now - 31 * 86400_000), limit(200)));
    await Promise.all(old.docs.map((d) => deleteDoc(d.ref).catch(() => undefined)));
  }

  const due = dueNow(planNotices(profile, obligations, occs, now), now).filter((n) => !already.has(n.id));
  report.planned = due.length;
  if (!due.length || dry) return report;

  const claimed: Notice[] = [];
  await Promise.all(
    due.map(async (n) => {
      try {
        await setDoc(doc(userRef, 'sent', n.id), { at: now, kind: n.kind, item: n.itemKey, fireAt: n.fireAt });
        claimed.push(n);
      } catch {
        // Another tick claimed it first.
      }
    }),
  );
  claimed.sort((a, b) => a.fireAt - b.fireAt);
  report.sent = claimed.length;
  if (!claimed.length) return report;

  const payloads = toPayloads(claimed, now, todayIn(profile.tz, now));
  for (const sub of subs) {
    for (const p of payloads) {
      const urgent = claimed.some((n) => n.needsYou && (n.kind === 'due' || n.kind === 'late' || n.kind === 'evening'));
      const r = await sendPush(sub, p, urgent ? 'high' : 'normal');
      if (r.ok) report.pushes++;
      else if (r.gone && Date.now() - sub.createdAt > PRUNE_GRACE_MS) {
        await deleteDoc(doc(userRef, 'devices', sub.id)).catch(() => undefined);
        report.pruned++;
        break;
      } else report.error = `${r.status ?? ''} ${r.error}`.trim();
    }
  }
  return report;
}

export async function GET(request: Request): Promise<Response> {
  if (!authorized(request)) return new Response('Unauthorized', { status: 401 });
  const url = new URL(request.url);
  const dry = url.searchParams.get('dry') === '1';
  const at = Number(url.searchParams.get('at')) || Date.now();
  const started = Date.now();
  try {
    const { db } = await robot();
    const devices = await getDocs(collectionGroup(db, 'devices'));
    const byUser = new Map<string, Device[]>();
    for (const d of devices.docs) {
      const uid = d.ref.parent.parent?.id;
      const data = d.data() as Subscription & { createdAt?: number };
      if (!uid || !data?.endpoint || !data?.keys) continue;
      const list = byUser.get(uid) ?? [];
      list.push({ id: d.id, endpoint: data.endpoint, keys: data.keys, createdAt: data.createdAt ?? 0 });
      byUser.set(uid, list);
    }
    const users: UserReport[] = [];
    for (const [uid, subs] of byUser) {
      try {
        users.push(await processUser(uid, subs, at, dry));
      } catch (e) {
        users.push({ uid: uid.slice(0, 6), devices: subs.length, planned: 0, sent: 0, pushes: 0, pruned: 0, error: String((e as Error).message ?? e).slice(0, 200) });
      }
    }
    if (!dry) await setDoc(doc(db, 'system', 'tick'), { at: Date.now() }).catch(() => undefined);
    return Response.json({ ok: true, dry, at: new Date(at).toISOString(), ms: Date.now() - started, users });
  } catch (e) {
    return Response.json({ ok: false, error: String((e as Error).message ?? e) }, { status: 500 });
  }
}
