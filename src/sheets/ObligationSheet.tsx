import { useMemo, useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { daysInMonth, isValidISODate, parts } from '../core/dates';
import { parseRupees } from '../core/money';
import { AUTO_LABEL, KINDS, kindFor, matchService, METHOD_LABEL, type KindPreset } from '../core/presets';
import { describe } from '../core/recurrence';
import type { AutoVia, Category, Freq, Method, Obligation, Recurrence } from '../core/types';
import { isVpa, normalizeVpa, safeUrl } from '../core/upi';
import { deleteObligation, saveObligation, savePayee, setActive, today } from '../lib/actions';
import { closeAllSheets, closeSheet, type OpenSheet } from '../lib/sheets';
import { useStore } from '../lib/store';
import { toast } from '../lib/toast';
import { CATEGORY_ICON } from '../ui/bits';
import { Chip, Field, MoneyInput, moneyText, Seg, ToggleRow } from '../ui/controls';
import { Sheet } from '../ui/Sheet';

type RepeatChoice = 'once' | 'weekly' | 'monthly' | 'quarterly' | 'yearly' | 'custom';
type EndMode = 'never' | 'count' | 'until';

function repeatOf(r: Recurrence): { choice: RepeatChoice; n: number; unit: Exclude<Freq, 'once'> } {
  if (r.freq === 'once') return { choice: 'once', n: 1, unit: 'months' };
  if (r.freq === 'weeks' && r.interval === 1) return { choice: 'weekly', n: 1, unit: 'weeks' };
  if (r.freq === 'months' && r.interval === 1) return { choice: 'monthly', n: 1, unit: 'months' };
  if (r.freq === 'months' && r.interval === 3) return { choice: 'quarterly', n: 3, unit: 'months' };
  if (r.freq === 'years' && r.interval === 1) return { choice: 'yearly', n: 1, unit: 'years' };
  return { choice: 'custom', n: r.interval, unit: r.freq };
}

const REMIND_CHOICES = [7, 3, 2, 1, 0];
const remindLabel = (d: number) => (d === 0 ? 'On the day' : d === 1 ? '1 day before' : `${d} days before`);

export function ObligationSheet({ spec, depth, isTop }: { spec: Extract<OpenSheet, { kind: 'add' } | { kind: 'edit' }>; depth: number; isTop: boolean }) {
  const obligations = useStore((s) => s.obligations);
  const payees = useStore((s) => s.payees);
  const editing: Obligation | undefined = spec.kind === 'edit' ? obligations.find((o) => o.id === spec.obligationId) : undefined;
  const addPayee = spec.kind === 'add' && spec.payeeId ? payees.find((p) => p.id === spec.payeeId) : undefined;

  const seed = editing ?? null;
  const startKind: KindPreset | null = editing ? kindFor(editing.category) : spec.kind === 'add' && spec.category ? kindFor(spec.category) : addPayee ? kindFor('person') : null;
  const base = startKind ?? { ...kindFor('person'), category: 'other' as Category };
  const rep0 = seed ? repeatOf(seed.recurrence) : repeatOf({ freq: base.freq, interval: base.interval, start: today() });

  const [kind, setKind] = useState<Category | null>(startKind?.category ?? null);
  const [title, setTitle] = useState(seed?.title ?? addPayee?.name ?? '');
  const [amountType, setAmountType] = useState<'fixed' | 'variable'>(seed?.amountType ?? base.amountType);
  const [amountText, setAmountText] = useState(moneyText(seed?.amount));
  const [handling, setHandling] = useState(seed?.handling ?? base.handling);
  const [method, setMethod] = useState<Method>(seed?.method ?? base.method);
  const [autoVia, setAutoVia] = useState<AutoVia>(seed?.autoVia ?? base.autoVia ?? 'card');
  const [account, setAccount] = useState(seed?.account ?? '');
  const [payeeId, setPayeeId] = useState<string | null>(seed?.payeeId ?? addPayee?.id ?? null);
  const [upi, setUpi] = useState(seed?.upi ?? addPayee?.upi ?? '');
  const [payTo, setPayTo] = useState(seed?.payTo ?? addPayee?.name ?? '');
  const [savePayeeToo, setSavePayeeToo] = useState(true);
  const [url, setUrl] = useState(seed?.url ?? '');
  const [start, setStart] = useState<string>(seed?.recurrence.start ?? (spec.kind === 'add' ? spec.due : undefined) ?? today());
  const [repeat, setRepeat] = useState<RepeatChoice>(rep0.choice);
  const [customN, setCustomN] = useState(String(rep0.n));
  const [customUnit, setCustomUnit] = useState<Exclude<Freq, 'once'>>(rep0.unit);
  const [eom, setEom] = useState(Boolean(seed?.recurrence.eom));
  const [endMode, setEndMode] = useState<EndMode>(seed?.recurrence.count ? 'count' : seed?.recurrence.until ? 'until' : 'never');
  const [count, setCount] = useState(String(seed?.recurrence.count ?? 12));
  const [until, setUntil] = useState(seed?.recurrence.until ?? '');
  const [remind, setRemind] = useState<number[]>(seed?.remind ?? base.remind);
  const [note, setNote] = useState(seed?.note ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirmDelete, setConfirmDelete] = useState(false);
  const touched = useRef(new Set<string>());
  const bodyRef = useRef<HTMLFormElement>(null);

  const touch = (k: string) => touched.current.add(k);
  const hint = kind ? kindFor(kind).hint : 'What is it?';
  const service = useMemo(() => (editing ? null : matchService(title)), [title, editing]);
  const serviceApplied = service && url === service.url;

  const applyKind = (k: KindPreset) => {
    setKind(k.category);
    if (!touched.current.has('amountType')) setAmountType(k.amountType);
    if (!touched.current.has('handling')) setHandling(k.handling);
    if (!touched.current.has('method')) setMethod(k.method);
    if (k.autoVia && !touched.current.has('autoVia')) setAutoVia(k.autoVia);
    if (!touched.current.has('repeat')) {
      const r = repeatOf({ freq: k.freq, interval: k.interval, start });
      setRepeat(r.choice);
      setCustomN(String(r.n));
      setCustomUnit(r.unit);
    }
    if (!touched.current.has('remind')) setRemind(k.remind);
  };

  const applyService = () => {
    if (!service) return;
    setTitle(service.name);
    setKind(service.category);
    setHandling(service.handling);
    setMethod(service.method);
    if (service.autoVia) setAutoVia(service.autoVia);
    setUrl(service.url);
    if (service.freq === 'years') setRepeat('yearly');
    if (service.handling === 'auto' && !touched.current.has('remind')) setRemind([1]);
  };

  const recurrence = (): Recurrence => {
    let freq: Freq = 'months';
    let interval = 1;
    switch (repeat) {
      case 'once': freq = 'once'; break;
      case 'weekly': freq = 'weeks'; break;
      case 'monthly': freq = 'months'; break;
      case 'quarterly': freq = 'months'; interval = 3; break;
      case 'yearly': freq = 'years'; break;
      case 'custom': freq = customUnit; interval = Math.max(1, Math.min(400, Math.floor(Number(customN) || 1))); break;
    }
    const r: Recurrence = { freq, interval, start };
    if (freq === 'months' && eom) r.eom = true;
    if (freq !== 'once' && endMode === 'count') r.count = Math.max(1, Math.floor(Number(count) || 1));
    if (freq !== 'once' && endMode === 'until' && until) r.until = until;
    return r;
  };

  const isLastDay = isValidISODate(start) && (() => { const p = parts(start); return p.d === daysInMonth(p.y, p.m); })();
  const monthlyish = repeat === 'monthly' || repeat === 'quarterly' || (repeat === 'custom' && customUnit === 'months');
  const upiPayees = payees.filter((p) => p.upi);

  const submit = () => {
    const e: Record<string, string> = {};
    const amount = parseRupees(amountText);
    if (!title.trim()) e.title = 'Give it a name.';
    if (amountType === 'fixed' && amount == null) e.amount = 'Enter the amount.';
    if (amountText.trim() && amount == null) e.amount = 'That amount doesn\'t look right.';
    if (!isValidISODate(start)) e.start = 'Pick a date.';
    if (handling === 'manual' && method === 'upi' && upi.trim() && !isVpa(upi)) e.upi = 'A UPI ID looks like name@bank.';
    if (url.trim() && !safeUrl(url)) e.url = 'That link doesn\'t look right.';
    if (repeat !== 'once' && endMode === 'until' && (!isValidISODate(until) || until < start)) e.until = 'Pick an end date after the first one.';
    if (repeat === 'custom' && !(Number(customN) >= 1)) e.custom = 'How often?';
    setErrors(e);
    if (Object.keys(e).length) {
      requestAnimationFrame(() => bodyRef.current?.querySelector('.field-error')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
      return;
    }

    let linkedPayee = payeeId;
    const vpa = upi.trim() ? normalizeVpa(upi) : '';
    if (handling === 'manual' && method === 'upi' && vpa && !linkedPayee && savePayeeToo) {
      const existing = payees.find((p) => p.upi && normalizeVpa(p.upi) === vpa);
      linkedPayee = existing?.id ?? savePayee({ name: payTo.trim() || title.trim(), upi: vpa });
    }

    const category = kind ?? 'other';
    saveObligation(
      {
        title: title.trim(),
        category,
        amountType,
        amount,
        handling,
        method,
        autoVia: handling === 'auto' ? autoVia : null,
        account: account.trim(),
        payeeId: handling === 'manual' && method === 'upi' ? linkedPayee : null,
        upi: vpa,
        payTo: payTo.trim(),
        url: url.trim() ? safeUrl(url) ?? '' : '',
        recurrence: recurrence(),
        remind: [...new Set(remind)].sort((a, b) => b - a),
        note: note.trim(),
        active: editing?.active ?? true,
      },
      editing,
    );
    closeSheet(spec.id);
    toast(editing ? 'Saved' : `Added ${title.trim()}`, { tone: 'paid' });
  };

  const footer = (
    <button type="button" className="btn primary block" onClick={submit}>
      {editing ? 'Save changes' : 'Add payment'}
    </button>
  );

  return (
    <Sheet id={spec.id} closing={spec.closing} depth={depth} isTop={isTop} title={editing ? 'Edit payment' : 'New payment'} footer={footer}>
      <form
        ref={bodyRef}
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        {!editing ? (
          <div className="chips scroll" style={{ marginBottom: 18 }} role="group" aria-label="Kind">
            {KINDS.map((k) => {
              const Icon = CATEGORY_ICON[k.category];
              return (
                <Chip key={k.category} pressed={kind === k.category} onClick={() => applyKind(k)} icon={<Icon size={16} strokeWidth={1.9} />}>
                  {k.label}
                </Chip>
              );
            })}
          </div>
        ) : null}

        <Field label="Name" htmlFor="ob-title" error={errors.title}>
          <input
            id="ob-title"
            className={`input${errors.title ? ' invalid' : ''}`}
            placeholder={hint}
            value={title}
            maxLength={80}
            autoComplete="off"
            onChange={(e) => setTitle(e.target.value)}
          />
          {service && !serviceApplied ? (
            <div className="suggest">
              <Chip onClick={applyService} accent pressed>
                Use {service.name}: {service.handling === 'auto' ? 'AutoPay' : METHOD_LABEL[service.method]}, {new URL(service.url).hostname.replace(/^www\./, '')}
              </Chip>
            </div>
          ) : null}
        </Field>

        <Field label="Amount" error={errors.amount} help={amountType === 'variable' ? 'Optional. Used as an estimate until you enter each bill.' : undefined}>
          <Seg
            label="Amount type"
            value={amountType}
            onChange={(v) => {
              touch('amountType');
              setAmountType(v);
            }}
            options={[
              { value: 'fixed', label: 'Same every time' },
              { value: 'variable', label: 'Changes' },
            ]}
          />
          <div style={{ marginTop: 10 }}>
            <MoneyInput text={amountText} onText={(t) => setAmountText(t)} placeholder={amountType === 'variable' ? 'Usual amount' : '0'} />
          </div>
        </Field>

        <Field label="How does it get paid?">
          <Seg
            label="Handling"
            value={handling}
            onChange={(v) => {
              touch('handling');
              setHandling(v);
              if (!touched.current.has('remind')) setRemind(v === 'auto' ? [1] : kind ? kindFor(kind).remind : [1, 0]);
            }}
            options={[
              { value: 'manual', label: 'I pay it' },
              { value: 'auto', label: 'AutoPay' },
            ]}
          />
        </Field>

        {handling === 'manual' ? (
          <>
            <div className="chips" style={{ marginTop: 12 }} role="group" aria-label="Method">
              {(['upi', 'web', 'card', 'bank', 'cash'] as Method[]).map((m) => (
                <Chip
                  key={m}
                  pressed={method === m}
                  onClick={() => {
                    touch('method');
                    setMethod(m);
                  }}
                >
                  {METHOD_LABEL[m]}
                </Chip>
              ))}
            </div>

            {method === 'upi' ? (
              <>
                {upiPayees.length ? (
                  <Field label="Pay to">
                    <div className="chips">
                      {upiPayees.map((p) => (
                        <Chip
                          key={p.id}
                          pressed={payeeId === p.id}
                          onClick={() => {
                            if (payeeId === p.id) {
                              setPayeeId(null);
                              return;
                            }
                            setPayeeId(p.id);
                            setUpi(p.upi ?? '');
                            setPayTo(p.name);
                          }}
                        >
                          {p.name}
                        </Chip>
                      ))}
                    </div>
                  </Field>
                ) : null}
                <Field label="UPI ID" htmlFor="ob-upi" error={errors.upi} help="Their UPI ID, like rahul@okaxis. Pay opens your UPI app with it filled in.">
                  <input
                    id="ob-upi"
                    className={`input${errors.upi ? ' invalid' : ''}`}
                    placeholder="name@bank"
                    value={upi}
                    inputMode="email"
                    autoCapitalize="off"
                    autoComplete="off"
                    spellCheck={false}
                    onChange={(e) => {
                      setUpi(e.target.value);
                      if (payeeId) setPayeeId(null);
                    }}
                  />
                </Field>
                <Field label="Their name" htmlFor="ob-payto">
                  <input id="ob-payto" className="input" placeholder="Rahul" value={payTo} maxLength={80} onChange={(e) => setPayTo(e.target.value)} />
                </Field>
                {!payeeId && upi.trim() ? (
                  <div style={{ marginTop: 6 }}>
                    <ToggleRow title="Save to Payees" sub="Reuse them for anything else you pay them." checked={savePayeeToo} onChange={setSavePayeeToo} />
                  </div>
                ) : null}
              </>
            ) : null}

            {method === 'card' || method === 'bank' || kind === 'card' ? (
              <Field label={method === 'card' || kind === 'card' ? 'Which card' : 'Which account'} htmlFor="ob-account" help="A nickname and the last 4 digits is plenty. Never the full number.">
                <input id="ob-account" className="input" placeholder={method === 'card' || kind === 'card' ? 'HDFC Regalia ••4821' : 'Landlord, SBI ••0931'} value={account} maxLength={80} onChange={(e) => setAccount(e.target.value)} />
              </Field>
            ) : null}

            {method !== 'cash' && method !== 'upi' ? (
              <Field label="Payment link" htmlFor="ob-url" error={errors.url} help="Where you pay it. Pay opens this.">
                <input id="ob-url" className={`input${errors.url ? ' invalid' : ''}`} placeholder="jio.com" value={url} inputMode="url" autoCapitalize="off" spellCheck={false} onChange={(e) => setUrl(e.target.value)} />
              </Field>
            ) : null}
          </>
        ) : (
          <>
            <div className="chips" style={{ marginTop: 12 }} role="group" aria-label="AutoPay runs on">
              {(['card', 'upi', 'bank', 'wallet', 'other'] as AutoVia[]).map((v) => (
                <Chip
                  key={v}
                  pressed={autoVia === v}
                  onClick={() => {
                    touch('autoVia');
                    setAutoVia(v);
                  }}
                >
                  {AUTO_LABEL[v]}
                </Chip>
              ))}
            </div>
            <Field label="Charged to" htmlFor="ob-acc2" help="Nickname and last 4 digits only.">
              <input id="ob-acc2" className="input" placeholder="HDFC ••4821" value={account} maxLength={80} onChange={(e) => setAccount(e.target.value)} />
            </Field>
            <Field label="Manage link" htmlFor="ob-url2" error={errors.url}>
              <input id="ob-url2" className={`input${errors.url ? ' invalid' : ''}`} placeholder="netflix.com/account" value={url} inputMode="url" autoCapitalize="off" spellCheck={false} onChange={(e) => setUrl(e.target.value)} />
            </Field>
          </>
        )}

        <Field label={repeat === 'once' ? 'Due on' : 'Next due'} htmlFor="ob-start" error={errors.start} help={repeat === 'once' ? undefined : 'The next one you haven\'t paid yet.'}>
          <input id="ob-start" type="date" className={`input${errors.start ? ' invalid' : ''}`} value={start} onChange={(e) => setStart(e.target.value)} />
        </Field>

        <Field label="Repeats" error={errors.custom}>
          <div className="chips" role="group" aria-label="Repeats">
            {(['once', 'monthly', 'weekly', 'quarterly', 'yearly', 'custom'] as RepeatChoice[]).map((r) => (
              <Chip
                key={r}
                pressed={repeat === r}
                onClick={() => {
                  touch('repeat');
                  setRepeat(r);
                }}
              >
                {r === 'once' ? 'Just once' : r === 'custom' ? 'Custom' : r[0].toUpperCase() + r.slice(1)}
              </Chip>
            ))}
          </div>
          {repeat === 'custom' ? (
            <div style={{ display: 'flex', gap: 10, marginTop: 10, alignItems: 'center' }}>
              <span className="muted">Every</span>
              <input className="input num" style={{ width: 84 }} inputMode="numeric" value={customN} aria-label="Interval" onChange={(e) => setCustomN(e.target.value.replace(/\D/g, '').slice(0, 3))} />
              <select className="input" style={{ flex: 1 }} value={customUnit} aria-label="Unit" onChange={(e) => setCustomUnit(e.target.value as Exclude<Freq, 'once'>)}>
                <option value="days">days</option>
                <option value="weeks">weeks</option>
                <option value="months">months</option>
                <option value="years">years</option>
              </select>
            </div>
          ) : null}
          {repeat !== 'once' && isValidISODate(start) ? (
            <div className="field-help">{describe(recurrence())}.</div>
          ) : null}
        </Field>

        {monthlyish && isLastDay ? (
          <ToggleRow title="Always the last day of the month" checked={eom} onChange={setEom} />
        ) : null}

        {repeat !== 'once' ? (
          <Field label="Ends" error={errors.until}>
            <Seg
              label="Ends"
              value={endMode}
              onChange={setEndMode}
              options={[
                { value: 'never', label: 'Never' },
                { value: 'count', label: 'After' },
                { value: 'until', label: 'On a date' },
              ]}
            />
            {endMode === 'count' ? (
              <div style={{ display: 'flex', gap: 10, marginTop: 10, alignItems: 'center' }}>
                <input className="input num" style={{ width: 96 }} inputMode="numeric" value={count} aria-label="Number of payments" onChange={(e) => setCount(e.target.value.replace(/\D/g, '').slice(0, 3))} />
                <span className="muted">payments, including the next one</span>
              </div>
            ) : endMode === 'until' ? (
              <input type="date" className={`input${errors.until ? ' invalid' : ''}`} style={{ marginTop: 10 }} value={until} aria-label="End date" onChange={(e) => setUntil(e.target.value)} />
            ) : null}
          </Field>
        ) : null}

        <Field label="Remind me">
          {handling === 'auto' ? (
            <ToggleRow
              title="Heads-up the day before"
              sub="A quiet note that it will charge. Nothing to do."
              checked={remind.length > 0}
              onChange={(v) => {
                touch('remind');
                setRemind(v ? [1] : []);
              }}
            />
          ) : (
            <div className="chips" role="group" aria-label="Remind me">
              {REMIND_CHOICES.map((d) => (
                <Chip
                  key={d}
                  pressed={remind.includes(d)}
                  onClick={() => {
                    touch('remind');
                    setRemind((r) => (r.includes(d) ? r.filter((x) => x !== d) : [...r, d]));
                  }}
                >
                  {remindLabel(d)}
                </Chip>
              ))}
            </div>
          )}
        </Field>

        <Field label="Note" htmlFor="ob-note">
          <textarea id="ob-note" className="input" placeholder="Anything worth remembering" value={note} maxLength={600} onChange={(e) => setNote(e.target.value)} />
        </Field>

        {editing ? (
          <div className="menu" style={{ marginTop: 28 }}>
            <button
              type="button"
              className="nav-row"
              onClick={() => {
                setActive(editing, !editing.active);
                closeSheet(spec.id);
                toast(editing.active ? `Stopped tracking ${editing.title}. History is kept.` : `Tracking ${editing.title} again`);
              }}
            >
              <span className="grow">{editing.active ? 'Stop tracking' : 'Start tracking again'}</span>
              <span className="value">{editing.active ? 'Keeps history' : ''}</span>
            </button>
            {confirmDelete ? (
              <div style={{ padding: '14px 0' }}>
                <p style={{ marginBottom: 12, color: 'var(--ink-2)' }}>Delete {editing.title} and every record of paying it? This can't be undone.</p>
                <div className="btn-row">
                  <button type="button" className="btn secondary" onClick={() => setConfirmDelete(false)}>
                    Keep it
                  </button>
                  <button
                    type="button"
                    className="btn danger"
                    onClick={() => {
                      deleteObligation(editing);
                      closeAllSheets();
                      toast(`Deleted ${editing.title}`);
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" className="nav-row danger" onClick={() => setConfirmDelete(true)}>
                <Trash2 size={18} />
                <span className="grow">Delete</span>
              </button>
            )}
          </div>
        ) : null}
        <button type="submit" hidden />
      </form>
    </Sheet>
  );
}
