import { useEffect, useMemo, useState } from 'react';
import { BellRing, CloudOff, Search, ShieldAlert, Smartphone } from 'lucide-react';
import { longDate, shortDate } from '../core/dates';
import { inr, inrDigits } from '../core/money';
import { KINDS } from '../core/presets';
import { sections, summarize, type Section } from '../core/timeline';
import { enablePush, pushStatus, type PushStatus } from '../lib/push';
import { useDueItems, useToday } from '../lib/select';
import { openSheet } from '../lib/sheets';
import { useStore } from '../lib/store';
import { toast } from '../lib/toast';
import { Glyph, useCountUp } from '../ui/bits';
import { ItemRow } from '../ui/ItemRow';
import { go } from '../lib/router';
import { useOnline } from '../lib/online';

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

function remember(key: string): [boolean, () => void] {
  let v = false;
  try {
    v = Number(localStorage.getItem(key) || 0) > Date.now();
  } catch {
    // ignore
  }
  return [
    v,
    () => {
      try {
        localStorage.setItem(key, String(Date.now() + 7 * 86400_000));
      } catch {
        // ignore
      }
    },
  ];
}

function Onboarding() {
  return (
    <div className="empty">
      <h2>What do you pay every month?</h2>
      <p>Pick one to start. Cards, rent, the people you pay by UPI, subscriptions that renew on their own. Add the rest whenever.</p>
      <div className="kind-grid">
        {KINDS.map((k, i) => (
          <button key={k.category} type="button" className="kind" style={{ ['--i' as string]: i }} onClick={() => openSheet({ kind: 'add', category: k.category })}>
            <Glyph category={k.category} />
            {k.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Banners({ hasItems }: { hasItems: boolean }) {
  const user = useStore((s) => s.user);
  const [push, setPush] = useState<PushStatus | null>(null);
  const [pushHidden, hidePush] = remember('dueline.hide.push');
  const [guestHidden, hideGuest] = remember('dueline.hide.guest');
  const [, force] = useState(0);
  useEffect(() => {
    pushStatus().then(setPush).catch(() => setPush('unsupported'));
  }, []);
  const count = useStore((s) => s.obligations.length);

  if (!hasItems) return null;
  if (push === 'off' && !pushHidden) {
    return (
      <div className="banner">
        <BellRing size={18} />
        <div>
          <strong>Get reminded before things are due.</strong> Dueline can nudge you the morning a payment is due, and not a moment more.{' '}
          <button
            type="button"
            className="link-btn"
            onClick={async () => {
              const s = await enablePush().catch(() => 'off' as PushStatus);
              setPush(s);
              toast(s === 'on' ? 'Reminders are on for this device' : s === 'denied' ? 'Notifications are blocked in browser settings' : 'Reminders stayed off', { tone: s === 'on' ? 'paid' : 'default' });
            }}
          >
            Turn on
          </button>{' '}
          <button type="button" className="link-btn" style={{ color: 'var(--ink-3)' }} onClick={() => { hidePush(); force((n) => n + 1); }}>
            Not now
          </button>
        </div>
      </div>
    );
  }
  if (push === 'needs-install' && !pushHidden) {
    return (
      <div className="banner">
        <Smartphone size={18} />
        <div>
          <strong>Add Dueline to your Home Screen for reminders.</strong> iPhone only sends notifications to installed apps.{' '}
          <button type="button" className="link-btn" onClick={() => openSheet({ kind: 'install' })}>
            Show me how
          </button>
        </div>
      </div>
    );
  }
  if (user?.isAnonymous && count >= 3 && !guestHidden) {
    return (
      <div className="banner">
        <ShieldAlert size={18} />
        <div>
          <strong>These payments only live on this device.</strong> Save them to an account so a new phone doesn't mean starting over.{' '}
          <button type="button" className="link-btn" onClick={() => openSheet({ kind: 'account', mode: 'create' })}>
            Save them
          </button>{' '}
          <button type="button" className="link-btn" style={{ color: 'var(--ink-3)' }} onClick={() => { hideGuest(); force((n) => n + 1); }}>
            Later
          </button>
        </div>
      </div>
    );
  }
  return null;
}

function SectionBlock({ section }: { section: Section }) {
  const open = section.items.filter((i) => i.state !== 'paid' && i.state !== 'autopaid' && i.state !== 'skipped');
  const subtotal = open.reduce((t, i) => t + (i.amount ?? 0), 0);
  return (
    <section className="section" aria-labelledby={`sec-${section.id}`}>
      <div className="section-head">
        <h2 id={`sec-${section.id}`} className={`section-title${section.id === 'overdue' ? ' late' : ''}`}>
          {section.title}
        </h2>
        {subtotal > 0 && section.id !== 'confirm' ? <span className="section-sub num">{inr(subtotal)}</span> : null}
      </div>
      <div className="rows">
        {section.items.map((it, i) => (
          <ItemRow key={it.key} item={it} index={i} confirmInline={section.id === 'confirm'} />
        ))}
      </div>
    </section>
  );
}

export function Due() {
  const today = useToday();
  const items = useDueItems();
  const loaded = useStore((s) => s.loaded);
  const offline = useOnline() === false;
  const count = useStore((s) => s.obligations.filter((o) => o.active).length);
  const payday = useStore((s) => s.profile?.payday ?? null);

  const summary = useMemo(() => {
    const s = summarize(items, today, payday);
    const month = items
      .filter((i) => (i.state === 'overdue' || i.state === 'today' || i.state === 'soon' || i.state === 'upcoming' || i.state === 'auto') && i.daysLeft <= 30)
      .reduce((t, i) => t + (i.amount ?? 0), 0);
    return { ...s, month };
  }, [items, today, payday]);
  const secs = useMemo(() => {
    const all = sections(items);
    return all.map((s) => (s.id === 'later' ? { ...s, items: s.items.filter((i) => i.daysLeft <= 30) } : s)).filter((s) => s.items.length);
  }, [items]);
  const shown = useCountUp(summary.week.amount);
  const week = summary.week;

  return (
    <div className="screen">
      <header className="topbar">
        <div className="topbar-date">
          {longDate(today)}
          {offline ? (
            <span className="offline-dot" style={{ marginLeft: 10 }}>
              <CloudOff size={13} /> Offline
            </span>
          ) : null}
        </div>
        <div className="topbar-actions">
          <button type="button" className="icon-btn" aria-label="Search" onClick={() => openSheet({ kind: 'search' })}>
            <Search size={21} />
          </button>
        </div>
      </header>

      {!loaded ? (
        <div className="center-fill">
          <div className="spinner" />
        </div>
      ) : count === 0 ? (
        <Onboarding />
      ) : (
        <>
          <div className="hero">
            <div className={`hero-amount num${week.amount === 0 ? ' is-zero' : ''}`} aria-label={inr(week.amount)}>
              <span className="rupee">₹</span>
              {inrDigits(shown)}
            </div>
            <p className="hero-caption">
              {week.count === 0 ? (
                <>Nothing needs you this week.</>
              ) : (
                <>
                  <strong>{plural(week.count, 'payment needs', 'payments need')} you</strong> in the next 7 days
                  {week.estimates ? `, with ${plural(week.estimates, 'estimate', 'estimates')}` : ''}
                  {week.unknown ? `. ${plural(week.unknown, 'bill has', 'bills have')} no amount yet` : ''}.
                </>
              )}
            </p>
            {summary.overdue.count ? (
              <p className="hero-late">
                {inr(summary.overdue.amount)} of it is overdue
              </p>
            ) : null}
          </div>

          <div className="stats">
            <button type="button" className="stat" onClick={() => go('calendar')}>
              <div className="stat-value auto num">{inr(summary.auto.amount)}</div>
              <div className="stat-label">
                {summary.auto.count ? `${plural(summary.auto.count, 'AutoPay', 'AutoPays')} this week` : 'No AutoPays this week'}
              </div>
            </button>
            {summary.payday ? (
              <div className="stat">
                <div className="stat-value num">{inr(summary.payday.total.amount)}</div>
                <div className="stat-label">Before payday, {shortDate(summary.payday.date)}</div>
              </div>
            ) : (
              <div className="stat">
                <div className="stat-value num">{inr(summary.month)}</div>
                <div className="stat-label">Due in the next 30 days</div>
              </div>
            )}
          </div>

          <Banners hasItems={count > 0} />

          {secs.length === 0 ? (
            <div className="calm">
              <h2>All clear for a month.</h2>
              <p>Nothing is due in the next 30 days. The calendar has everything after that.</p>
            </div>
          ) : (
            secs.map((s) => <SectionBlock key={s.id} section={s} />)
          )}

          {secs.length ? (
            <p className="footer-credit" style={{ marginTop: 28 }}>
              Showing the next 30 days.{' '}
              <button type="button" className="link-btn" onClick={() => go('calendar')}>
                Open the calendar
              </button>
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
