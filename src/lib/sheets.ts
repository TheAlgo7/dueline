/**
 * Bottom sheets as a stack. Each open sheet also pushes a history entry, so
 * Android's back gesture closes the sheet instead of leaving the app.
 */

import { useSyncExternalStore } from 'react';
import type { Category } from '../core/types';

export type SheetSpec =
  | { kind: 'add'; category?: Category; payeeId?: string; due?: string }
  | { kind: 'edit'; obligationId: string }
  | { kind: 'item'; key: string; action?: 'pay' | 'paid' }
  | { kind: 'pay'; key?: string; payeeId?: string }
  | { kind: 'paid'; key: string; amount?: number | null; via?: string }
  | { kind: 'payee'; id?: string }
  | { kind: 'search' }
  | { kind: 'history' }
  | { kind: 'account'; mode?: 'signin' | 'create'; method?: 'email' | 'phone' }
  | { kind: 'delete' }
  | { kind: 'install' };

export type OpenSheet = SheetSpec & { id: string; closing?: boolean };

let stack: OpenSheet[] = [];
let seq = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function setStack(next: OpenSheet[]) {
  stack = next;
  document.documentElement.style.overflow = stack.length ? 'hidden' : '';
  emit();
}

export function useSheets(): OpenSheet[] {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => stack,
    () => stack,
  );
}

export function openSheet(spec: SheetSpec): string {
  const id = `s${++seq}`;
  history.pushState({ ...(history.state ?? {}), dl: id }, '', location.href);
  setStack([...stack.filter((s) => !s.closing), { ...spec, id }]);
  return id;
}

const CLOSE_MS = 230;

/** Animate a sheet out, then drop it. */
export function closeSheet(id?: string, fromHistory = false) {
  const target = id ? stack.find((s) => s.id === id) : [...stack].reverse().find((s) => !s.closing);
  if (!target || target.closing) return;
  setStack(stack.map((s) => (s.id === target.id ? { ...s, closing: true } : s)));
  setTimeout(() => {
    setStack(stack.filter((s) => s.id !== target.id));
    if (!fromHistory && history.state?.dl === target.id) history.back();
  }, CLOSE_MS);
}

/** Swap the top sheet for another without the close/open dance. */
export function replaceSheet(spec: SheetSpec) {
  const top = [...stack].reverse().find((s) => !s.closing);
  if (!top) {
    openSheet(spec);
    return;
  }
  setStack(stack.map((s) => (s.id === top.id ? { ...spec, id: top.id } : s)));
}

export function closeAllSheets() {
  const open = stack.filter((s) => !s.closing);
  if (!open.length) return;
  setStack(stack.map((s) => ({ ...s, closing: true })));
  setTimeout(() => {
    setStack([]);
    if (history.state?.dl) history.go(-open.length);
  }, CLOSE_MS);
}

window.addEventListener('popstate', () => {
  const top = [...stack].reverse().find((s) => !s.closing);
  if (top && history.state?.dl !== top.id) closeSheet(top.id, true);
});
