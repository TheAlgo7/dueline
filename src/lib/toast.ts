import { useSyncExternalStore } from 'react';

export interface Toast {
  id: number;
  text: string;
  tone?: 'default' | 'paid' | 'late';
  action?: { label: string; run: () => void };
  ms: number;
}

let current: Toast | null = null;
let seq = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export function toast(text: string, opts: { tone?: Toast['tone']; action?: Toast['action']; ms?: number } = {}) {
  clearTimeout(timer);
  const t: Toast = { id: ++seq, text, tone: opts.tone, action: opts.action, ms: opts.ms ?? (opts.action ? 5200 : 3200) };
  current = t;
  emit();
  timer = setTimeout(() => dismissToast(t.id), t.ms);
}

export function dismissToast(id?: number) {
  if (!current || (id != null && current.id !== id)) return;
  current = null;
  emit();
}

export function useToast(): Toast | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
    () => current,
  );
}
