'use client';
import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { fmtPct, fmtPnl } from '@/lib/format';

export type Tone = 'neutral' | 'accent' | 'pos' | 'neg' | 'warn';

export function Badge({ tone = 'neutral', dot, live, children, title }: { tone?: Tone; dot?: boolean; live?: boolean; children: ReactNode; title?: string }) {
  return (
    <span className={`badge${tone === 'neutral' ? '' : ` badge-${tone}`}`} title={title}>
      {dot && <span className={`dot${live ? ' live' : ''}`} aria-hidden />}
      {children}
    </span>
  );
}

export function Stat({ label, value, sub, tone, title }: { label: ReactNode; value: ReactNode; sub?: ReactNode; tone?: 'pos' | 'neg'; title?: string }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className={`stat-value${tone ? ` ${tone}` : ''}`} title={title}>{typeof value === 'string' ? <Num>{value}</Num> : value}</div>
      {sub != null && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

export function Card({ title, actions, children, className = '', bodyClass = 'card-body' }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; bodyClass?: string }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <div className="card-head">
          {typeof title === 'string' ? <h2 className="h4">{title}</h2> : title}
          {actions}
        </div>
      )}
      <div className={bodyClass}>{children}</div>
    </section>
  );
}

/** Horizontally scrollable tab bar; never wraps. Arrow keys move between tabs. */
export function Tabs<T extends string>({ tabs, value, onChange, label }: { tabs: { id: T; label: ReactNode; count?: number }[]; value: T; onChange: (v: T) => void; label: string }) {
  const onKey = (e: React.KeyboardEvent, i: number) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
    onChange(next.id);
    const el = (e.currentTarget.parentElement?.children[tabs.indexOf(next)] as HTMLElement | undefined);
    el?.focus();
  };
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {tabs.map((t, i) => (
        <button key={t.id} type="button" role="tab" className="tab" aria-selected={value === t.id} tabIndex={value === t.id ? 0 : -1}
          onClick={() => onChange(t.id)} onKeyDown={(e) => onKey(e, i)}>
          {t.label}
          {t.count != null && <span className="count">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Skeleton({ w, h = 12, style, className = '' }: { w?: number | string; h?: number | string; style?: CSSProperties; className?: string }) {
  return <span className={`skel ${className}`} style={{ width: w ?? '100%', height: h, ...style }} aria-hidden />;
}

export function Spinner() {
  return <span className="spinner" aria-hidden />;
}

/** Signed P&L with "<0.01" for dust and the exact value in the tooltip. */
export function Pnl({ value, pct }: { value: bigint; pct?: number }) {
  const f = fmtPnl(value);
  return (
    <span className={f.dust ? undefined : value > 0n ? 'pos' : 'neg'} title={f.title}>
      <Num>{f.text}</Num>
      {pct != null && <small className="faint">{fmtPct(pct, true)}</small>}
    </span>
  );
}

/** Dropdown menu: button + popover, closes on outside click and Escape, focuses first item on open. */
export function Menu({ label, buttonClass = 'btn btn-sm', children }: { label: ReactNode; buttonClass?: string; children: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    (ref.current?.querySelector('[role="menuitem"]') as HTMLElement | null)?.focus();
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);
  return (
    <div className="menu" ref={ref}>
      <button className={buttonClass} aria-haspopup="menu" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>{label}</button>
      {open && <div className="menu-pop" role="menu" id={id}>{children(() => setOpen(false))}</div>}
    </div>
  );
}

export function ExternalIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M6 3H3.5A.5.5 0 0 0 3 3.5v9a.5.5 0 0 0 .5.5h9a.5.5 0 0 0 .5-.5V10M9 3h4v4M13 3 7.5 8.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function BrandMark() {
  return (
    <svg className="brand-mark" viewBox="0 0 26 14" aria-hidden>
      <rect width="26" height="14" rx="7" fill="#e9edff" />
      <rect x="2" y="2" width="13" height="10" rx="5" fill="#2b4bff" />
    </svg>
  );
}

/** Tabular figures with tightened separators (tabular "." and "," are digit-wide in Schibsted). */
export function Num({ children }: { children: string }) {
  const parts = children.split(/([.,])/);
  return <>{parts.map((p, i) => (p === '.' || p === ',' ? <span key={i} className="sep">{p}</span> : p))}</>;
}
