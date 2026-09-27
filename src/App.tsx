import { useEffect, useMemo } from 'react';
import { confirmAutopay } from './lib/actions';
import { syncDevice } from './lib/push';
import { clearQuery, goUrl, tabFromPath, useLocation } from './lib/router';
import { itemFor, useDueItems } from './lib/select';
import { closeAllSheets, openSheet } from './lib/sheets';
import { useStore } from './lib/store';
import { toast } from './lib/toast';
import { Calendar } from './screens/Calendar';
import { Due } from './screens/Due';
import { Payees } from './screens/Payees';
import { Welcome } from './screens/Welcome';
import { You } from './screens/You';
import { SheetHost } from './sheets/SheetHost';
import { Dock } from './ui/Dock';
import { ToastHost } from './ui/ToastHost';
import { Loading } from './ui/Loading';

/**
 * Deep links come from notifications (`?open=<cycle>&do=pay|paid|autopaid|failed`)
 * and the home-screen shortcut (`?add=1`). Each is handled once, after the
 * data has loaded, then dropped from the URL.
 */
function useDeepLinks(loc: string) {
  const user = useStore((s) => s.user);
  const loaded = useStore((s) => s.loaded);
  useEffect(() => {
    if (!user || !loaded || !location.search) return;
    const q = new URLSearchParams(location.search);
    const open = q.get('open');
    const act = q.get('do');
    if (q.get('add')) {
      clearQuery();
      openSheet({ kind: 'add' });
      return;
    }
    if (!open) return;
    clearQuery();
    closeAllSheets();
    const item = itemFor(open);
    if (!item) {
      toast('That payment isn\'t here anymore');
      return;
    }
    setTimeout(() => {
      if (act === 'autopaid' || act === 'failed') {
        if (item.state === 'confirm' || item.state === 'auto' || item.assumed) {
          confirmAutopay(item, act === 'autopaid');
          toast(act === 'autopaid' ? `${item.ob.title} marked as paid` : `${item.ob.title} now needs you`, { tone: act === 'autopaid' ? 'paid' : 'late' });
        }
        openSheet({ kind: 'item', key: open });
      } else if ((act === 'pay' || act === 'paid') && (item.state === 'paid' || item.state === 'autopaid' || item.state === 'skipped')) {
        toast(item.state === 'skipped' ? `${item.ob.title} was skipped` : `${item.ob.title} is already paid`);
        openSheet({ kind: 'item', key: open });
      } else if (act === 'pay') openSheet({ kind: 'pay', key: open });
      else if (act === 'paid') openSheet({ kind: 'paid', key: open });
      else openSheet({ kind: 'item', key: open });
    }, 280);
  }, [user, loaded, loc]);
}

function Signed() {
  const loc = useLocation();
  const tab = tabFromPath(loc.split('?')[0]);
  const items = useDueItems();
  const badge = useMemo(() => items.some((i) => i.state === 'overdue' || i.state === 'today' || i.state === 'confirm'), [items]);
  useDeepLinks(loc);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [tab]);

  useEffect(() => {
    document.title = badge ? 'Dueline · something needs you' : 'Dueline';
    const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
    const n = items.filter((i) => i.state === 'overdue' || i.state === 'today').length;
    if (n) nav.setAppBadge?.(n).catch(() => undefined);
    else nav.clearAppBadge?.().catch(() => undefined);
  }, [badge, items]);

  return (
    <div className="app">
      <main key={tab}>
        {tab === 'due' ? <Due /> : tab === 'calendar' ? <Calendar /> : tab === 'payees' ? <Payees /> : <You />}
      </main>
      <Dock tab={tab} badge={badge} />
    </div>
  );
}

export function App() {
  const authReady = useStore((s) => s.authReady);
  const user = useStore((s) => s.user);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type === 'navigate' && typeof e.data.url === 'string') goUrl(e.data.url);
    };
    navigator.serviceWorker?.addEventListener('message', onMessage);
    return () => navigator.serviceWorker?.removeEventListener('message', onMessage);
  }, []);

  useEffect(() => {
    if (user) syncDevice().catch(() => undefined);
  }, [user]);

  if (!authReady) return <Loading />;

  return (
    <>
      {user ? <Signed /> : <Welcome />}
      <SheetHost signedIn={Boolean(user)} />
      <ToastHost />
    </>
  );
}
