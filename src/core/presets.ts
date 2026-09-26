/**
 * Starting points for the add sheet. A preset only pre-fills; everything stays
 * editable. Links are the services' own account pages, never a third-party
 * payment site.
 */

import type { AutoVia, Category, Freq, Handling, Method } from './types';

export interface KindPreset {
  category: Category;
  label: string;
  /** Title placeholder in the form. */
  hint: string;
  amountType: 'fixed' | 'variable';
  handling: Handling;
  method: Method;
  autoVia?: AutoVia;
  freq: Freq;
  interval: number;
  remind: number[];
}

export const KINDS: KindPreset[] = [
  { category: 'card', label: 'Credit card', hint: 'HDFC Regalia', amountType: 'variable', handling: 'manual', method: 'web', freq: 'months', interval: 1, remind: [5, 2, 0] },
  { category: 'rent', label: 'Rent', hint: 'Flat rent', amountType: 'fixed', handling: 'manual', method: 'upi', freq: 'months', interval: 1, remind: [3, 0] },
  { category: 'person', label: 'Someone I pay', hint: 'Maid, parking, car wash', amountType: 'fixed', handling: 'manual', method: 'upi', freq: 'months', interval: 1, remind: [1, 0] },
  { category: 'subscription', label: 'Subscription', hint: 'Netflix', amountType: 'fixed', handling: 'auto', method: 'card', autoVia: 'card', freq: 'months', interval: 1, remind: [1] },
  { category: 'mobile', label: 'Mobile', hint: 'Jio postpaid', amountType: 'fixed', handling: 'manual', method: 'web', freq: 'months', interval: 1, remind: [2, 0] },
  { category: 'electricity', label: 'Electricity', hint: 'BSES', amountType: 'variable', handling: 'manual', method: 'web', freq: 'months', interval: 1, remind: [3, 0] },
  { category: 'internet', label: 'Internet', hint: 'Home WiFi', amountType: 'fixed', handling: 'manual', method: 'web', freq: 'months', interval: 1, remind: [2, 0] },
  { category: 'emi', label: 'EMI / loan', hint: 'Car loan', amountType: 'fixed', handling: 'auto', method: 'bank', autoVia: 'bank', freq: 'months', interval: 1, remind: [2] },
  { category: 'insurance', label: 'Insurance', hint: 'Health insurance', amountType: 'fixed', handling: 'manual', method: 'web', freq: 'years', interval: 1, remind: [15, 5, 1] },
  { category: 'utility', label: 'Other bill', hint: 'Water, gas, society', amountType: 'variable', handling: 'manual', method: 'web', freq: 'months', interval: 1, remind: [2, 0] },
  { category: 'tax', label: 'Tax', hint: 'Advance tax', amountType: 'variable', handling: 'manual', method: 'web', freq: 'once', interval: 1, remind: [7, 2, 0] },
  { category: 'other', label: 'One-off', hint: 'Pay back Rohan', amountType: 'fixed', handling: 'manual', method: 'upi', freq: 'once', interval: 1, remind: [1, 0] },
];

export function kindFor(category: Category): KindPreset {
  return KINDS.find((k) => k.category === category) ?? KINDS[KINDS.length - 1];
}

export interface ServicePreset {
  name: string;
  category: Category;
  url: string;
  handling: Handling;
  autoVia?: AutoVia;
  method: Method;
  freq?: Freq;
  interval?: number;
}

/** Common Indian subscriptions and billers, matched as the title is typed. */
export const SERVICES: ServicePreset[] = [
  { name: 'Netflix', category: 'subscription', url: 'https://www.netflix.com/account', handling: 'auto', autoVia: 'card', method: 'card' },
  { name: 'Spotify', category: 'subscription', url: 'https://www.spotify.com/account/overview/', handling: 'auto', autoVia: 'card', method: 'card' },
  { name: 'YouTube Premium', category: 'subscription', url: 'https://www.youtube.com/paid_memberships', handling: 'auto', autoVia: 'card', method: 'card' },
  { name: 'Claude', category: 'subscription', url: 'https://claude.ai/settings/billing', handling: 'auto', autoVia: 'card', method: 'card' },
  { name: 'ChatGPT', category: 'subscription', url: 'https://chatgpt.com', handling: 'auto', autoVia: 'card', method: 'card' },
  { name: 'Google One', category: 'subscription', url: 'https://one.google.com', handling: 'auto', autoVia: 'upi', method: 'upi' },
  { name: 'Amazon Prime', category: 'subscription', url: 'https://www.amazon.in/gp/primecentral', handling: 'auto', autoVia: 'card', method: 'card', freq: 'years' },
  { name: 'Apple', category: 'subscription', url: 'https://support.apple.com/billing', handling: 'auto', autoVia: 'card', method: 'card' },
  { name: 'Disney+ Hotstar', category: 'subscription', url: 'https://www.hotstar.com', handling: 'auto', autoVia: 'upi', method: 'upi' },
  { name: 'Jio', category: 'mobile', url: 'https://www.jio.com', handling: 'manual', method: 'web' },
  { name: 'Airtel', category: 'mobile', url: 'https://www.airtel.in', handling: 'manual', method: 'web' },
  { name: 'Vi', category: 'mobile', url: 'https://www.myvi.in', handling: 'manual', method: 'web' },
  { name: 'GitHub', category: 'subscription', url: 'https://github.com/settings/billing', handling: 'auto', autoVia: 'card', method: 'card' },
  { name: 'Vercel', category: 'subscription', url: 'https://vercel.com/account/billing', handling: 'auto', autoVia: 'card', method: 'card' },
];

export function matchService(title: string): ServicePreset | null {
  const t = title.trim().toLowerCase();
  if (t.length < 3) return null;
  return SERVICES.find((s) => s.name.toLowerCase() === t || s.name.toLowerCase().startsWith(t)) ?? null;
}

export const METHOD_LABEL: Record<Method, string> = {
  upi: 'UPI',
  card: 'Card',
  bank: 'Bank transfer',
  cash: 'Cash',
  web: 'Website or app',
};

export const AUTO_LABEL: Record<AutoVia, string> = {
  card: 'Card',
  upi: 'UPI AutoPay',
  bank: 'Bank mandate',
  wallet: 'Wallet',
  other: 'Other',
};

export const CATEGORY_LABEL: Record<Category, string> = Object.fromEntries(
  KINDS.map((k) => [k.category, k.label]),
) as Record<Category, string>;
