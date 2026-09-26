import { useEffect, useState } from 'react';

/** A spinner that admits when something is wrong instead of spinning forever. */
export function Loading({ inline }: { inline?: boolean }) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), 9000);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className="center-fill" style={inline ? undefined : { minHeight: '100dvh' }}>
      <div style={{ display: 'grid', justifyItems: 'center', gap: 16, textAlign: 'center', padding: '0 24px' }}>
        <div className="spinner" />
        {slow ? (
          <>
            <p className="muted" style={{ maxWidth: '32ch' }}>
              {navigator.onLine ? 'This is taking longer than it should.' : 'You are offline. Dueline will load what it has saved.'}
            </p>
            <button type="button" className="btn secondary small" onClick={() => location.reload()}>
              Reload
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}
