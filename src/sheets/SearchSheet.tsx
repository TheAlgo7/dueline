import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { mediumDate } from '../core/dates';
import { inr } from '../core/money';
import { nextItem, routeText, useToday } from '../lib/select';
import { openSheet, type OpenSheet } from '../lib/sheets';
import { useStore } from '../lib/store';
import { Glyph } from '../ui/bits';
import { brandFor } from '../ui/brands';
import { Sheet } from '../ui/Sheet';

export function SearchSheet({ spec, depth, isTop }: { spec: Extract<OpenSheet, { kind: 'search' }>; depth: number; isTop: boolean }) {
  const obligations = useStore((s) => s.obligations);
  const payees = useStore((s) => s.payees);
  const occs = useStore((s) => s.occs);
  const today = useToday();
  const [q, setQ] = useState('');

  const results = useMemo(() => {
    const t = q.trim().toLowerCase();
    const match = (...fields: Array<string | undefined | null>) => !t || fields.some((f) => f?.toLowerCase().includes(t));
    const obs = obligations
      .filter((o) => match(o.title, o.note, o.payTo, o.upi, o.account, o.url))
      .map((o) => ({ ob: o, next: nextItem(o, today) }))
      .sort((a, b) => Number(b.ob.active) - Number(a.ob.active) || a.ob.title.localeCompare(b.ob.title));
    const ps = t ? payees.filter((p) => match(p.name, p.upi, p.phone, p.note)) : [];
    return { obs, ps };
    // occs changes what "next" is
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, obligations, payees, occs, today]);

  return (
    <Sheet id={spec.id} closing={spec.closing} depth={depth} isTop={isTop} title="Everything you track">
      <div className="search-input">
        <Search size={18} />
        <input
          className="input"
          type="search"
          placeholder="Search payments and payees"
          value={q}
          autoFocus
          enterKeyHint="search"
          aria-label="Search"
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <div className="rows" style={{ marginTop: 10 }}>
        {results.obs.map(({ ob, next }, i) => (
          <div key={ob.id} className={`row${ob.active ? '' : ' done'}`} style={{ ['--i' as string]: Math.min(i, 10) }}>
            <button
              type="button"
              className="row-hit"
              aria-label={ob.title}
              onClick={() => (next ? openSheet({ kind: 'item', key: next.key }) : openSheet({ kind: 'edit', obligationId: ob.id }))}
            />
            <Glyph category={ob.category} brand={brandFor(ob)} />
            <div className="row-main">
              <div className="row-title">{ob.title}</div>
              <div className="row-meta">
                {!ob.active ? 'Stopped' : next ? `Next ${mediumDate(next.due, today)}` : 'Finished'} · {routeText(ob)}
              </div>
            </div>
            <div className="row-side">
              <span className={`row-amount num${ob.amount == null ? ' pending' : ob.amountType === 'variable' ? ' est' : ''}`}>
                {ob.amount == null ? 'Varies' : inr(ob.amount)}
              </span>
            </div>
          </div>
        ))}
        {results.ps.map((p) => (
          <div key={p.id} className="row">
            <button type="button" className="row-hit" aria-label={p.name} onClick={() => openSheet({ kind: 'payee', id: p.id })} />
            <Glyph category="person" />
            <div className="row-main">
              <div className="row-title">{p.name}</div>
              <div className="row-meta">Payee{p.upi ? ` · ${p.upi}` : ''}</div>
            </div>
            <div className="row-side" />
          </div>
        ))}
      </div>
      {q && !results.obs.length && !results.ps.length ? <p className="muted" style={{ padding: '16px 0' }}>Nothing matches "{q}".</p> : null}
      {!q && !results.obs.length ? <p className="muted" style={{ padding: '16px 0' }}>Nothing tracked yet.</p> : null}
    </Sheet>
  );
}
