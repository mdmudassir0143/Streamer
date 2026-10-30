import type { ReactNode } from 'react';

export type Tone = 'neutral' | 'accent' | 'pos' | 'neg' | 'warn';

export function Badge({ tone = 'neutral', dot, live, children, title }: { tone?: Tone; dot?: boolean; live?: boolean; children: ReactNode; title?: string }) {
  return (
    <span className={`badge${tone === 'neutral' ? '' : ` badge-${tone}`}`} title={title}>
      {dot && <span className={`dot${live ? ' live' : ''}`} />}
      {children}
    </span>
  );
}

export function Stat({ label, value, sub, tone }: { label: ReactNode; value: ReactNode; sub?: ReactNode; tone?: 'pos' | 'neg' }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className={`stat-value${tone ? ` ${tone}` : ''}`}>{typeof value === 'string' ? <Num>{value}</Num> : value}</div>
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

export function Tabs<T extends string>({ tabs, value, onChange, label }: { tabs: { id: T; label: ReactNode; count?: number }[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {tabs.map((t) => (
        <button key={t.id} type="button" role="tab" className="tab" aria-selected={value === t.id} onClick={() => onChange(t.id)}>
          {t.label}
          {t.count != null && <span className="count">{t.count}</span>}
        </button>
      ))}
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
