/**
 * UPI handoff. Dueline never moves money: it builds the standard upi://pay
 * intent (NPCI linking spec) and lets the phone's own UPI app do the rest.
 * No PIN, no account number, no pretending a payment succeeded because the
 * browser came back into focus.
 */

import type { Paise } from './types';

const VPA = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,255}@[a-zA-Z][a-zA-Z0-9.-]{1,63}$/;

export function isVpa(s: string | undefined | null): boolean {
  return !!s && VPA.test(s.trim());
}

export function normalizeVpa(s: string): string {
  return s.trim().replace(/\s+/g, '').toLowerCase();
}

export interface UpiIntent {
  vpa: string;
  name?: string;
  amount?: Paise | null;
  note?: string;
}

/** upi://pay?pa=...&pn=...&am=1500.00&cu=INR&tn=... */
export function upiLink({ vpa, name, amount, note }: UpiIntent): string {
  const q: string[] = [`pa=${encodeURIComponent(normalizeVpa(vpa))}`];
  if (name) q.push(`pn=${encodeURIComponent(name.slice(0, 40))}`);
  if (amount && amount > 0) q.push(`am=${(amount / 100).toFixed(2)}`);
  q.push('cu=INR');
  if (note) q.push(`tn=${encodeURIComponent(note.slice(0, 50))}`);
  return `upi://pay?${q.join('&')}`;
}

/** Only http(s) links are ever opened from stored data. */
export function safeUrl(s: string | undefined | null): string | null {
  if (!s) return null;
  const t = s.trim();
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(t) ? t : `https://${t}`;
  try {
    const u = new URL(withScheme);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null;
  } catch {
    return null;
  }
}

/** "claude.ai" from "https://claude.ai/settings/billing" */
export function hostOf(url: string | undefined | null): string {
  const u = safeUrl(url);
  if (!u) return '';
  return new URL(u).hostname.replace(/^www\./, '');
}
