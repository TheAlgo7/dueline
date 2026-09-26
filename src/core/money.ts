/**
 * Money is integer paise everywhere. Rupees exist only at the edges: parsing
 * what someone typed and formatting what they read.
 */

import type { Paise } from './types';

const whole = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
const exact = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** "₹1,48,720" or "₹799.50" (paise shown only when there are any). */
export function inr(p: Paise | null | undefined): string {
  if (p == null) return '₹ ?';
  const neg = p < 0;
  const abs = Math.abs(p);
  const body = abs % 100 === 0 ? whole.format(abs / 100) : exact.format(abs / 100);
  return `${neg ? '-' : ''}₹${body}`;
}

/** Digits only, no symbol: "1,48,720". */
export function inrDigits(p: Paise): string {
  const abs = Math.abs(p);
  return abs % 100 === 0 ? whole.format(abs / 100) : exact.format(abs / 100);
}

/** Compact for tight spaces: ₹850, ₹12.4k, ₹1.2L, ₹3.4Cr. */
export function inrCompact(p: Paise): string {
  const r = Math.abs(p) / 100;
  const sign = p < 0 ? '-' : '';
  if (r < 1000) return `${sign}₹${Math.round(r)}`;
  if (r < 100000) return `${sign}₹${trim(r / 1000)}k`;
  if (r < 10000000) return `${sign}₹${trim(r / 100000)}L`;
  return `${sign}₹${trim(r / 10000000)}Cr`;
}

function trim(n: number): string {
  const s = n >= 100 ? Math.round(n).toString() : n.toFixed(1);
  return s.endsWith('.0') ? s.slice(0, -2) : s;
}

/**
 * Parse typed rupees into paise. Accepts "1500", "1,500", "₹ 1,500.5",
 * "1.5k" and "2L". Returns null for anything that is not a positive amount.
 */
export function parseRupees(input: string): Paise | null {
  const s = input.trim().toLowerCase().replace(/[₹,\s]/g, '').replace(/^rs\.?/, '');
  if (!s) return null;
  const m = s.match(/^(\d+(?:\.\d{0,2})?)(k|l|lakh|cr)?$/);
  if (!m) return null;
  const mult = m[2] === 'k' ? 1000 : m[2] === 'l' || m[2] === 'lakh' ? 100000 : m[2] === 'cr' ? 10000000 : 1;
  const [ints, frac = ''] = m[1].split('.');
  // String maths so 0.1 + 0.2 never happens.
  const paise = BigInt(ints) * 100n + BigInt((frac + '00').slice(0, 2));
  const total = paise * BigInt(mult);
  if (total <= 0n || total > 100000000000n) return null;
  return Number(total);
}

/** Paise to the plain rupee string an input field should show: "1500" or "799.5". */
export function toInput(p: Paise | null | undefined): string {
  if (p == null) return '';
  const r = Math.floor(p / 100);
  const f = p % 100;
  if (!f) return String(r);
  return `${r}.${String(f).padStart(2, '0').replace(/0$/, '')}`;
}

export function sum(values: Array<Paise | null | undefined>): Paise {
  let t = 0;
  for (const v of values) if (v) t += v;
  return t;
}
