import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { addDays, dayName, daysInMonth, mediumDate, monthName, parts, weekday, ymd } from '../core/dates';
import { inr } from '../core/money';
import { needsYou } from '../core/timeline';
import type { Item } from '../core/types';
import { useItems, useToday } from '../lib/select';
import { openSheet } from '../lib/sheets';
import { toneFor } from '../ui/bits';
import { ItemRow } from '../ui/ItemRow';

/** Monday-first grid, six weeks, so the layout never jumps between months. */
function gridFor(y: number, m: number) {
  const first = ymd(y, m, 1);
  const lead = (weekday(first) + 6) % 7;
  const start = addDays(first, -lead);
  return { start, end: addDays(start, 41), first, last: ymd(y, m, daysInMonth(y, m)) };
}

export function Calendar() {
  const today = useToday();
  const t = parts(today);
  const [cursor, setCursor] = useState({ y: t.y, m: t.m });
  const [selected, setSelected] = useState(today);
  const grid = gridFor(cursor.y, cursor.m);
  const items = useItems(grid.start, grid.end);

  const byDay = useMemo(() => {
    const map = new Map<string, Item[]>();
    for (const it of items) {
      const list = map.get(it.due) ?? [];
      list.push(it);
      map.set(it.due, list);
    }
    return map;
  }, [items]);

  const month = useMemo(() => {
    const inMonth = items.filter((i) => i.due >= grid.first && i.due <= grid.last);
    const due = inMonth.reduce((s, i) => s + (i.state === 'skipped' ? 0 : i.amount ?? 0), 0);
    const paid = inMonth.filter((i) => i.state === 'paid' || i.state === 'autopaid').reduce((s, i) => s + (i.amount ?? 0), 0);
    const left = inMonth.filter((i) => needsYou(i.state)).reduce((s, i) => s + (i.amount ?? 0), 0);
    return { due, paid, left };
  }, [items, grid.first, grid.last]);

  const shift = (delta: number) => {
    const idx = cursor.y * 12 + (cursor.m - 1) + delta;
    const next = { y: Math.floor(idx / 12), m: (idx % 12) + 1 };
    setCursor(next);
    const sameMonth = parts(today).y === next.y && parts(today).m === next.m;
    setSelected(sameMonth ? today : ymd(next.y, next.m, 1));
  };

  const days: string[] = [];
  for (let d = grid.start; d <= grid.end; d = addDays(d, 1)) days.push(d);
  const dayItems = byDay.get(selected) ?? [];

  return (
    <div className="screen">
      <header className="topbar">
        <h1 className="topbar-title">Calendar</h1>
      </header>

      <div className="cal-head">
        <div className="cal-month">
          {monthName(cursor.m, true)} {cursor.y !== t.y ? cursor.y : ''}
        </div>
        <div className="cal-nav">
          <button type="button" className="icon-btn" aria-label="Previous month" onClick={() => shift(-1)}>
            <ChevronLeft size={22} />
          </button>
          <button type="button" className="icon-btn" aria-label="Next month" onClick={() => shift(1)}>
            <ChevronRight size={22} />
          </button>
        </div>
      </div>

      <div className="cal-grid" role="grid" aria-label={`${monthName(cursor.m, true)} ${cursor.y}`}>
        {[1, 2, 3, 4, 5, 6, 0].map((wd) => (
          <div key={wd} className="cal-dow" aria-hidden>
            {dayName(wd).slice(0, 2)}
          </div>
        ))}
        {days.map((d) => {
          const list = byDay.get(d) ?? [];
          const out = d < grid.first || d > grid.last;
          const tones = list.slice(0, 3).map((i) => (i.state === 'upcoming' ? 'accent' : toneFor(i)));
          return (
            <button
              key={d}
              type="button"
              role="gridcell"
              className={`cal-day${out ? ' out' : ''}${d < today ? ' past' : ''}${d === today ? ' today' : ''}`}
              aria-pressed={d === selected}
              aria-label={`${mediumDate(d)}${list.length ? `, ${list.length} due` : ''}`}
              onClick={() => setSelected(d)}
            >
              <span className="d num">{Number(d.slice(8))}</span>
              <span className="cal-dots">
                {tones.map((tone, i) => (
                  <i key={i} className={tone === 'neutral' ? '' : tone} />
                ))}
              </span>
            </button>
          );
        })}
      </div>

      <div className="legend" aria-hidden>
        <span><i style={{ background: 'var(--accent)' }} /> Needs you</span>
        <span><i style={{ background: 'var(--auto)' }} /> AutoPay</span>
        <span><i style={{ background: 'var(--late)' }} /> Overdue</span>
        <span><i style={{ background: 'var(--paid)' }} /> Paid</span>
      </div>

      <div className="cal-summary">
        <div>
          <div className="stat-value num">{inr(month.due)}</div>
          <div className="stat-label">Due in {monthName(cursor.m)}</div>
        </div>
        <div>
          <div className="stat-value num" style={{ color: 'var(--paid)' }}>{inr(month.paid)}</div>
          <div className="stat-label">Paid</div>
        </div>
        <div>
          <div className="stat-value accent num">{inr(month.left)}</div>
          <div className="stat-label">Still needs you</div>
        </div>
      </div>

      <section className="section">
        <div className="section-head">
          <h2 className="section-title">{selected === today ? 'Today' : mediumDate(selected, today)}</h2>
          <button type="button" className="link-btn" onClick={() => openSheet({ kind: 'add', due: selected < today ? today : selected })}>
            <Plus size={15} style={{ display: 'inline', verticalAlign: '-2px' }} /> Add
          </button>
        </div>
        {dayItems.length ? (
          <div className="rows">
            {dayItems.map((it, i) => (
              <ItemRow key={it.key} item={it} index={i} />
            ))}
          </div>
        ) : (
          <p className="muted" style={{ padding: '10px 0' }}>
            Nothing due {selected === today ? 'today' : 'this day'}.
          </p>
        )}
      </section>
    </div>
  );
}
