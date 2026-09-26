import { useMemo } from 'react';
import { monthName, parts, shortDate } from '../core/dates';
import { inr } from '../core/money';
import { occId } from '../core/timeline';
import { openSheet, type OpenSheet } from '../lib/sheets';
import { useStore } from '../lib/store';
import { Sheet } from '../ui/Sheet';

/** What you settled, month by month. Only confirmed payments: assumed AutoPays aren't history. */
export function HistorySheet({ spec, depth, isTop }: { spec: Extract<OpenSheet, { kind: 'history' }>; depth: number; isTop: boolean }) {
  const occs = useStore((s) => s.occs);
  const obligations = useStore((s) => s.obligations);

  const months = useMemo(() => {
    const titles = new Map(obligations.map((o) => [o.id, o]));
    const settled = [...occs.values()]
      .filter((o) => o.status === 'paid' || o.status === 'autopaid')
      .map((o) => {
        const ob = titles.get(o.obligationId);
        return {
          id: o.id,
          key: occId(o.obligationId, o.due),
          title: o.title || ob?.title || 'Deleted payment',
          on: o.paidOn || o.due,
          amount: o.paidAmount ?? o.amount ?? (ob?.amountType === 'fixed' ? ob.amount : null),
          auto: o.status === 'autopaid',
          ref: o.ref,
          exists: Boolean(ob),
        };
      })
      .sort((a, b) => (a.on < b.on ? 1 : a.on > b.on ? -1 : 0));
    const groups: Array<{ label: string; total: number; rows: typeof settled }> = [];
    for (const r of settled) {
      const p = parts(r.on);
      const label = `${monthName(p.m, true)} ${p.y}`;
      let g = groups[groups.length - 1];
      if (!g || g.label !== label) {
        g = { label, total: 0, rows: [] };
        groups.push(g);
      }
      g.rows.push(r);
      g.total += r.amount ?? 0;
    }
    return groups;
  }, [occs, obligations]);

  return (
    <Sheet id={spec.id} closing={spec.closing} depth={depth} isTop={isTop} title="Payment history">
      {months.length === 0 ? (
        <p className="muted">Nothing paid yet. Everything you mark paid shows up here, month by month.</p>
      ) : (
        months.map((m) => (
          <section key={m.label} className="section" style={{ marginTop: 18 }}>
            <div className="section-head">
              <h3 className="section-title">{m.label}</h3>
              <span className="section-sub num">{inr(m.total)}</span>
            </div>
            <div className="history">
              {m.rows.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  className="history-row"
                  style={{ width: '100%', textAlign: 'left' }}
                  disabled={!r.exists}
                  onClick={() => openSheet({ kind: 'item', key: r.key })}
                >
                  <span style={{ minWidth: 0 }}>
                    {r.title}
                    <span className="muted">
                      {' '}
                      · {shortDate(r.on)}
                      {r.auto ? ' · AutoPay' : ''}
                      {r.ref ? ` · ${r.ref}` : ''}
                    </span>
                  </span>
                  <span className="num">{r.amount != null ? inr(r.amount) : ''}</span>
                </button>
              ))}
            </div>
          </section>
        ))
      )}
    </Sheet>
  );
}
