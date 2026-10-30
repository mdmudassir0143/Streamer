'use client';
import { usePrices } from '@/lib/agentApi';
import { timeAgo } from '@/lib/format';
import { Num } from './ui';

const fmt = (n?: number) => (n == null ? '—' : n >= 100 ? n.toLocaleString('en-US', { maximumFractionDigits: 0 }) : n.toLocaleString('en-US', { maximumFractionDigits: 4 }));

export function PricePanel() {
  const { data, isLoading, isError } = usePrices();
  if (isLoading) return <p className="muted" style={{ margin: 0 }}>Loading prices…</p>;
  if (isError || !data) return <p className="muted" style={{ margin: 0 }}>Prices come from the agent API, which is offline.</p>;
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
      <p className="small faint" style={{ margin: '10px 0 0' }}>CEX: Coinbase and Gate. Venue: on-chain quote. Updated {timeAgo(data.ts)}.</p>
    </div>
  );
}
