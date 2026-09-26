/**
 * Web Push on this device.
 *
 * The subscription lives in the browser; a copy lives at
 * users/{uid}/devices/{sha256(endpoint)} so the hourly server tick can reach
 * it. The id is derived from the endpoint, so re-registering is idempotent
 * and the test endpoint can look a device up without trusting the client.
 */

import { deleteDoc, doc, setDoc } from 'firebase/firestore';
import { API_BASE, VAPID_PUBLIC_KEY, auth, db } from './firebase';
import { sha256Hex } from './ids';

export type PushStatus =
  | 'unsupported'
  | 'needs-install' // iOS: only Home Screen apps get Web Push
  | 'denied'
  | 'off'
  | 'on';

export function isStandalone(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function isIOS(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function supported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

function keyBytes(base64: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  if (reg) return reg;
  if (import.meta.env.DEV) return null;
  return navigator.serviceWorker.ready;
}

export async function pushStatus(): Promise<PushStatus> {
  if (isIOS() && !isStandalone()) return 'needs-install';
  if (!supported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await registration();
  const sub = await reg?.pushManager.getSubscription();
  return sub && Notification.permission === 'granted' ? 'on' : 'off';
}

function deviceLabel(): string {
  const ua = navigator.userAgent;
  const os = /Android/.test(ua) ? 'Android' : isIOS() ? 'iPhone' : /Windows/.test(ua) ? 'Windows' : /Mac/.test(ua) ? 'Mac' : 'Device';
  const browser = /Edg\//.test(ua) ? 'Edge' : /SamsungBrowser/.test(ua) ? 'Samsung Internet' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  return `${browser} on ${os}`;
}

async function writeDevice(sub: PushSubscription): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error('Not signed in');
  const json = sub.toJSON();
  const id = (await sha256Hex(sub.endpoint)).slice(0, 32);
  const now = Date.now();
  await setDoc(doc(db, 'users', user.uid, 'devices', id), {
    endpoint: sub.endpoint,
    keys: { p256dh: json.keys?.p256dh ?? '', auth: json.keys?.auth ?? '' },
    label: deviceLabel(),
    createdAt: now,
    lastSeenAt: now,
  });
  return id;
}

export async function enablePush(): Promise<PushStatus> {
  if (isIOS() && !isStandalone()) return 'needs-install';
  if (!supported()) return 'unsupported';
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off';
  const reg = await registration();
  if (!reg) return 'unsupported';
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC_KEY) });
  }
  await writeDevice(sub);
  return 'on';
}

export async function disablePush(): Promise<void> {
  const reg = await registration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  const user = auth.currentUser;
  const id = (await sha256Hex(sub.endpoint)).slice(0, 32);
  if (user) await deleteDoc(doc(db, 'users', user.uid, 'devices', id)).catch(() => undefined);
  await sub.unsubscribe().catch(() => undefined);
}

/**
 * Keeps the server's copy in step with the browser: after switching accounts,
 * after the browser rotated the subscription, or once a day as a heartbeat.
 */
export async function syncDevice(): Promise<void> {
  if (!supported() || Notification.permission !== 'granted' || !auth.currentUser) return;
  const reg = await registration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  const key = `dueline.device.${auth.currentUser.uid}`;
  const last = Number(localStorage.getItem(key) || 0);
  if (Date.now() - last < 20 * 3600_000 && localStorage.getItem(`${key}.ep`) === sub.endpoint) return;
  await writeDevice(sub);
  try {
    localStorage.setItem(key, String(Date.now()));
    localStorage.setItem(`${key}.ep`, sub.endpoint);
  } catch {
    // Private mode; it will just sync again next time.
  }
}

export async function sendTestPush(): Promise<void> {
  const user = auth.currentUser;
  const reg = await registration();
  const sub = await reg?.pushManager.getSubscription();
  if (!user || !sub) throw new Error('Turn reminders on first.');
  const deviceId = await writeDevice(sub);
  const idToken = await user.getIdToken();
  const res = await fetch(`${API_BASE}/api/test-push`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ idToken, deviceId }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || 'The test didn\'t go through.');
  }
}
