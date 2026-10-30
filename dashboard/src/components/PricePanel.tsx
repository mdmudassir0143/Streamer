'use client';
import { usePrices } from '@/lib/agentApi';
import { timeAgo } from '@/lib/format';
import { Num, Skeleton } from './ui';

const fmt = (n?: number) => (n == null ? '—' : n >= 100 ? n.toLocaleString('en-US', { maximumFractionDigits: 0 }) : n.toLocaleString('en-US', { maximumFractionDigits: 4 }));

export function PricePanel() {
  const { data, isLoading, isError } = usePrices();
  if (isLoading) return <div className="stack-2" aria-busy="true">{[0, 1, 2, 3].map((i) => <div key={i} className="spread" style={{ height: 44 }}><Skeleton w={50} /><Skeleton w={160} /></div>)}</div>;
  if (isError || !data) return <p className="muted">Prices come from the agent, which is offline right now.</p>;
  return (
    <div>
      <div className="price-row head"><span>Asset</span><span>CEX</span><span>Venue</span><span>Gap</span></div>
      {Object.keys(data.prices ?? {}).map((k) => {
        const c = data.prices[k], v = data.venue?.[k];
        const gap = c && v ? ((v - c) / c) * 10000 : null;
        return (
          <div className="price-row" key={k}>
            <span>{k}</span><span className="num">$<Num>{fmt(c)}</Num></span><span className="num">$<Num>{fmt(v)}</Num></span>
            <span className={`num ${gap != null && Math.abs(gap) > 50 ? "strong" : "faint"}`}>{gap == null ? '—' : `${gap.toFixed(0)} bps`}</span>
          </div>
        );
      })}
      <p className="small faint" style={{ marginTop: 'var(--s-3)' }}>CEX: Coinbase and Gate. Venue: on-chain quote. Updated {timeAgo(data.ts)}.</p>
    </div>
  );
}
