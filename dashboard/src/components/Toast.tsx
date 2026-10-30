'use client';
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

type Kind = 'ok' | 'err' | 'info';
interface Toast { id: number; kind: Kind; title: ReactNode; msg?: ReactNode }
type Push = (kind: Kind, title: ReactNode, msg?: ReactNode) => void;
const Ctx = createContext<Push>(() => {});

const ICON: Record<Kind, ReactNode> = {
  ok: <path d="M4.5 8.5 7 11l4.5-6" />,
  err: <path d="M8 4.5v4.2M8 11.2v.3" />,
  info: <path d="M8 4.5v.3M8 7v4.5" />,
};

/** One toast style: white surface, hairline, a status glyph (pos / neg / accent), title + optional detail. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const dismiss = (id: number) => setToasts((t) => t.filter((x) => x.id !== id));
  const push = useCallback<Push>((kind, title, msg) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-2), { id, kind, title, msg }]);
    setTimeout(() => dismiss(id), kind === 'err' ? 10000 : 6000);
  }, []);
  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind}`}>
            <svg className="toast-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <circle cx="8" cy="8" r="7" strokeWidth="1.4" />
              {ICON[t.kind]}
            </svg>
            <div className="toast-body">
              <div className="toast-title">{t.title}</div>
              {t.msg && <div className="toast-msg">{t.msg}</div>}
            </div>
            <button className="toast-x" onClick={() => dismiss(t.id)} aria-label="Dismiss">×</button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
export const useToast = () => useContext(Ctx);
