import type { ReactNode } from 'react';
import { mediumDate, relative, shortDate } from '../core/dates';
import { inr } from '../core/money';
import type { Item } from '../core/types';
import { confirmAutopay } from '../lib/actions';
import { openSheet } from '../lib/sheets';
import { toast } from '../lib/toast';
import { routeText, useToday } from '../lib/select';
import { Glyph, toneFor } from './bits';

function Meta({ item, today }: { item: Item; today: string }) {
  const route = routeText(item.ob);
  const d = item.daysLeft;
  switch (item.state) {
    case 'overdue':
      return (
        <>
          <span className="late">{relative(d)}</span> · {item.occ?.status === 'failed' ? <span className="late">AutoPay failed</span> : route}
        </>
      );
    case 'today':
      return (
        <>
          <span className="accent">Due today</span> · {route}
        </>
      );
    case 'soon':
    case 'upcoming':
      return (
        <>
          {d === 1 ? 'Tomorrow' : mediumDate(item.due, today)} · {route}
        </>
      );
    case 'auto':
      return (
        <>
          {d === 0 ? 'Today' : d === 1 ? 'Tomorrow' : mediumDate(item.due, today)} ·{' '}
          <span className="auto">{route}</span>
        </>
      );
    case 'confirm':
      return (
        <>
          Was due {shortDate(item.due)} · <span className="auto">AutoPay</span>
        </>
      );
    case 'paid':
      return (
        <>
          Paid {item.occ?.paidOn ? (item.occ.paidOn === today ? 'today' : shortDate(item.occ.paidOn)) : ''}
          {item.occ?.paidOn && item.occ.paidOn !== item.due ? ` · due ${shortDate(item.due)}` : ''}
          {item.occ?.ref ? ` · ${item.occ.ref}` : ''}
        </>
      );
    case 'autopaid':
      return <>{item.assumed ? 'AutoPay, assumed' : 'AutoPay went through'} · {shortDate(item.due)}</>;
    case 'skipped':
      return <>Skipped · {shortDate(item.due)}</>;
  }
}

export function ItemRow({ item, index = 0, showDate, confirmInline }: { item: Item; index?: number; showDate?: boolean; confirmInline?: boolean }) {
  const today = useToday();
  const done = item.state === 'paid' || item.state === 'autopaid' || item.state === 'skipped';
  const needs = item.state === 'overdue' || item.state === 'today' || item.state === 'soon' || item.state === 'upcoming';
  const noAmount = item.amount == null;
  const amountClass = `row-amount num${noAmount ? ' pending' : item.estimate ? ' est' : ''}`;

  let side: ReactNode = null;
  if (needs && noAmount) {
    side = (
      <button type="button" className="row-action" onClick={() => openSheet({ kind: 'item', key: item.key })}>
        Add amount
      </button>
    );
  } else if (needs && item.daysLeft <= 7) {
    side = (
      <button type="button" className="row-action" onClick={() => openSheet({ kind: 'pay', key: item.key })}>
        Pay
      </button>
    );
  } else if (item.state === 'auto') side = <span className="row-tag auto">Auto</span>;
  else if (item.state === 'confirm' && !confirmInline) side = <span className="row-tag auto">Check</span>;
  else if (item.state === 'paid' || item.state === 'autopaid') side = <span className="row-tag paid">Paid</span>;
  else if (item.state === 'skipped') side = <span className="row-tag skip">Skipped</span>;

  return (
    <div className={`row${done ? ' done' : ''}`} style={{ ['--i' as string]: Math.min(index, 12) }}>
      <button
        type="button"
        className="row-hit"
        aria-label={`${item.ob.title}, ${noAmount ? 'amount pending' : inr(item.amount)}, ${relative(item.daysLeft)}`}
        onClick={() => openSheet({ kind: 'item', key: item.key })}
      />
      <Glyph category={item.ob.category} tone={toneFor(item)} done={item.state === 'paid' || item.state === 'autopaid'} />
      <div className="row-main">
        <div className="row-title">{item.ob.title}</div>
        <div className="row-meta">
          {showDate && !done ? `${shortDate(item.due)} · ` : null}
          <Meta item={item} today={today} />
        </div>
      </div>
      <div className="row-side">
        <span className={amountClass}>{noAmount ? 'Amount?' : inr(item.amount)}</span>
        {side}
      </div>
      {confirmInline && item.state === 'confirm' ? (
        <div className="row-actions">
          <button
            type="button"
            className="btn small paid"
            onClick={() => {
              confirmAutopay(item, true);
              toast(`${item.ob.title} marked as paid`, { tone: 'paid' });
            }}
          >
            It went through
          </button>
          <button
            type="button"
            className="btn small secondary"
            onClick={() => {
              confirmAutopay(item, false);
              toast(`${item.ob.title} now needs you`, { tone: 'late' });
            }}
          >
            It failed
          </button>
        </div>
      ) : null}
    </div>
  );
}
