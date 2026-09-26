import { useState } from 'react';
import { Mail, Smartphone } from 'lucide-react';
import { friendlyAuthError, signInWithApple, signInWithGoogle, startGuest } from '../lib/auth';
import { openSheet } from '../lib/sheets';
import { toast } from '../lib/toast';
import { Mark } from '../ui/bits';
import { AltButton, AppleLogo, GoogleButton, useProviderStatus } from '../ui/SignIn';

/**
 * The front door. Deliberately no sample payments on it: a list of bills on
 * a sign-in screen reads as someone's real dues (it scared a family member
 * who picked up the phone). Name, one sentence, Google, then the quiet rest.
 */
export function Welcome() {
  const [busy, setBusy] = useState<'google' | 'guest' | null>(null);
  const status = useProviderStatus();

  const run = async (which: 'google' | 'guest', fn: () => Promise<void>) => {
    setBusy(which);
    try {
      await fn();
    } catch (e) {
      toast(friendlyAuthError(e), { tone: 'late' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <main className="welcome">
      <div className="wordmark">
        <Mark size={30} />
        Dueline
      </div>
      <div className="welcome-body">
        <h1>
          Everything you need to pay, <em>on one line.</em>
        </h1>
        <p className="welcome-lede">Bills, cards, subscriptions and the people you pay by UPI. Dueline tells you what needs you, and when.</p>
      </div>
      <div className="welcome-actions">
        <GoogleButton busy={busy === 'google'} onClick={() => run('google', signInWithGoogle)} />
        <div className="alt-ways" aria-label="Other ways to sign in">
          <AltButton icon={<Mail size={16} />} onClick={() => openSheet({ kind: 'account', mode: 'signin', method: 'email' })}>
            Email
          </AltButton>
          {status.phone ? (
            <AltButton icon={<Smartphone size={16} />} onClick={() => openSheet({ kind: 'account', method: 'phone' })}>
              Phone
            </AltButton>
          ) : null}
          {status.apple ? (
            <AltButton icon={<AppleLogo />} onClick={() => run('google', signInWithApple)}>
              Apple
            </AltButton>
          ) : null}
        </div>
        <button type="button" className="link-quiet" disabled={busy !== null} onClick={() => run('guest', startGuest)}>
          {busy === 'guest' ? 'Opening…' : 'Try it without an account'}
        </button>
      </div>
      <p className="welcome-fine">No bank logins. No card numbers. Dueline never moves your money.</p>
    </main>
  );
}
