'use client';
import Link from 'next/link';
import { useAgentStream } from '@/lib/agentApi';
import { symbolOf } from '@/lib/deployments';
import { fmtPnl, fmtUsdt, ratePerHour, toBaseUnits } from '@/lib/format';
import { useLiveMeter, useStream } from '@/lib/stream';
import { StreamMeter } from './StreamMeter';
import { ModeChip, StatusChip } from './StatusChip';
import { Stat } from './ui';

export function usePnl(id: bigint, data: ReturnType<typeof useStream>) {
  const agent = useAgentStream(id.toString());
  const { stream, equity, withdrawn } = data;
  const apiPnl = toBaseUnits(agent.data?.pnlBase);
  const chainPnl = stream ? equity + withdrawn - stream.totalStreamed : 0n;
  const pnl = apiPnl ?? chainPnl;
  const basis = stream?.totalStreamed ?? 0n;
  const pct = agent.data?.pnlPct ?? (basis > 0n ? (Number(pnl) / Number(basis)) * 100 : 0);
  return { pnl, pct, source: apiPnl != null ? 'agent' : 'chain', agent: agent.data };
}

export const pnlStr = (pnl: bigint) => `${pnl >= 0n ? '+' : ''}${fmtPnl(pnl)}`;

export function StreamCard({ id }: { id: bigint }) {
  const data = useStream(id);
  const live = useLiveMeter(data);
  const { pnl, pct } = usePnl(id, data);
  const s = data.stream;
  if (!s || !live) {
    return <div className="card stream-card"><span className="h4">Stream #{id.toString()}</span><span className="muted">Reading from chain…</span></div>;
  }
  return (
    <Link href={`/app/stream/${id.toString()}`} className="card stream-card">
      <div className="spread">
        <div className="row">
          <span className="h4">Stream #{id.toString()}</span>
          <ModeChip mode={s.mode} target={symbolOf(s.targetToken)} />
        </div>
        <StatusChip status={live.status} />
      </div>
      <StreamMeter variant="thin" meter={live.meter} ratePerSec={s.ratePerSec} flowing={live.status === 'live'} label="Worst-case loss" />
      <div className="stream-card-stats">
        <Stat label="Rate" value={`${ratePerHour(s.ratePerSec)}/h`} />
        <Stat label="Equity" value={fmtUsdt(data.equity)} />
        <Stat label="P&L" value={pnlStr(pnl)} sub={`${pct.toFixed(2)}%`} tone={pnl > 0n ? 'pos' : pnl < 0n ? 'neg' : undefined} />
      </div>
    </Link>
  );
}
