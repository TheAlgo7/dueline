import { useState } from 'react';
import { Repeat, Smartphone, User } from 'lucide-react';
import { friendlyAuthError, startGuest } from '../lib/auth';
import { openSheet } from '../lib/sheets';
import { toast } from '../lib/toast';
import { Mark } from '../ui/bits';

const DEMO = [
  { title: 'Jio Postpaid', meta: <><span className="accent">Due today</span> · jio.com</>, amount: '₹799', side: <span className="row-action">Pay</span>, tone: 'accent', Icon: Smartphone },
  { title: 'Claude', meta: <>Tomorrow · <span className="auto">AutoPay · HDFC ••4821</span></>, amount: '₹1,999', side: <span className="row-tag auto">Auto</span>, tone: 'auto', Icon: Repeat },
  { title: 'Parking', meta: <>Thu, 1 Oct · UPI to Rahul</>, amount: '₹1,500', side: <span className="row-action">Pay</span>, tone: 'accent', Icon: User },
] as const;

export function Welcome() {
  const [busy, setBusy] = useState(false);
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
        <p className="welcome-lede">
          Card bills, rent, subscriptions, the people you pay by UPI. See what needs you, what AutoPay already has covered, and get to the payment in one tap.
        </p>
        <div className="welcome-demo" aria-hidden>
          {DEMO.map((d, i) => (
            <div key={d.title} className="row" style={{ ['--i' as string]: i }}>
              <span className={`glyph ${d.tone}`}>
                <d.Icon size={19} strokeWidth={1.9} />
              </span>
              <div className="row-main">
                <div className="row-title">{d.title}</div>
                <div className="row-meta">{d.meta}</div>
              </div>
              <div className="row-side">
                <span className="row-amount num">{d.amount}</span>
                {d.side}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="welcome-actions">
        <button
          type="button"
          className="btn primary block"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await startGuest();
            } catch (e) {
              toast(friendlyAuthError(e), { tone: 'late' });
              setBusy(false);
            }
          }}
        >
          {busy ? 'Opening…' : 'Get started'}
        </button>
        <button type="button" className="btn ghost block" onClick={() => openSheet({ kind: 'account', mode: 'signin' })}>
          I have an account
        </button>
      </div>
      <p className="welcome-fine">No bank logins. No card numbers. Dueline never moves your money.</p>
    </main>
  );
}
