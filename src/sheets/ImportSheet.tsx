import { inr } from '../core/money';
import { describe } from '../core/recurrence';
import { applyImport } from '../lib/actions';
import { closeSheet, type OpenSheet } from '../lib/sheets';
import { toast } from '../lib/toast';
import { Glyph } from '../ui/bits';
import { markFor } from '../ui/marks';
import { Sheet } from '../ui/Sheet';

/** Shows what a file would add before anything is written. */
export function ImportSheet({ spec, depth, isTop }: { spec: Extract<OpenSheet, { kind: 'import' }>; depth: number; isTop: boolean }) {
  const { plan } = spec;
  const fresh = plan.obligations.filter((o) => !o.duplicate).length;
  const dupes = plan.obligations.length - fresh;

  return (
    <Sheet id={spec.id} closing={spec.closing} depth={depth} isTop={isTop} title="Import payments">
      <p className="muted" style={{ marginTop: 0 }}>
        {fresh ? `${fresh} new ${fresh === 1 ? 'payment' : 'payments'}` : 'Nothing new'}
        {dupes ? `, ${dupes} already in Dueline and left as they are` : ''}
        {plan.rejected ? `. ${plan.rejected} ${plan.rejected === 1 ? 'entry wasn\'t' : 'entries weren\'t'} readable and will be skipped` : ''}.
      </p>
      <div className="rows" style={{ marginTop: 12 }}>
        {plan.obligations.map(({ id, data, duplicate }, i) => (
          <div key={id} className={`row${duplicate ? ' done' : ''}`} style={{ ['--i' as string]: Math.min(i, 10) }}>
            <Glyph category={data.category} tone={duplicate ? 'neutral' : data.handling === 'auto' ? 'auto' : 'accent'} mark={markFor(data)} />
            <div className="row-main">
              <div className="row-title">{data.title}</div>
              <div className="row-meta">
                {duplicate ? 'Already in Dueline' : `${describe(data.recurrence)} · ${data.handling === 'auto' ? 'AutoPay' : 'Needs you'}`}
              </div>
            </div>
            <div className="row-side">
              <span className={`row-amount num${data.amount == null ? ' pending' : data.amountType === 'variable' ? ' est' : ''}`}>
                {data.amount == null ? 'Varies' : inr(data.amount)}
              </span>
            </div>
          </div>
        ))}
      </div>
      <div className="btn-row" style={{ marginTop: 22 }}>
        <button
          type="button"
          className="btn primary"
          disabled={!fresh}
          onClick={() => {
            const added = applyImport(plan);
            closeSheet(spec.id);
            toast(`Added ${added} ${added === 1 ? 'payment' : 'payments'}`, { tone: 'paid' });
          }}
        >
          {fresh ? `Add ${fresh} ${fresh === 1 ? 'payment' : 'payments'}` : 'Nothing to add'}
        </button>
        <button type="button" className="btn secondary" onClick={() => closeSheet(spec.id)}>
          Cancel
        </button>
      </div>
    </Sheet>
  );
}
