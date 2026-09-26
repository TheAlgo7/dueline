import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { isVpa, normalizeVpa, safeUrl } from '../core/upi';
import { deletePayee, savePayee } from '../lib/actions';
import { closeSheet, openSheet, type OpenSheet } from '../lib/sheets';
import { nextItem, useToday } from '../lib/select';
import { useStore } from '../lib/store';
import { toast } from '../lib/toast';
import { Field } from '../ui/controls';
import { ItemRow } from '../ui/ItemRow';
import { Sheet } from '../ui/Sheet';

export function PayeeSheet({ spec, depth, isTop }: { spec: Extract<OpenSheet, { kind: 'payee' }>; depth: number; isTop: boolean }) {
  const payee = useStore((s) => s.payees.find((p) => p.id === spec.id));
  const obligations = useStore((s) => s.obligations);
  useStore((s) => s.occs);
  const today = useToday();
  const [name, setName] = useState(payee?.name ?? '');
  const [upi, setUpi] = useState(payee?.upi ?? '');
  const [phone, setPhone] = useState(payee?.phone ?? '');
  const [url, setUrl] = useState(payee?.url ?? '');
  const [note, setNote] = useState(payee?.note ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirm, setConfirm] = useState(false);

  const linked = payee ? obligations.filter((o) => o.payeeId === payee.id && o.active) : [];
  const upcoming = linked.map((o) => nextItem(o, today)).filter((i): i is NonNullable<typeof i> => Boolean(i));

  const save = () => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = 'Give them a name.';
    if (upi.trim() && !isVpa(upi)) e.upi = 'A UPI ID looks like name@bank.';
    if (url.trim() && !safeUrl(url)) e.url = 'That link doesn\'t look right.';
    setErrors(e);
    if (Object.keys(e).length) return;
    savePayee(
      {
        name: name.trim(),
        upi: upi.trim() ? normalizeVpa(upi) : '',
        phone: phone.replace(/[^\d+]/g, '').slice(0, 20),
        url: url.trim() ? safeUrl(url) ?? '' : '',
        note: note.trim(),
      },
      payee,
    );
    closeSheet(spec.id);
    toast(payee ? 'Saved' : `Added ${name.trim()}`, { tone: 'paid' });
  };

  return (
    <Sheet
      id={spec.id}
      closing={spec.closing}
      depth={depth}
      isTop={isTop}
      title={payee ? payee.name : 'New payee'}
      footer={
        <button type="button" className="btn primary block" onClick={save}>
          {payee ? 'Save' : 'Add payee'}
        </button>
      }
    >
      {payee && payee.upi ? (
        <div className="btn-row" style={{ marginBottom: 20 }}>
          <button type="button" className="btn secondary" onClick={() => openSheet({ kind: 'pay', payeeId: payee.id })}>
            Pay any amount
          </button>
          <button type="button" className="btn secondary" onClick={() => openSheet({ kind: 'add', payeeId: payee.id, category: 'person' })}>
            <Plus size={17} /> Recurring
          </button>
        </div>
      ) : null}

      <Field label="Name" htmlFor="pe-name" error={errors.name}>
        <input id="pe-name" className={`input${errors.name ? ' invalid' : ''}`} placeholder="Rahul, parking" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="UPI ID" htmlFor="pe-upi" error={errors.upi}>
        <input id="pe-upi" className={`input${errors.upi ? ' invalid' : ''}`} placeholder="name@bank" value={upi} inputMode="email" autoCapitalize="off" spellCheck={false} onChange={(e) => setUpi(e.target.value)} />
      </Field>
      <Field label="Phone" htmlFor="pe-phone" help="Optional.">
        <input id="pe-phone" className="input" placeholder="98xxxxxx12" value={phone} inputMode="tel" onChange={(e) => setPhone(e.target.value)} />
      </Field>
      <Field label="Website or payment link" htmlFor="pe-url" error={errors.url} help="For businesses: where you pay them.">
        <input id="pe-url" className={`input${errors.url ? ' invalid' : ''}`} placeholder="Optional" value={url} inputMode="url" autoCapitalize="off" spellCheck={false} onChange={(e) => setUrl(e.target.value)} />
      </Field>
      <Field label="Note" htmlFor="pe-note">
        <textarea id="pe-note" className="input" placeholder="Bank details, timings, anything" value={note} maxLength={600} onChange={(e) => setNote(e.target.value)} />
      </Field>

      {upcoming.length ? (
        <>
          <h3 className="group-title" style={{ marginTop: 26 }}>You pay them</h3>
          <div className="rows">
            {upcoming.map((it, i) => (
              <ItemRow key={it.key} item={it} index={i} showDate />
            ))}
          </div>
        </>
      ) : null}

      {payee ? (
        <div className="menu" style={{ marginTop: 24 }}>
          {confirm ? (
            <div style={{ padding: '10px 0' }}>
              <p style={{ marginBottom: 12, color: 'var(--ink-2)' }}>
                Remove {payee.name}? {linked.length ? 'Their recurring payments stay, with the UPI ID kept on each.' : ''}
              </p>
              <div className="btn-row">
                <button type="button" className="btn secondary" onClick={() => setConfirm(false)}>
                  Keep
                </button>
                <button
                  type="button"
                  className="btn danger"
                  onClick={() => {
                    deletePayee(payee);
                    closeSheet(spec.id);
                    toast(`Removed ${payee.name}`);
                  }}
                >
                  Remove
                </button>
              </div>
            </div>
          ) : (
            <button type="button" className="nav-row danger" onClick={() => setConfirm(true)}>
              <Trash2 size={18} />
              <span className="grow">Remove payee</span>
            </button>
          )}
        </div>
      ) : null}
    </Sheet>
  );
}
