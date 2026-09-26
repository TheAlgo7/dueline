import { useEffect, useMemo, useState } from 'react';
import { Copy, ExternalLink, QrCode } from 'lucide-react';
import { renderSVG } from 'uqr';
import { monthName, parts } from '../core/dates';
import { inr, inrDigits, parseRupees } from '../core/money';
import { hostOf, isVpa, normalizeVpa, safeUrl, upiLink } from '../core/upi';
import { recordOneOff, saveObligation, savePayee } from '../lib/actions';
import { useItem } from '../lib/select';
import { closeAllSheets, replaceSheet, type OpenSheet } from '../lib/sheets';
import { useStore } from '../lib/store';
import { toast } from '../lib/toast';
import { Field, MoneyInput, moneyText } from '../ui/controls';
import { Sheet } from '../ui/Sheet';

const MOBILE = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

async function copy(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast(`${what} copied`);
  } catch {
    toast(`Couldn't copy. ${text}`);
  }
}

/**
 * The handoff. Dueline opens the right place to pay (a UPI app with the
 * amount filled in, the biller's site, a QR on a laptop) and then asks, when
 * you come back, whether it went through. It never assumes it did.
 */
export function PaySheet({ spec, depth, isTop }: { spec: Extract<OpenSheet, { kind: 'pay' }>; depth: number; isTop: boolean }) {
  const item = useItem(spec.key);
  const payees = useStore((s) => s.payees);
  const ob = item?.ob;
  const payee = payees.find((p) => p.id === (spec.payeeId ?? ob?.payeeId));
  const route = ob ? ob.method : 'upi';

  const [vpaText, setVpaText] = useState('');
  const savedVpa = ob?.upi || payee?.upi || '';
  const vpa = savedVpa || (isVpa(vpaText) ? normalizeVpa(vpaText) : '');
  const name = ob?.payTo || payee?.name || ob?.title || '';
  const [amountText, setAmountText] = useState(moneyText(item?.amount ?? null));
  const amount = parseRupees(amountText);
  const [launched, setLaunched] = useState(false);
  const [back, setBack] = useState(false);
  const [showQr, setShowQr] = useState(!MOBILE);

  useEffect(() => {
    if (!launched) return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') setBack(true);
    };
    document.addEventListener('visibilitychange', onVisible);
    // Desktop tabs and QR scans never hide the page; ask after a moment anyway.
    const timer = setTimeout(() => setBack(true), MOBILE ? 12000 : 2500);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      clearTimeout(timer);
    };
  }, [launched]);

  const note = ob ? `${ob.title} ${monthName(parts(item!.due).m)}`.slice(0, 50) : 'Via Dueline';
  const link = vpa ? upiLink({ vpa, name, amount, note }) : null;
  const qr = useMemo(() => (link ? renderSVG(link, { ecc: 'M', border: 1, whiteColor: '#f6f3ec', blackColor: '#141210' }) : ''), [link]);
  const web = safeUrl(ob?.url);

  if (spec.key && !item) {
    return (
      <Sheet id={spec.id} closing={spec.closing} depth={depth} isTop={isTop} title="Pay">
        <p className="muted">This payment isn't here anymore.</p>
      </Sheet>
    );
  }

  const markPaid = () => {
    if (item) {
      replaceSheet({ kind: 'paid', key: item.key, amount, via: route === 'upi' ? 'UPI' : route === 'cash' ? 'Cash' : route === 'card' ? 'Card' : route === 'bank' ? 'Bank' : 'Online' });
    } else if (payee) {
      recordOneOff({ title: payee.name, payeeId: payee.id, upi: payee.upi, amount });
      closeAllSheets();
      toast(`Recorded ${amount != null ? inr(amount) : 'a payment'} to ${payee.name}`, { tone: 'paid' });
    }
  };

  const saveVpa = () => {
    if (!isVpa(vpaText)) {
      toast('A UPI ID looks like name@bank');
      return;
    }
    const v = normalizeVpa(vpaText);
    if (ob) {
      const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = ob;
      let payeeId = ob.payeeId ?? null;
      if (!payeeId) payeeId = savePayee({ name: ob.payTo || ob.title, upi: v });
      saveObligation({ ...rest, upi: v, payeeId }, ob);
    } else if (payee) {
      const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = payee;
      savePayee({ ...rest, upi: v }, payee);
    }
    toast('UPI ID saved');
  };

  const title = item ? `Pay ${item.ob.title}` : `Pay ${payee?.name ?? ''}`;
  const whoLine = route === 'upi' ? `To ${name}` : ob?.handling === 'auto' ? 'Usually on AutoPay' : route === 'cash' ? 'In cash' : route === 'card' ? ob?.account || 'By card' : route === 'bank' ? ob?.account || 'By bank transfer' : hostOf(web) || 'Online';

  return (
    <Sheet id={spec.id} closing={spec.closing} depth={depth} isTop={isTop} title={title}>
      <div className="pay-to">
        <div className="who">{whoLine}</div>
        <div className="amount num">
          {amount != null ? (
            <>
              <span className="rupee">₹</span>
              {inrDigits(amount)}
            </>
          ) : (
            <span style={{ fontSize: 26, color: 'var(--ink-3)' }}>Any amount</span>
          )}
        </div>
        {route === 'upi' && vpa ? <div className="vpa">{vpa}</div> : null}
      </div>

      {item?.estimate || !item || item.amount == null ? (
        <Field label={item?.estimate ? 'This bill (the usual amount is filled in)' : 'Amount'}>
          <MoneyInput text={amountText} onText={(t) => setAmountText(t)} />
        </Field>
      ) : null}

      {route === 'upi' ? (
        vpa ? (
          <>
            {showQr && qr ? (
              <>
                <div className="qr" dangerouslySetInnerHTML={{ __html: qr }} aria-label="UPI QR code" role="img" />
                <p className="field-help" style={{ textAlign: 'center' }}>
                  Scan with any UPI app{amount != null ? '. The amount is filled in.' : '.'}
                </p>
              </>
            ) : null}
            <div className="pay-steps">
              {MOBILE && link ? (
                <a className="btn primary block" href={link} onClick={() => setLaunched(true)}>
                  Open UPI app
                </a>
              ) : null}
              <div className="btn-row">
                <button type="button" className="btn secondary" onClick={() => copy(vpa, 'UPI ID')}>
                  <Copy size={17} /> UPI ID
                </button>
                {MOBILE ? (
                  <button type="button" className="btn secondary" onClick={() => setShowQr((v) => !v)}>
                    <QrCode size={17} /> {showQr ? 'Hide QR' : 'QR code'}
                  </button>
                ) : amount != null ? (
                  <button type="button" className="btn secondary" onClick={() => copy((amount / 100).toFixed(2).replace(/\.00$/, ''), 'Amount')}>
                    <Copy size={17} /> Amount
                  </button>
                ) : null}
              </div>
              {!MOBILE ? (
                <button type="button" className="btn ghost block" onClick={() => setLaunched(true)}>
                  I've scanned it
                </button>
              ) : null}
            </div>
          </>
        ) : (
          <>
            <Field label="Their UPI ID" help="Save it once and Pay fills everything in from then on.">
              <input className="input" placeholder="name@bank" value={vpaText} inputMode="email" autoCapitalize="off" spellCheck={false} onChange={(e) => setVpaText(e.target.value)} />
            </Field>
            <div className="pay-steps">
              <button type="button" className="btn primary block" onClick={saveVpa} disabled={!isVpa(vpaText)}>
                Save UPI ID
              </button>
            </div>
          </>
        )
      ) : route === 'cash' ? (
        <p className="detail-status" style={{ textAlign: 'center', marginTop: 16 }}>
          Hand it over, then mark it paid.
        </p>
      ) : web ? (
        <div className="pay-steps">
          <a className="btn primary block" href={web} target="_blank" rel="noopener noreferrer" onClick={() => setLaunched(true)}>
            Open {hostOf(web)} <ExternalLink size={17} />
          </a>
        </div>
      ) : (
        <p className="detail-status" style={{ textAlign: 'center', marginTop: 16 }}>
          {route === 'card'
            ? 'Pay it from your bank or card app, then mark it paid here.'
            : route === 'bank'
              ? 'Transfer it from your bank app, then mark it paid here.'
              : 'Add a payment link in Edit and Pay will open it next time.'}
        </p>
      )}

      {back ? (
        <div className="returned">
          <p>Did the payment go through?</p>
          <div className="btn-row">
            <button type="button" className="btn secondary" onClick={() => { setBack(false); setLaunched(false); }}>
              Not yet
            </button>
            <button type="button" className="btn paid" onClick={markPaid}>
              Yes, mark paid
            </button>
          </div>
        </div>
      ) : (
        <div className="pay-steps" style={{ marginTop: 14 }}>
          <button type="button" className={`btn ${route === 'cash' ? 'primary' : 'ghost'} block`} onClick={markPaid}>
            {item ? (route === 'cash' ? 'Mark paid in cash' : 'Already paid? Mark it paid') : 'Record this payment'}
          </button>
        </div>
      )}

      <p className="field-help" style={{ textAlign: 'center', marginTop: 18 }}>
        Dueline hands you to your own app to pay. It never sees your PIN or card.
      </p>
    </Sheet>
  );
}
