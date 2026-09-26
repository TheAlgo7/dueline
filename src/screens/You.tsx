import { useEffect, useMemo, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { BellRing, ChevronRight, Download, History, LogOut, Smartphone, Trash2, UserRound } from 'lucide-react';
import { hourLabel, mediumDate, ordinal, todayIn, zoned } from '../core/dates';
import { planNotices, upcomingNotices } from '../core/notify';
import { exportData, updateProfile } from '../lib/actions';
import { signOutEverywhere } from '../lib/auth';
import { disablePush, enablePush, isIOS, isStandalone, pushStatus, sendTestPush, type PushStatus } from '../lib/push';
import { openSheet } from '../lib/sheets';
import { useStore } from '../lib/store';
import { toast } from '../lib/toast';
import { Seg, Switch, ToggleRow } from '../ui/controls';
import { installAvailable, promptInstall, useInstallable } from '../lib/install';

const HOURS = Array.from({ length: 18 }, (_, i) => i + 6); // 6 AM to 11 PM

function PushRow() {
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    pushStatus().then(setStatus).catch(() => setStatus('unsupported'));
  }, []);

  const sub: Record<PushStatus, string> = {
    on: 'This device will get reminders.',
    off: 'Off on this device.',
    denied: 'Blocked. Allow notifications for this site in browser settings.',
    unsupported: 'This browser can\'t receive reminders.',
    'needs-install': 'On iPhone, add Dueline to the Home Screen first.',
  };

  if (!status) return <div className="toggle-row"><div className="toggle-text"><div className="toggle-title">Reminders on this device</div></div></div>;

  return (
    <>
      <div className="toggle-row">
        <div className="toggle-text">
          <div className="toggle-title">Reminders on this device</div>
          <div className="toggle-sub">{sub[status]}</div>
        </div>
        {status === 'on' || status === 'off' ? (
          <Switch
            checked={status === 'on'}
            label="Reminders on this device"
            onChange={async (on) => {
              if (busy) return;
              setBusy(true);
              try {
                if (on) {
                  const s = await enablePush();
                  setStatus(s);
                  if (s === 'denied') toast('Notifications are blocked in browser settings');
                } else {
                  await disablePush();
                  setStatus('off');
                }
              } catch {
                toast('Couldn\'t change reminders. Try again.', { tone: 'late' });
              } finally {
                setBusy(false);
              }
            }}
          />
        ) : status === 'needs-install' ? (
          <button type="button" className="btn small secondary" onClick={() => openSheet({ kind: 'install' })}>
            How
          </button>
        ) : null}
      </div>
      {status === 'on' ? (
        <button
          type="button"
          className="nav-row"
          onClick={async () => {
            try {
              await sendTestPush();
              toast('Sent. It should arrive in a few seconds.', { tone: 'paid' });
            } catch (e) {
              toast((e as Error).message, { tone: 'late' });
            }
          }}
        >
          <BellRing size={19} className="muted" />
          <span className="grow">Send a test reminder</span>
          <ChevronRight size={18} className="chev" />
        </button>
      ) : null}
    </>
  );
}

/** When the reminder server last ran, so "are reminders working?" has an answer. */
function LastCheck() {
  const tz = useStore((s) => s.profile?.tz ?? 'Asia/Kolkata');
  const [at, setAt] = useState<number | null>(null);
  useEffect(() => {
    getDoc(doc(db, 'system', 'tick'))
      .then((s) => setAt((s.data()?.at as number | undefined) ?? null))
      .catch(() => undefined);
  }, []);
  if (!at) return null;
  const z = zoned(tz, at);
  const today = todayIn(tz);
  const time = new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: tz }).format(at);
  const stale = Date.now() - at > 3 * 3600_000;
  return (
    <div className="field-help" style={{ padding: '4px 0 2px', color: stale ? 'var(--late)' : undefined }}>
      Reminder server last checked {z.date === today ? 'today' : mediumDate(z.date, today)} at {time}
      {stale ? '. That is longer ago than it should be.' : '.'}
    </div>
  );
}

function NextReminders() {
  const profile = useStore((s) => s.profile);
  const obligations = useStore((s) => s.obligations);
  const occs = useStore((s) => s.occs);
  const next = useMemo(() => {
    if (!profile) return [];
    const now = Date.now();
    return upcomingNotices(planNotices(profile, obligations, occs, now, 30), now, 3);
  }, [profile, obligations, occs]);
  if (!profile || !next.length) return null;
  const today = todayIn(profile.tz);
  return (
    <div className="field-help" style={{ padding: '12px 0 2px' }}>
      Coming up:{' '}
      {next.map((n, i) => {
        const z = zoned(profile.tz, n.fireAt);
        const when = z.date === today ? `today ${hourLabel(z.hour)}` : `${mediumDate(z.date, today)}, ${hourLabel(z.hour)}`;
        return (
          <span key={n.id}>
            {i ? '; ' : ''}
            {n.label} ({when})
          </span>
        );
      })}
      .
    </div>
  );
}

export function You() {
  const user = useStore((s) => s.user);
  useStore((s) => s.authVersion);
  const profile = useStore((s) => s.profile);
  const installable = useInstallable();

  if (!user || !profile) return null;
  const guest = user.isAnonymous;

  return (
    <div className="screen">
      <header className="topbar">
        <h1 className="topbar-title">You</h1>
      </header>

      <div className="group" style={{ marginTop: 10 }}>
        <div className="group-body">
          <div className="nav-row" style={{ cursor: 'default' }}>
            <span className="glyph">
              <UserRound size={19} />
            </span>
            <span className="grow">
              <div>{guest ? 'Guest on this device' : user.displayName || user.email}</div>
              <div className="toggle-sub">
                {guest ? 'Your payments are saved on this device only.' : user.email && user.displayName ? user.email : 'Synced across your devices.'}
              </div>
            </span>
          </div>
          {guest ? (
            <div style={{ padding: '14px 0', borderBottom: '1px solid var(--line)' }}>
              <button type="button" className="btn primary block" onClick={() => openSheet({ kind: 'account', mode: 'create' })}>
                Save my payments to an account
              </button>
              <button type="button" className="btn ghost block" style={{ marginTop: 4 }} onClick={() => openSheet({ kind: 'account', mode: 'signin' })}>
                I already have an account
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <div className="group">
        <h2 className="group-title">Reminders</h2>
        <div className="group-body">
          <PushRow />
          <div className="toggle-row">
            <div className="toggle-text">
              <div className="toggle-title">Morning reminder</div>
              <div className="toggle-sub">When reminders go out each day.</div>
            </div>
            <select
              className="input"
              style={{ width: 'auto', height: 44 }}
              aria-label="Reminder time"
              value={profile.remindHour}
              onChange={(e) => updateProfile({ remindHour: Number(e.target.value) })}
            >
              {HOURS.map((h) => (
                <option key={h} value={h}>
                  {hourLabel(h)}
                </option>
              ))}
            </select>
          </div>
          <ToggleRow
            title="Evening nudge"
            sub={`At ${hourLabel(profile.eveningHour)}, only if something due today is still unpaid.`}
            checked={profile.evening}
            onChange={(v) => updateProfile({ evening: v })}
          />
          <div className="toggle-row" style={{ display: 'block' }}>
            <div className="toggle-title">After an AutoPay date</div>
            <div className="toggle-sub" style={{ marginBottom: 12 }}>
              Dueline never marks an AutoPay as paid on its own unless you say so.
            </div>
            <Seg
              label="After an AutoPay date"
              value={profile.autopayCheck}
              onChange={(v) => updateProfile({ autopayCheck: v })}
              options={[
                { value: 'ask', label: 'Ask me' },
                { value: 'assume', label: 'Assume paid' },
              ]}
            />
          </div>
          <NextReminders />
          <LastCheck />
        </div>
      </div>

      <div className="group">
        <h2 className="group-title">Money</h2>
        <div className="group-body">
          <div className="toggle-row">
            <div className="toggle-text">
              <div className="toggle-title">Payday</div>
              <div className="toggle-sub">See what's due before salary lands. Short months use their last day.</div>
            </div>
            <select
              className="input"
              style={{ width: 'auto', height: 44 }}
              aria-label="Payday"
              value={profile.payday ?? ''}
              onChange={(e) => updateProfile({ payday: e.target.value ? Number(e.target.value) : null })}
            >
              <option value="">Not set</option>
              {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                <option key={d} value={d}>
                  {ordinal(d)}
                </option>
              ))}
            </select>
          </div>
          <button type="button" className="nav-row" onClick={() => openSheet({ kind: 'history' })}>
            <History size={19} className="muted" />
            <span className="grow">Payment history</span>
            <ChevronRight size={18} className="chev" />
          </button>
        </div>
      </div>

      <div className="group">
        <h2 className="group-title">This app</h2>
        <div className="group-body">
          {!isStandalone() && (installable || installAvailable() || isIOS()) ? (
            <button
              type="button"
              className="nav-row"
              onClick={async () => {
                if (!(await promptInstall())) openSheet({ kind: 'install' });
              }}
            >
              <Smartphone size={19} className="muted" />
              <span className="grow">Install Dueline</span>
              <ChevronRight size={18} className="chev" />
            </button>
          ) : null}
          <button
            type="button"
            className="nav-row"
            onClick={async () => {
              try {
                const blob = await exportData();
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = `dueline-${todayIn(profile.tz)}.json`;
                a.click();
                setTimeout(() => URL.revokeObjectURL(a.href), 2000);
              } catch {
                toast('Export needs a connection. Try again online.', { tone: 'late' });
              }
            }}
          >
            <Download size={19} className="muted" />
            <span className="grow">Export my data</span>
            <span className="value">JSON</span>
          </button>
          {!guest ? (
            <button
              type="button"
              className="nav-row"
              onClick={async () => {
                await signOutEverywhere();
              }}
            >
              <LogOut size={19} className="muted" />
              <span className="grow">Sign out</span>
            </button>
          ) : null}
          <button type="button" className="nav-row danger" onClick={() => openSheet({ kind: 'delete' })}>
            <Trash2 size={19} />
            <span className="grow">Delete everything</span>
          </button>
        </div>
      </div>

      <p className="footer-credit">
        Dueline never moves money, never asks for a card number or UPI PIN, and has no ads or trackers.
        <br />
        Designed and built by Gaurav Kumar ·{' '}
        <a href="https://thealgothrim.com" target="_blank" rel="noopener">
          The Algothrim
        </a>
      </p>
    </div>
  );
}
