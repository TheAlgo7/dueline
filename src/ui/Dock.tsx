import { useRef } from 'react';
import { CalendarDays, CircleUserRound, ListChecks, Plus, Users } from 'lucide-react';
import { go, type Tab } from '../lib/router';
import { openSheet } from '../lib/sheets';
import { useLiquidGlass } from './useLiquidGlass';

const TABS: Array<{ tab: Tab; label: string; Icon: typeof ListChecks }> = [
  { tab: 'due', label: 'Due', Icon: ListChecks },
  { tab: 'calendar', label: 'Calendar', Icon: CalendarDays },
  { tab: 'payees', label: 'Payees', Icon: Users },
  { tab: 'you', label: 'You', Icon: CircleUserRound },
];

/**
 * WearWise's dock: a compact glass pill of icon-only tabs where the active
 * one opens into icon + label, and one solid action beside it. Marigold is
 * reserved for that action.
 */
export function Dock({ tab, badge }: { tab: Tab; badge: boolean }) {
  const glass = useRef<HTMLDivElement>(null);
  useLiquidGlass(glass, 'dueline-dock-glass');
  return (
    <nav className="dock" aria-label="Main">
      <div ref={glass} className="dock-glass">
        {TABS.map(({ tab: t, label, Icon }) => {
          const active = t === tab;
          return (
            <button
              key={t}
              type="button"
              className="dock-tab"
              aria-label={label}
              aria-current={active ? 'page' : undefined}
              onClick={() => {
                if (active) window.scrollTo({ top: 0, behavior: 'smooth' });
                else go(t);
              }}
            >
              <Icon size={21} strokeWidth={active ? 2.1 : 1.8} aria-hidden />
              <span className="label">{label}</span>
              {t === 'due' && badge && !active ? <span className="dock-badge" aria-hidden /> : null}
            </button>
          );
        })}
      </div>
      <button type="button" className="dock-add" aria-label="Add a payment" onClick={() => openSheet({ kind: 'add' })}>
        <Plus size={26} strokeWidth={2.4} aria-hidden />
      </button>
    </nav>
  );
}
