import { useId, type ReactNode } from 'react';
import { inrDigits, parseRupees, toInput } from '../core/money';

export function Field({ label, help, error, children, htmlFor }: { label?: ReactNode; help?: ReactNode; error?: string | null; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="field">
      {label ? (
        <label className="field-label" htmlFor={htmlFor}>
          {label}
        </label>
      ) : null}
      {children}
      {error ? <div className="field-error">{error}</div> : help ? <div className="field-help">{help}</div> : null}
    </div>
  );
}

export function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: Array<{ value: T; label: string }>; onChange: (v: T) => void; label: string }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Chip({ pressed, onClick, children, accent, icon }: { pressed?: boolean; onClick: () => void; children: ReactNode; accent?: boolean; icon?: ReactNode }) {
  return (
    <button type="button" className={`chip${accent ? ' accent' : ''}`} aria-pressed={pressed} onClick={onClick}>
      {icon}
      {children}
    </button>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" className="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)} />
  );
}

export function ToggleRow({ title, sub, checked, onChange }: { title: string; sub?: ReactNode; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="toggle-row">
      <div className="toggle-text">
        <div className="toggle-title">{title}</div>
        {sub ? <div className="toggle-sub">{sub}</div> : null}
      </div>
      <Switch checked={checked} onChange={onChange} label={title} />
    </div>
  );
}

/**
 * Rupee input. Holds the typed text so "1500." or "1,5" can be mid-edit,
 * reports paise (or null) upward on every keystroke.
 */
export function MoneyInput({
  text,
  onText,
  placeholder = '0',
  autoFocus,
  id,
  label,
}: {
  text: string;
  onText: (text: string, paise: number | null) => void;
  placeholder?: string;
  autoFocus?: boolean;
  id?: string;
  label?: string;
}) {
  const auto = useId();
  return (
    <div className="money-input">
      <span className="rupee" aria-hidden>
        ₹
      </span>
      <input
        id={id ?? auto}
        className="num"
        inputMode="decimal"
        autoComplete="off"
        enterKeyHint="done"
        aria-label={label ?? 'Amount in rupees'}
        placeholder={placeholder}
        value={text}
        autoFocus={autoFocus}
        onChange={(e) => {
          const raw = e.target.value.replace(/[^\d.,kKlL]/g, '');
          onText(raw, parseRupees(raw));
        }}
        onBlur={() => {
          const p = parseRupees(text);
          if (p != null) onText(inrDigits(p), p);
        }}
      />
    </div>
  );
}

export const moneyText = (p: number | null | undefined) => (p == null ? '' : inrDigits(p));
export { toInput };
