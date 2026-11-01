'use client';
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Check, Info, Loader2, Wallet, X } from 'lucide-react';

type Kind = 'ok' | 'err' | 'info' | 'pending' | 'wallet';
/** Transaction progress: 1 sign in wallet, 2 confirming on-chain, 3 done. */
export type TxStep = 1 | 2 | 3;
export interface ToastData { kind: Kind; title: ReactNode; msg?: ReactNode; step?: TxStep }
interface Toast extends ToastData { id: number; ttl?: number }
type Push = (kind: Kind, title: ReactNode, msg?: ReactNode) => number;
interface Controls { push: (t: ToastData) => number; update: (id: number, t: Partial<ToastData>) => void; dismiss: (id: number) => void }

const PushCtx = createContext<Push>(() => 0);
const ControlsCtx = createContext<Controls>({ push: () => 0, update: () => {}, dismiss: () => {} });

const TTL: Partial<Record<Kind, number>> = { ok: 6000, info: 5000, wallet: 4000, err: 10000 }; // pending stays until updated
const ICON: Record<Kind, ReactNode> = {
  ok: <Check size={16} strokeWidth={2.6} />,
  err: <X size={16} strokeWidth={2.6} />,
  info: <Info size={16} strokeWidth={2.2} />,
  pending: <Loader2 size={16} strokeWidth={2.4} className="toast-spin" />,
  wallet: <Wallet size={16} strokeWidth={2} />,
};
const STEPS = ['Sign', 'Confirming', 'Confirmed'];

/** Bottom-right activity popups. Transaction toasts update in place as they move from wallet to chain to done. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const reduce = useReducedMotion();

  const dismiss = useCallback((id: number) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);
  const schedule = useCallback((id: number, kind: Kind) => {
    clearTimeout(timers.current.get(id));
    const ttl = TTL[kind];
    if (ttl) timers.current.set(id, setTimeout(() => dismiss(id), ttl));
    return ttl;
  }, [dismiss]);

  const controls = useMemo<Controls>(() => ({
    push: (t) => {
      const id = Date.now() + Math.random();
      const ttl = schedule(id, t.kind);
      setToasts((all) => [...all.slice(-3), { ...t, id, ttl }]);
      return id;
    },
    update: (id, patch) => {
      setToasts((all) => all.map((x) => {
        if (x.id !== id) return x;
        const kind = patch.kind ?? x.kind;
        return { ...x, ...patch, ttl: kind !== x.kind ? schedule(id, kind) : x.ttl };
      }));
    },
    dismiss,
  }), [dismiss, schedule]);
  const push = useCallback<Push>((kind, title, msg) => controls.push({ kind, title, msg }), [controls]);

  return (
    <ControlsCtx.Provider value={controls}>
      <PushCtx.Provider value={push}>
        {children}
        <div className="toasts" role="status" aria-live="polite">
          <AnimatePresence initial={false}>
            {toasts.map((t) => (
              <motion.div key={t.id} layout={!reduce} className={`toast toast-${t.kind}`}
                initial={reduce ? { opacity: 0 } : { opacity: 0, x: 40, scale: 0.96 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, x: 40, scale: 0.96, transition: { duration: 0.18 } }}
                transition={{ type: 'spring', stiffness: 420, damping: 34 }}>
                <span className="toast-icon">{ICON[t.kind]}</span>
                <div className="toast-body">
                  <div className="toast-title">{t.title}</div>
                  {t.msg && <div className="toast-msg">{t.msg}</div>}
                  {t.step && (
                    <ol className="toast-steps" aria-label={`Step ${t.step} of 3`}>
                      {STEPS.map((s, i) => (
                        <li key={s} className={i + 1 < t.step! || (t.kind === 'ok' && i + 1 === t.step) ? 'done' : i + 1 === t.step ? (t.kind === 'err' ? 'failed' : 'active') : ''}>{s}</li>
                      ))}
                    </ol>
                  )}
                </div>
                <button className="toast-x" onClick={() => dismiss(t.id)} aria-label="Dismiss"><X size={14} strokeWidth={2.2} /></button>
                {t.ttl && <span key={`${t.kind}-${t.ttl}`} className="toast-timer" style={{ animationDuration: `${t.ttl}ms` }} aria-hidden />}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </PushCtx.Provider>
    </ControlsCtx.Provider>
  );
}

/** Simple one-shot toast: toast('ok' | 'err' | 'info', title, msg?). */
export const useToast = () => useContext(PushCtx);
/** Push, update in place, dismiss: for multi-step activity like transactions. */
export const useToastControls = () => useContext(ControlsCtx);
