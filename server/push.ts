import webpush from 'web-push';
import type { PushPayload } from '../src/core/notify';

let configured = false;

function configure() {
  if (configured) return;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) throw new Error('VAPID keys are not configured');
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:gaurav@thealgothrim.com', pub, priv);
  configured = true;
}

export interface Subscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export type PushResult = { ok: true } | { ok: false; gone: boolean; status?: number; error: string };

export async function sendPush(sub: Subscription, payload: PushPayload, urgency: 'low' | 'normal' | 'high' = 'normal'): Promise<PushResult> {
  configure();
  try {
    // A hung push service must not stall the tick past the claim-release window.
    await webpush.sendNotification(sub, JSON.stringify(payload), { TTL: 6 * 3600, urgency, timeout: 10_000 });
    return { ok: true };
  } catch (e) {
    const status = (e as { statusCode?: number }).statusCode;
    return { ok: false, gone: status === 404 || status === 410, status, error: String((e as Error).message ?? e).slice(0, 200) };
  }
}
