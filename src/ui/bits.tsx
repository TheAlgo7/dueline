import { useEffect, useRef, useState } from 'react';
import {
  Check,
  CreditCard,
  FileText,
  Home,
  Landmark,
  Receipt,
  Repeat,
  ShieldCheck,
  Smartphone,
  User,
  Wifi,
  Zap,
  CircleDot,
  type LucideIcon,
} from 'lucide-react';
import type { Category, Item } from '../core/types';
import { inrDigits } from '../core/money';
import type { Mark } from './marks';

export const CATEGORY_ICON: Record<Category, LucideIcon> = {
  card: CreditCard,
  rent: Home,
  person: User,
  subscription: Repeat,
  mobile: Smartphone,
  electricity: Zap,
  internet: Wifi,
  emi: Landmark,
  insurance: ShieldCheck,
  utility: Receipt,
  tax: FileText,
  other: CircleDot,
};

export type Tone = 'accent' | 'late' | 'auto' | 'paid' | 'neutral';

export function toneFor(item: Item): Tone {
  switch (item.state) {
    case 'overdue':
      return 'late';
    case 'today':
    case 'soon':
      return 'accent';
    case 'auto':
    case 'confirm':
      return 'auto';
    case 'paid':
      return 'paid';
    case 'autopaid':
      return item.assumed ? 'auto' : 'paid';
    default:
      return 'neutral';
  }
}

export function Glyph({ category, tone = 'neutral', big, done, mark }: { category: Category; tone?: Tone; big?: boolean; done?: boolean; mark?: Mark | null }) {
  const cls = `glyph${tone !== 'neutral' ? ` ${tone}` : ''}${big ? ' big' : ''}`;
  // A settled payment shows the tick, whatever it is for.
  if (mark && !done && !mark.Icon) {
    const size = big ? 23 : 17;
    return (
      <span className={cls} aria-hidden data-mark={mark.name}>
        {mark.path ? (
          <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
            <path d={mark.path} />
          </svg>
        ) : (
          <span className={`glyph-letter${mark.letter.length > 1 ? ' two' : ''}`}>{mark.letter}</span>
        )}
      </span>
    );
  }
  const Icon = done ? Check : mark?.Icon ?? CATEGORY_ICON[category] ?? CircleDot;
  return (
    <span className={cls} aria-hidden data-mark={!done && mark ? mark.name : undefined}>
      <Icon size={big ? 24 : 19} strokeWidth={done ? 2.6 : 1.9} className={done ? 'check-pop' : undefined} />
    </span>
  );
}

/** The Dueline mark: a "d" drawn as a coin (what's due) and a line. */
export function Mark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" aria-hidden>
      <circle cx="226" cy="300" r="96" fill="var(--accent)" />
      <rect x="336" y="104" width="54" height="292" rx="27" fill="var(--ink)" />
    </svg>
  );
}

/** Animates between values so a payment visibly leaves the total. */
export function useCountUp(target: number, ms = 520): number {
  const [value, setValue] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    const start = performance.now();
    const a = from.current;
    if (a === target) return;
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / ms);
      const e = 1 - Math.pow(1 - k, 3);
      const raw = a + (target - a) * e;
      // Whole rupees while moving, so the total never flickers through paise.
      const v = k < 1 && target % 100 === 0 ? Math.round(raw / 100) * 100 : Math.round(raw);
      setValue(v);
      if (k < 1) raf = requestAnimationFrame(step);
      else from.current = target;
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      from.current = target;
    };
  }, [target, ms]);
  return value;
}

export function Rupees({ paise, className }: { paise: number; className?: string }) {
  return (
    <span className={className}>
      <span className="rupee">₹</span>
      <span className="num">{inrDigits(paise)}</span>
    </span>
  );
}
