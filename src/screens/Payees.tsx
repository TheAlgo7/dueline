import { UserPlus } from 'lucide-react';
import { useStore } from '../lib/store';
import { openSheet } from '../lib/sheets';
import { Glyph } from '../ui/bits';

export function Payees() {
  const payees = useStore((s) => s.payees);
  const obligations = useStore((s) => s.obligations);

  return (
    <div className="screen">
      <header className="topbar">
        <h1 className="topbar-title">Payees</h1>
        <div className="topbar-actions">
          <button type="button" className="icon-btn" aria-label="Add a payee" onClick={() => openSheet({ kind: 'payee' })}>
            <UserPlus size={21} />
          </button>
        </div>
      </header>

      {payees.length === 0 ? (
        <div className="empty">
          <h2>The people you pay, saved once.</h2>
          <p>
            The parking attendant, the maid, your landlord. Save their UPI ID here and paying them is two taps: Pay, then your UPI app opens with the amount filled in.
          </p>
          <button type="button" className="btn primary" style={{ marginTop: 22 }} onClick={() => openSheet({ kind: 'payee' })}>
            <UserPlus size={19} /> Add a payee
          </button>
        </div>
      ) : (
        <div className="rows" style={{ marginTop: 10 }}>
          {payees.map((p, i) => {
            const linked = obligations.filter((o) => o.payeeId === p.id && o.active).length;
            const meta = [p.upi || p.phone || 'No UPI ID yet', linked ? `${linked} recurring` : ''].filter(Boolean).join(' · ');
            return (
              <div key={p.id} className="row" style={{ ['--i' as string]: i }}>
                <button type="button" className="row-hit" aria-label={p.name} onClick={() => openSheet({ kind: 'payee', id: p.id })} />
                <Glyph category="person" />
                <div className="row-main">
                  <div className="row-title">{p.name}</div>
                  <div className="row-meta">{meta}</div>
                </div>
                <div className="row-side">
                  {p.upi ? (
                    <button type="button" className="row-action" onClick={() => openSheet({ kind: 'pay', payeeId: p.id })}>
                      Pay
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
