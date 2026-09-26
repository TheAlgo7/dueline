import { useEffect, useState } from 'react';
import { Mail, Share, Smartphone, SquarePlus } from 'lucide-react';
import type { ConfirmationResult } from 'firebase/auth';
import {
  confirmPhoneCode,
  createAccount,
  deleteAccount,
  friendlyAuthError,
  resetPassword,
  resetPhoneVerifier,
  sendPhoneCode,
  signInWithApple,
  signInWithEmail,
  signInWithGoogle,
} from '../lib/auth';
import { isIOS } from '../lib/push';
import { closeAllSheets, closeSheet, type OpenSheet } from '../lib/sheets';
import { useStore } from '../lib/store';
import { toast } from '../lib/toast';
import { Field, Seg } from '../ui/controls';
import { Sheet } from '../ui/Sheet';
import { AltButton, AppleLogo, GoogleButton, useProviderStatus } from '../ui/SignIn';

type Run = (fn: () => Promise<void>, done: string) => Promise<void>;

function EmailForm({ guest, initial, run, busy, setError }: { guest: boolean; initial: 'signin' | 'create'; run: Run; busy: boolean; setError: (e: string | null) => void }) {
  const [mode, setMode] = useState<'signin' | 'create'>(initial);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const submit = () => {
    if (!email.trim() || !password) {
      setError('Enter your email and a password.');
      return;
    }
    if (mode === 'create') run(() => createAccount(email, password), guest ? 'Saved. Your payments now sync to this account.' : 'Account created');
    else run(() => signInWithEmail(email, password), 'Signed in');
  };

  return (
    <form
      className="method-form"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <Seg
        label="Email account"
        value={mode}
        onChange={(v) => {
          setMode(v);
          setError(null);
        }}
        options={[
          { value: 'signin', label: 'I have an account' },
          { value: 'create', label: 'New account' },
        ]}
      />
      <Field label="Email" htmlFor="acc-email">
        <input id="acc-email" className="input" type="email" autoComplete="email" inputMode="email" autoCapitalize="off" value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <Field label="Password" htmlFor="acc-pw" help={mode === 'create' ? 'At least 6 characters.' : undefined}>
        <input id="acc-pw" className="input" type="password" autoComplete={mode === 'create' ? 'new-password' : 'current-password'} value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      <button type="submit" className="btn secondary block" style={{ marginTop: 16 }} disabled={busy}>
        {busy ? 'One moment…' : mode === 'create' ? (guest ? 'Save with email' : 'Create account') : 'Sign in'}
      </button>
      {mode === 'signin' ? (
        <button
          type="button"
          className="link-quiet"
          style={{ marginTop: 6 }}
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
    </form>
  );
}

/** India first: ten digits get +91; anything typed with a + is used as is. */
function toE164(input: string): string | null {
  const raw = input.trim();
  if (raw.startsWith('+')) {
    const d = raw.replace(/[^\d]/g, '');
    return d.length >= 8 && d.length <= 15 ? `+${d}` : null;
  }
  const d = raw.replace(/\D/g, '').replace(/^0+/, '').replace(/^91(?=\d{10}$)/, '');
  return d.length === 10 ? `+91${d}` : null;
}

function PhoneForm({ run, busy, setError }: { run: Run; busy: boolean; setError: (e: string | null) => void }) {
  const [number, setNumber] = useState('');
  const [code, setCode] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<{ to: string; confirmation: ConfirmationResult } | null>(null);

  useEffect(() => () => resetPhoneVerifier(), []);

  const send = async () => {
    const e164 = toE164(number);
    if (!e164) {
      setError('Enter a 10-digit mobile number.');
      return;
    }
    setError(null);
    setSending(true);
    try {
      const confirmation = await sendPhoneCode(e164, 'recaptcha-slot');
      setSent({ to: e164, confirmation });
    } catch (e) {
      setError(friendlyAuthError(e));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="method-form">
      {!sent ? (
        <>
          <Field label="Mobile number" htmlFor="acc-phone" help="We'll text you a 6-digit code.">
            <div className="phone-input">
              <span aria-hidden>+91</span>
              <input
                id="acc-phone"
                className="input"
                type="tel"
                inputMode="tel"
                autoComplete="tel-national"
                placeholder="98xxxxxx12"
                value={number}
                onChange={(e) => setNumber(e.target.value)}
              />
            </div>
          </Field>
          <button type="button" className="btn secondary block" style={{ marginTop: 16 }} disabled={sending} onClick={send}>
            {sending ? 'Sending…' : 'Send code'}
          </button>
        </>
      ) : (
        <>
          <Field label={`Code sent to ${sent.to}`} htmlFor="acc-code">
            <input
              id="acc-code"
              className="input num"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="6-digit code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            />
          </Field>
          <button
            type="button"
            className="btn secondary block"
            style={{ marginTop: 16 }}
            disabled={busy || code.length < 6}
            onClick={() => run(() => confirmPhoneCode(sent.confirmation, code), 'Signed in with your phone')}
          >
            {busy ? 'Checking…' : 'Verify'}
          </button>
          <button
            type="button"
            className="link-quiet"
            onClick={() => {
              setSent(null);
              setCode('');
            }}
          >
            Use a different number
          </button>
        </>
      )}
      <div id="recaptcha-slot" />
    </div>
  );
}

export function AccountSheet({ spec, depth, isTop }: { spec: Extract<OpenSheet, { kind: 'account' }>; depth: number; isTop: boolean }) {
  const user = useStore((s) => s.user);
  const guest = Boolean(user?.isAnonymous);
  const status = useProviderStatus();
  const [method, setMethod] = useState<'email' | 'phone' | null>(spec.method ?? null);
  const [busy, setBusy] = useState<'google' | 'other' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const make =
    (which: 'google' | 'other'): Run =>
    async (fn, done) => {
      setBusy(which);
      setError(null);
      try {
        await fn();
        closeAllSheets();
        toast(done, { tone: 'paid' });
      } catch (e) {
        setError(friendlyAuthError(e));
      } finally {
        setBusy(null);
      }
    };

  const pick = (m: 'email' | 'phone') => {
    setError(null);
    setMethod((cur) => (cur === m ? null : m));
  };

  return (
    <Sheet id={spec.id} closing={spec.closing} depth={depth} isTop={isTop} title={guest ? 'Save your payments' : 'Sign in'}>
      <p className="field-help" style={{ marginTop: 0, marginBottom: 18 }}>
        {guest
          ? 'Keep everything you added and use it on any phone or laptop. Nothing you added is lost.'
          : 'Use the same account on your phone and your laptop.'}
      </p>
      <GoogleButton
        busy={busy === 'google'}
        label={guest ? 'Save with Google' : 'Continue with Google'}
        onClick={() => make('google')(signInWithGoogle, guest ? 'Saved to your Google account' : 'Signed in')}
      />
      <div className="or">or</div>
      <div className="alt-ways">
        <AltButton icon={<Mail size={16} />} pressed={method === 'email'} onClick={() => pick('email')}>
          Email
        </AltButton>
        {status.phone ? (
          <AltButton icon={<Smartphone size={16} />} pressed={method === 'phone'} onClick={() => pick('phone')}>
            Phone
          </AltButton>
        ) : null}
        {status.apple ? (
          <AltButton icon={<AppleLogo />} onClick={() => make('other')(signInWithApple, guest ? 'Saved to your Apple account' : 'Signed in')}>
            Apple
          </AltButton>
        ) : null}
      </div>
      {method === 'email' ? <EmailForm guest={guest} initial={spec.mode ?? (guest ? 'create' : 'signin')} run={make('other')} busy={busy === 'other'} setError={setError} /> : null}
      {method === 'phone' ? <PhoneForm run={make('other')} busy={busy === 'other'} setError={setError} /> : null}
      {error ? <div className="field-error" style={{ marginTop: 14 }}>{error}</div> : null}
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
