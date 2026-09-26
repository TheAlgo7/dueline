import { createContext, useContext, useEffect, useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { closeSheet } from '../lib/sheets';

interface SheetCtx {
  id: string;
  close: () => void;
}

const Ctx = createContext<SheetCtx>({ id: '', close: () => undefined });
export const useSheet = () => useContext(Ctx);

export interface SheetProps {
  id: string;
  closing?: boolean;
  depth: number;
  isTop: boolean;
  title?: ReactNode;
  label?: string;
  headerRight?: ReactNode;
  footer?: ReactNode;
  plainFooter?: boolean;
  children: ReactNode;
}

/**
 * A bottom sheet. Focus goes to the sheet itself, never to its first input:
 * a keyboard jumping up on every open is worse than one extra tap, and a
 * focused control paints a ring that reads as a stuck selection.
 * Drag the grip or header down to dismiss.
 */
export function Sheet({ id, closing, depth, isTop, title, label, headerRight, footer, plainFooter, children }: SheetProps) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y: number; t: number; dy: number } | null>(null);
  const close = () => closeSheet(id);

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    if (!ref.current?.contains(document.activeElement)) ref.current?.focus({ preventScroll: true });
    return () => prev?.focus?.({ preventScroll: true });
  }, []);

  useEffect(() => {
    if (!isTop) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeSheet(id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isTop, id]);

  const onDown = (e: ReactPointerEvent) => {
    if ((e.target as HTMLElement).closest('button, a, input, select, textarea')) return;
    drag.current = { y: e.clientY, t: performance.now(), dy: 0 };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    if (ref.current) ref.current.style.transition = 'none';
  };
  const onMove = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (!d || !ref.current) return;
    d.dy = Math.max(0, e.clientY - d.y);
    ref.current.style.transform = `translateY(${d.dy}px)`;
  };
  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    const el = ref.current;
    if (!d || !el) return;
    const speed = d.dy / Math.max(1, performance.now() - d.t);
    if (d.dy > 110 || (d.dy > 30 && speed > 0.6)) {
      close();
      return;
    }
    el.style.transition = 'transform 280ms cubic-bezier(0.22, 1, 0.36, 1)';
    el.style.transform = '';
  };
  const handlers = { onPointerDown: onDown, onPointerMove: onMove, onPointerUp: onUp, onPointerCancel: onUp };

  return createPortal(
    <Ctx.Provider value={{ id, close }}>
      <div className={`sheet-layer${closing ? ' closing' : ''}`} style={{ zIndex: 60 + depth }}>
        <div
          className="sheet-backdrop"
          onClick={close}
          style={depth > 0 ? { background: 'oklch(0 0 0 / 0.4)' } : undefined}
        />
        <div
          ref={ref}
          className="sheet"
          role="dialog"
          aria-modal="true"
          aria-label={label ?? (typeof title === 'string' ? title : undefined)}
          tabIndex={-1}
        >
          <div className="sheet-grip" {...handlers}>
            <span />
          </div>
          <div className={`sheet-head${title ? '' : ' bare'}`} {...handlers}>
            {title ? <h2 className="sheet-title">{title}</h2> : <span />}
            <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              {headerRight}
              <button type="button" className="icon-btn" aria-label="Close" onClick={close}>
                <X size={20} strokeWidth={2} />
              </button>
            </div>
          </div>
          <div className="sheet-body">{children}</div>
          {footer ? <div className={`sheet-foot${plainFooter ? ' plain' : ''}`}>{footer}</div> : null}
        </div>
      </div>
    </Ctx.Provider>,
    document.body,
  );
}
