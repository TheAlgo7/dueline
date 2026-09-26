import { dismissToast, useToast } from '../lib/toast';

export function ToastHost() {
  const t = useToast();
  if (!t) return null;
  return (
    <div className="toast-wrap" role="status" aria-live="polite">
      <div key={t.id} className={`toast${t.tone && t.tone !== 'default' ? ` ${t.tone}` : ''}${t.action ? '' : ' solo'}`}>
        <span>{t.text}</span>
        {t.action ? (
          <button
            type="button"
            onClick={() => {
              t.action?.run();
              dismissToast(t.id);
            }}
          >
            {t.action.label}
          </button>
        ) : null}
      </div>
    </div>
  );
}
