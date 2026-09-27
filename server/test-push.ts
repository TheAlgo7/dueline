/**
 * POST /api/test-push { idToken, deviceId }
 *
 * "Send a test" in the app. The Firebase ID token is verified against
 * Google's public keys (no Admin SDK needed), then the robot looks up that
 * person's own device by id, so the endpoint can only ever notify the caller.
 */

import { createRemoteJWKSet, jwtVerify } from 'jose';
import { doc, getDoc } from 'firebase/firestore/lite';
import { FIREBASE_CONFIG, robot } from './robot';
import { sendPush, type Subscription } from './push';
import { stamp } from './version';

const JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'),
);

const ORIGINS = new Set([
  'https://dueline-app.web.app',
  'https://dueline-app.firebaseapp.com',
  'http://localhost:5173',
  'http://localhost:4173',
]);

function cors(request: Request): Record<string, string> {
  const origin = request.headers.get('origin') ?? '';
  return ORIGINS.has(origin)
    ? {
        'access-control-allow-origin': origin,
        'access-control-allow-methods': 'POST, OPTIONS',
        'access-control-allow-headers': 'content-type',
        'access-control-max-age': '86400',
        vary: 'origin',
      }
    : {};
}

export function OPTIONS(request: Request): Response {
  return stamp(new Response(null, { status: 204, headers: cors(request) }));
}

export async function POST(request: Request): Promise<Response> {
  return stamp(await send(request));
}

async function send(request: Request): Promise<Response> {
  const headers = cors(request);
  const fail = (status: number, error: string) => Response.json({ ok: false, error }, { status, headers });
  let body: { idToken?: string; deviceId?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return fail(400, 'Bad request');
  }
  if (!body.idToken || !body.deviceId || !/^[a-f0-9]{16,64}$/.test(body.deviceId)) return fail(400, 'Bad request');

  let uid: string;
  try {
    const { payload } = await jwtVerify(body.idToken, JWKS, {
      issuer: `https://securetoken.google.com/${FIREBASE_CONFIG.projectId}`,
      audience: FIREBASE_CONFIG.projectId,
    });
    uid = String(payload.sub ?? '');
    if (!uid) return fail(401, 'Not signed in');
  } catch {
    return fail(401, 'Not signed in');
  }

  const { db } = await robot();
  const snap = await getDoc(doc(db, 'users', uid, 'devices', body.deviceId));
  if (!snap.exists()) return fail(404, 'This device is not registered for reminders yet');
  const sub = snap.data() as Subscription & { createdAt?: number };
  const payload = {
    title: 'Dueline reminders are on',
    body: 'This is how a reminder will look on this device.',
    tag: 'dueline-test',
    url: '/you',
    actions: [],
    ts: Date.now(),
  };
  // FCM answers 410 for a few seconds after a subscription is created, until
  // the registration propagates. A brand-new device gets a few patient retries.
  const fresh = Date.now() - (sub.createdAt ?? 0) < 120_000;
  let r = await sendPush(sub, payload, 'high');
  for (let attempt = 0; !r.ok && r.gone && fresh && attempt < 4; attempt++) {
    await new Promise((res) => setTimeout(res, 2500));
    r = await sendPush(sub, payload, 'high');
  }
  if (!r.ok && r.gone && fresh) return fail(503, 'The push service is still setting up this device. Try again in a few seconds.');
  if (!r.ok) {
    const why = r.gone ? 'This device unsubscribed. Turn reminders off and on again.' : 'The push service refused the message.';
    return fail(502, `${why} (${r.status ?? 'no status'}: ${r.error.slice(0, 120)})`);
  }
  return Response.json({ ok: true }, { headers });
}
