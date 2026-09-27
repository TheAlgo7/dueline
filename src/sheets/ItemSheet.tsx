import { useMemo, useState, type ReactNode } from 'react';
import { BellOff, CalendarClock, CircleCheck, ChevronRight, Pencil, ReceiptIndianRupee, SkipForward } from 'lucide-react';
import { addDays, isValidISODate, mediumDate, relative, shortDate } from '../core/dates';
import { inr, inrDigits, parseRupees } from '../core/money';
import { CATEGORY_LABEL } from '../core/presets';
import { describe, lastCycle } from '../core/recurrence';
import { confirmedPaid } from '../core/timeline';
import type { Item, OccurrenceDoc } from '../core/types';
import { hostOf, safeUrl } from '../core/upi';
import { confirmAutopay, moveCycle, restoreOcc, setActive, setCycleAmount, skipCycle, snoozeCycle, today, unsettle } from '../lib/actions';
import { routeText, useItem } from '../lib/select';
import { openSheet, type OpenSheet } from '../lib/sheets';
import { useStore } from '../lib/store';
import { toast } from '../lib/toast';
import { Glyph, toneFor } from '../ui/bits';
import { brandFor } from '../ui/brands';
import { MoneyInput, moneyText } from '../ui/controls';
import { Sheet } from '../ui/Sheet';

type Mode = null | 'amount' | 'move' | 'snooze';

function Status({ item }: { item: Item }) {
  const when = mediumDate(item.due, today());
  switch (item.state) {
    case 'overdue':
      return <><span className="late">{relative(item.daysLeft)}</span>. It was due {when}.</>;
    case 'today':
      return <><span className="accent">Due today.</span></>;
    case 'soon':
    case 'upcoming':
      return <>Due {when}, <span className="accent">{relative(item.daysLeft).toLowerCase()}</span>.</>;
    case 'auto':
      return <><span className="auto">AutoPay</span> expected {item.daysLeft === 0 ? 'today' : when}. Nothing to do.</>;
    case 'confirm':
      return <><span className="auto">AutoPay</span> was due {when}. Did it go through?</>;
    case 'paid':
      return <><span className="paid">Paid</span>{item.occ?.paidOn ? ` on ${mediumDate(item.occ.paidOn, today())}` : ''}.</>;
    case 'autopaid':
      return item.assumed
        ? <><span className="auto">AutoPay</span> was due {when}. Assumed paid, but nobody confirmed it.</>
        : <><span className="paid">AutoPay went through</span> on {when}.</>;
    case 'skipped':
      return <>Skipped. It was due {when}.</>;
  }
}

function withUndo(item: Item, label: string, run: () => void, tone: 'paid' | 'default' | 'late' = 'default') {
  const prev: OccurrenceDoc | undefined = item.occ ? { ...item.occ } : undefined;
  run();
  toast(label, { tone, action: { label: 'Undo', run: () => restoreOcc(item, prev) } });
}

export function ItemSheet({ spec, depth, isTop }: { spec: Extract<OpenSheet, { kind: 'item' }>; depth: number; isTop: boolean }) {
  const item = useItem(spec.key);
  const occs = useStore((s) => s.occs);
  const [mode, setMode] = useState<Mode>(null);
  const [amountText, setAmountText] = useState('');
  const [moveTo, setMoveTo] = useState('');

  const history = useMemo(() => {
    if (!item) return [];
    return [...occs.values()]
      .filter((o) => o.obligationId === item.ob.id && o.status && o.id !== item.key)
      .sort((a, b) => (a.due < b.due ? 1 : -1))
      .slice(0, 6);
  }, [occs, item]);

  if (!item) {
    return (
      <Sheet id={spec.id} closing={spec.closing} depth={depth} isTop={isTop} title="Payment">
        <p className="muted">This payment isn't here anymore. It may have been deleted on another device.</p>
      </Sheet>
    );
  }

  const ob = item.ob;
  const needs = ob.active && (item.state === 'overdue' || item.state === 'today' || item.state === 'soon' || item.state === 'upcoming');
  const link = safeUrl(ob.url);
  const end = lastCycle(ob.recurrence);
  const cycleNote = ob.recurrence.count ? `${item.cycle} of ${ob.recurrence.count}` : null;

  let primary: ReactNode = null;
  if (!ob.active) {
    primary = (
      <div className="btn-row" style={{ marginTop: 22 }}>
        <button
          type="button"
          className="btn secondary"
          onClick={() => {
            setActive(ob, true);
            toast(`Tracking ${ob.title} again`);
          }}
        >
          Start tracking again
        </button>
      </div>
    );
  } else if (needs) {
    primary = (
      <div className="btn-row" style={{ marginTop: 22 }}>
        <button type="button" className="btn primary" onClick={() => openSheet({ kind: 'pay', key: item.key })}>
          Pay{item.amount != null ? ` ${inr(item.amount)}` : ''}
        </button>
        <button type="button" className="btn secondary" onClick={() => openSheet({ kind: 'paid', key: item.key })}>
          Mark paid
        </button>
      </div>
    );
  } else if (item.state === 'confirm' || item.assumed) {
    primary = (
      <div className="btn-row" style={{ marginTop: 22 }}>
        <button type="button" className="btn paid" onClick={() => withUndo(item, `${ob.title} marked as paid`, () => confirmAutopay(item, true), 'paid')}>
          It went through
        </button>
        <button type="button" className="btn secondary" onClick={() => withUndo(item, `${ob.title} now needs you`, () => confirmAutopay(item, false), 'late')}>
          It failed
        </button>
      </div>
    );
  } else if (item.state === 'paid' || item.state === 'autopaid' || item.state === 'skipped') {
    primary = (
      <div className="btn-row" style={{ marginTop: 22 }}>
        <button type="button" className="btn secondary" onClick={() => withUndo(item, 'Back to unpaid', () => unsettle(item))}>
          {item.state === 'skipped' ? 'Unskip' : 'Mark as not paid'}
        </button>
      </div>
    );
  } else if (item.state === 'auto' && link) {
    primary = (
      <div className="btn-row" style={{ marginTop: 22 }}>
        <a className="btn secondary" href={link} target="_blank" rel="noopener noreferrer">
          Manage on {hostOf(link)}
        </a>
      </div>
    );
  }

  return (
    <Sheet id={spec.id} closing={spec.closing} depth={depth} isTop={isTop} label={ob.title}>
      <div className="detail-head">
        <Glyph category={ob.category} tone={toneFor(item)} big done={confirmedPaid(item)} brand={brandFor(ob)} />
        <div style={{ minWidth: 0 }}>
          <h2 className="detail-title">{ob.title}</h2>
          <p className="detail-sub">
            {CATEGORY_LABEL[ob.category]} · {describe(ob.recurrence)}
          </p>
        </div>
      </div>

      <div className="detail-amount num">
        {item.amount == null ? (
          <span style={{ fontSize: 28, color: 'var(--ink-3)', letterSpacing: '-0.02em' }}>Amount not in yet</span>
        ) : (
          <>
            <span className="rupee">₹</span>
            {inrDigits(item.amount)}
          </>
        )}
      </div>
      <p className="detail-status">
        {!ob.active ? <span className="muted">You stopped tracking this. History is kept. </span> : null}
        <Status item={item} />
        {item.estimate ? ' This is the usual amount; enter the real bill when it arrives.' : ''}
      </p>

      {primary}

      {mode === 'amount' ? (
        <div className="returned">
          <p>This cycle's amount</p>
          <MoneyInput text={amountText} onText={(t) => setAmountText(t)} autoFocus />
          <div className="btn-row" style={{ marginTop: 12 }}>
            <button type="button" className="btn secondary" onClick={() => setMode(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn primary"
              onClick={() => {
                const p = parseRupees(amountText);
                if (p == null) {
                  toast('Enter an amount');
                  return;
                }
                setCycleAmount(item, p);
                setMode(null);
                toast(`${ob.title}: ${inr(p)} this time`);
              }}
            >
              Save
            </button>
          </div>
        </div>
      ) : mode === 'move' ? (
        <div className="returned">
          <p>Move this one to</p>
          <input type="date" className="input" value={moveTo} onChange={(e) => setMoveTo(e.target.value)} aria-label="New due date" />
          <div className="btn-row" style={{ marginTop: 12 }}>
            <button type="button" className="btn secondary" onClick={() => setMode(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn primary"
              onClick={() => {
                if (!isValidISODate(moveTo)) return;
                withUndo(item, `Moved to ${shortDate(moveTo)}`, () => moveCycle(item, moveTo));
                setMode(null);
              }}
            >
              Move
            </button>
          </div>
          <p className="field-help">Only this one moves. The schedule stays the same.</p>
        </div>
      ) : mode === 'snooze' ? (
        <div className="returned">
          <p>No reminders until</p>
          <div className="chips">
            {[1, 2, 3, 7].map((n) => {
              const d = addDays(today(), n);
              return (
                <button
                  key={n}
                  type="button"
                  className="chip"
                  onClick={() => {
                    withUndo(item, `Quiet until ${mediumDate(d)}`, () => snoozeCycle(item, d));
                    setMode(null);
                  }}
                >
                  {n === 1 ? 'Tomorrow' : `${n} days`}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <dl className="facts">
        <div className="fact">
          <dt>{item.state === 'auto' || item.state === 'confirm' || item.state === 'autopaid' ? 'Charges' : 'Pay by'}</dt>
          <dd>{routeText(ob)}</dd>
        </div>
        {ob.method === 'upi' && ob.upi && ob.handling === 'manual' ? (
          <div className="fact">
            <dt>UPI ID</dt>
            <dd>{ob.upi}</dd>
          </div>
        ) : null}
        {item.due !== item.originalDue ? (
          <div className="fact">
            <dt>Moved from</dt>
            <dd>{mediumDate(item.originalDue)}</dd>
          </div>
        ) : null}
        {cycleNote ? (
          <div className="fact">
            <dt>Payment</dt>
            <dd>
              {cycleNote}
              {end ? `, last on ${shortDate(end)}` : ''}
            </dd>
          </div>
        ) : null}
        {item.occ?.ref ? (
          <div className="fact">
            <dt>Reference</dt>
            <dd>{item.occ.ref}</dd>
          </div>
        ) : null}
        {item.occ?.snoozeUntil && item.occ.snoozeUntil > today() ? (
          <div className="fact">
            <dt>Reminders</dt>
            <dd>Quiet until {shortDate(item.occ.snoozeUntil)}</dd>
          </div>
        ) : null}
        {ob.note ? (
          <div className="fact">
            <dt>Note</dt>
            <dd style={{ whiteSpace: 'pre-wrap', fontWeight: 450 }}>{ob.note}</dd>
          </div>
        ) : null}
      </dl>

      <div className="menu">
        {needs && ob.amountType === 'variable' ? (
          <button type="button" className="nav-row" onClick={() => { setAmountText(moneyText(item.occ?.amount ?? null)); setMode('amount'); }}>
            <ReceiptIndianRupee size={19} />
            <span className="grow">{item.occ?.amount != null ? 'Change this bill\'s amount' : 'Enter this bill\'s amount'}</span>
            <ChevronRight size={18} className="chev" />
          </button>
        ) : null}
        {needs || item.state === 'auto' ? (
          <button type="button" className="nav-row" onClick={() => { setMoveTo(item.due); setMode('move'); }}>
            <CalendarClock size={19} />
            <span className="grow">Move this one</span>
            <ChevronRight size={18} className="chev" />
          </button>
        ) : null}
        {needs ? (
          <button type="button" className="nav-row" onClick={() => setMode('snooze')}>
            <BellOff size={19} />
            <span className="grow">Quiet the reminders</span>
            <ChevronRight size={18} className="chev" />
          </button>
        ) : null}
        {item.state === 'auto' ? (
          <button type="button" className="nav-row" onClick={() => withUndo(item, `${ob.title} marked as paid`, () => confirmAutopay(item, true), 'paid')}>
            <CircleCheck size={19} />
            <span className="grow">It already went through</span>
          </button>
        ) : null}
        {needs || item.state === 'auto' ? (
          <button type="button" className="nav-row" onClick={() => withUndo(item, `Skipped ${ob.title} this time`, () => skipCycle(item))}>
            <SkipForward size={19} />
            <span className="grow">Skip this one</span>
          </button>
        ) : null}
        <button type="button" className="nav-row" onClick={() => openSheet({ kind: 'edit', obligationId: ob.id })}>
          <Pencil size={19} />
          <span className="grow">Edit {ob.recurrence.freq === 'once' ? 'payment' : 'schedule and details'}</span>
          <ChevronRight size={18} className="chev" />
        </button>
      </div>

      {history.length ? (
        <>
          <h3 className="group-title" style={{ marginTop: 24 }}>Earlier</h3>
          <div className="history">
            {history.map((o) => (
              <div key={o.id} className="history-row">
                <span>
                  {mediumDate(o.due)}
                  <span className="muted"> · {o.status === 'paid' ? 'Paid' : o.status === 'autopaid' ? 'AutoPay' : o.status === 'failed' ? 'Failed' : 'Skipped'}</span>
                </span>
                <span className="num">{o.status === 'skipped' ? '' : inr(o.paidAmount ?? o.amount ?? ob.amount)}</span>
              </div>
            ))}
          </div>
        </>
      ) : null}
    </Sheet>
  );
}
