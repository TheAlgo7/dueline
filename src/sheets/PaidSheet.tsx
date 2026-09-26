import { useState } from 'react';
import { isValidISODate } from '../core/dates';
import { inr, parseRupees } from '../core/money';
import type { OccurrenceDoc } from '../core/types';
import { markPaid, restoreOcc, today } from '../lib/actions';
import { useItem } from '../lib/select';
import { closeAllSheets, type OpenSheet } from '../lib/sheets';
import { toast } from '../lib/toast';
import { Chip, Field, MoneyInput, moneyText } from '../ui/controls';
import { Sheet } from '../ui/Sheet';

const VIA = ['UPI', 'Card', 'Cash', 'Bank', 'Online', 'Other'];

export function PaidSheet({ spec, depth, isTop }: { spec: Extract<OpenSheet, { kind: 'paid' }>; depth: number; isTop: boolean }) {
  const item = useItem(spec.key);
  const defaultVia =
    spec.via ??
    (item?.ob.method === 'upi' ? 'UPI' : item?.ob.method === 'cash' ? 'Cash' : item?.ob.method === 'card' ? 'Card' : item?.ob.method === 'bank' ? 'Bank' : 'Online');
  const [amountText, setAmountText] = useState(moneyText(spec.amount ?? item?.amount ?? null));
  const [on, setOn] = useState(today());
  const [ref, setRef] = useState('');
  const [via, setVia] = useState(defaultVia);

  if (!item) {
    return (
      <Sheet id={spec.id} closing={spec.closing} depth={depth} isTop={isTop} title="Mark paid">
        <p className="muted">This payment isn't here anymore.</p>
      </Sheet>
    );
  }

  const save = () => {
    const amount = parseRupees(amountText);
    if (amountText.trim() && amount == null) {
      toast('That amount doesn\'t look right');
      return;
    }
    const prev: OccurrenceDoc | undefined = item.occ ? { ...item.occ } : undefined;
    markPaid(item, { amount, on: isValidISODate(on) ? on : today(), ref, via });
    closeAllSheets();
    navigator.vibrate?.(12);
    toast(`Paid ${item.ob.title}${amount != null ? ` · ${inr(amount)}` : ''}`, {
      tone: 'paid',
      action: { label: 'Undo', run: () => restoreOcc(item, prev) },
    });
  };

  return (
    <Sheet
      id={spec.id}
      closing={spec.closing}
      depth={depth}
      isTop={isTop}
      title={`Mark ${item.ob.title} paid`}
      footer={
        <button type="button" className="btn primary block" onClick={save}>
          Mark paid
        </button>
      }
    >
      <Field label="Amount paid">
        <MoneyInput text={amountText} onText={(t) => setAmountText(t)} />
      </Field>
      <Field label="Paid on" htmlFor="paid-on">
        <input id="paid-on" type="date" className="input" value={on} max={today()} onChange={(e) => setOn(e.target.value)} />
      </Field>
      <Field label="Paid with">
        <div className="chips">
          {VIA.map((v) => (
            <Chip key={v} pressed={via === v} onClick={() => setVia(v)}>
              {v}
            </Chip>
          ))}
        </div>
      </Field>
      <Field label="Reference" htmlFor="paid-ref" help="Optional. The UTR from your UPI app, or any note to find it later.">
        <input id="paid-ref" className="input" placeholder="UTR or note" value={ref} maxLength={80} autoComplete="off" onChange={(e) => setRef(e.target.value)} />
      </Field>
    </Sheet>
  );
}
