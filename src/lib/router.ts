/**
 * Four tabs and a handful of deep links don't need a router library.
 * Paths are the tabs; `?open=<cycle>&do=<action>` and `?add=1` come from
 * notifications and the home-screen shortcut and are consumed once.
 */

import { useSyncExternalStore } from 'react';

export type Tab = 'due' | 'calendar' | 'payees' | 'you';

const PATHS: Record<Tab, string> = { due: '/', calendar: '/calendar', payees: '/payees', you: '/you' };

export function tabFromPath(path: string): Tab {
  if (path.startsWith('/calendar')) return 'calendar';
  if (path.startsWith('/payees')) return 'payees';
  if (path.startsWith('/you')) return 'you';
  return 'due';
}

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
window.addEventListener('popstate', emit);

export function useLocation(): string {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => location.pathname + location.search,
    () => '/',
  );
}

export function go(tab: Tab) {
  const path = PATHS[tab];
  if (location.pathname === path && !location.search) return;
  history.pushState(null, '', path);
  emit();
}

/** Navigate to any in-app URL (used by notification clicks). */
export function goUrl(url: string) {
  const u = new URL(url, location.origin);
  history.pushState(null, '', u.pathname + u.search);
  emit();
}

/** Drops the query string once its deep link has been handled. */
export function clearQuery() {
  if (!location.search) return;
  history.replaceState(null, '', location.pathname);
  emit();
}
