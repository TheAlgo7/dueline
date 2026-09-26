import { useState } from 'react';
import { Share, SquarePlus } from 'lucide-react';
import { createAccount, deleteAccount, friendlyAuthError, resetPassword, signInWithEmail, signInWithGoogle } from '../lib/auth';
import { isIOS } from '../lib/push';
import { closeAllSheets, closeSheet, type OpenSheet } from '../lib/sheets';
import { useStore } from '../lib/store';
import { toast } from '../lib/toast';
import { Field, Seg } from '../ui/controls';
import { Sheet } from '../ui/Sheet';

export function AccountSheet({ spec, depth, isTop }: { spec: Extract<OpenSheet, { kind: 'account' }>; depth: number; isTop: boolean }) {
  const user = useStore((s) => s.user);
  const guest = Boolean(user?.isAnonymous);
  const [mode, setMode] = useState<'signin' | 'create'>(spec.mode ?? 'signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (fn: () => Promise<void>, done: string) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      closeAllSheets();
      toast(done, { tone: 'paid' });
    } catch (e) {
      setError(friendlyAuthError(e));
    } finally {
      setBusy(false);
    }
  };

  const submit = () => {
    if (!email.trim() || !password) {
      setError('Enter your email and a password.');
      return;
    }
    if (mode === 'create') run(() => createAccount(email, password), guest ? 'Saved. Your payments now sync to this account.' : 'Account created');
    else run(() => signInWithEmail(email, password), 'Signed in');
  };

  const title = mode === 'create' ? (guest ? 'Save your payments' : 'Create an account') : 'Sign in';

  return (
    <Sheet
      id={spec.id}
      closing={spec.closing}
      depth={depth}
      isTop={isTop}
      title={title}
      footer={
        <button type="button" className="btn primary block" disabled={busy} onClick={submit}>
          {busy ? 'One moment…' : mode === 'create' ? (guest ? 'Save to this account' : 'Create account') : 'Sign in'}
        </button>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Seg
          label="Account"
          value={mode}
          onChange={(v) => {
            setMode(v);
            setError(null);
          }}
          options={[
            { value: 'create', label: guest ? 'New account' : 'Create account' },
            { value: 'signin', label: 'I have one' },
          ]}
        />
        <p className="field-help" style={{ marginTop: 12 }}>
          {mode === 'create'
            ? guest
              ? 'Everything you added stays exactly as it is, and follows you to any device you sign in on.'
              : 'Your payments sync across every device you sign in on.'
            : guest
              ? 'Anything you added as a guest comes with you into the account.'
              : 'Welcome back.'}
        </p>
        <Field label="Email" htmlFor="acc-email">
          <input id="acc-email" className="input" type="email" autoComplete="email" inputMode="email" autoCapitalize="off" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Password" htmlFor="acc-pw" help={mode === 'create' ? 'At least 6 characters.' : undefined}>
          <input
            id="acc-pw"
            className="input"
            type="password"
            autoComplete={mode === 'create' ? 'new-password' : 'current-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        {error ? <div className="field-error">{error}</div> : null}
        {mode === 'signin' ? (
          <button
            type="button"
            className="link-btn"
            style={{ marginTop: 10 }}
            onClick={async () => {
              if (!email.trim()) {
                setError('Enter your email first, then tap this again.');
                return;
              }
              try {
                await resetPassword(email);
                toast('Check your inbox for a reset link');
              } catch (e) {
                setError(friendlyAuthError(e));
              }
            }}
          >
            Forgot password?
          </button>
        ) : null}
        <button type="submit" hidden />
      </form>

      <div style={{ marginTop: 22, paddingTop: 18, borderTop: '1px solid var(--line)' }}>
        <button
          type="button"
          className="btn secondary block"
          disabled={busy}
          onClick={() => run(signInWithGoogle, guest ? 'Saved to your Google account' : 'Signed in')}
        >
          <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
            <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
            <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
            <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
            <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
          </svg>
          Continue with Google
        </button>
      </div>
    </Sheet>
  );
}

export function DeleteSheet({ spec, depth, isTop }: { spec: Extract<OpenSheet, { kind: 'delete' }>; depth: number; isTop: boolean }) {
  const user = useStore((s) => s.user);
  const [typed, setTyped] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const needsPassword = Boolean(user && !user.isAnonymous && user.providerData.some((p) => p.providerId === 'password'));

  return (
    <Sheet
      id={spec.id}
      closing={spec.closing}
      depth={depth}
      isTop={isTop}
      title="Delete everything"
      footer={
        <button
          type="button"
          className="btn danger block"
          disabled={busy || typed.trim().toUpperCase() !== 'DELETE' || (needsPassword && !password)}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await deleteAccount(password || undefined);
              closeAllSheets();
              toast('Everything is deleted');
            } catch (e) {
              setError(navigator.onLine ? friendlyAuthError(e) : "Deleting needs a connection. Try again when you're online.");
              setBusy(false);
            }
          }}
        >
          {busy ? 'Deleting…' : 'Delete my account and data'}
        </button>
      }
    >
      <p style={{ color: 'var(--ink-2)' }}>
        This removes every payment, payee, reminder and record of paying, from this device and from Dueline's servers, then deletes the account. It can't be undone.
      </p>
      <p className="field-help">Want a copy first? Use Export my data on the You screen.</p>
      <Field label='Type "DELETE" to confirm' htmlFor="del-typed">
        <input id="del-typed" className="input" autoComplete="off" autoCapitalize="characters" value={typed} onChange={(e) => setTyped(e.target.value)} />
      </Field>
      {needsPassword ? (
        <Field label="Your password" htmlFor="del-pw">
          <input id="del-pw" className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
      ) : null}
      {error ? <div className="field-error">{error}</div> : null}
    </Sheet>
  );
}

export function InstallSheet({ spec, depth, isTop }: { spec: Extract<OpenSheet, { kind: 'install' }>; depth: number; isTop: boolean }) {
  const ios = isIOS();
  return (
    <Sheet
      id={spec.id}
      closing={spec.closing}
      depth={depth}
      isTop={isTop}
      title="Install Dueline"
      footer={
        <button type="button" className="btn secondary block" onClick={() => closeSheet(spec.id)}>
          Done
        </button>
      }
    >
      {ios ? (
        <ol style={{ paddingLeft: 20, lineHeight: 1.7, color: 'var(--ink-2)' }}>
          <li>
            Open this page in <strong style={{ color: 'var(--ink)' }}>Safari</strong>.
          </li>
          <li>
            Tap <Share size={16} style={{ display: 'inline', verticalAlign: '-3px' }} /> <strong style={{ color: 'var(--ink)' }}>Share</strong>.
          </li>
          <li>
            Choose <SquarePlus size={16} style={{ display: 'inline', verticalAlign: '-3px' }} /> <strong style={{ color: 'var(--ink)' }}>Add to Home Screen</strong>.
          </li>
          <li>Open Dueline from the Home Screen, then turn on reminders in You.</li>
        </ol>
      ) : (
        <ol style={{ paddingLeft: 20, lineHeight: 1.7, color: 'var(--ink-2)' }}>
          <li>Open the browser menu (the three dots).</li>
          <li>
            Choose <strong style={{ color: 'var(--ink)' }}>Install app</strong> or <strong style={{ color: 'var(--ink)' }}>Add to Home screen</strong>.
          </li>
          <li>Dueline opens full screen, works offline and can send reminders.</li>
        </ol>
      )}
    </Sheet>
  );
}
