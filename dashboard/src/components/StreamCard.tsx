'use client';
import Link from 'next/link';
import { useAgentStream } from '@/lib/agentApi';
import { symbolOf } from '@/lib/deployments';
import { fmtUsdt, toBaseUnits } from '@/lib/format';
import { useLiveMeter, useStream, type Status, type StreamView } from '@/lib/stream';
import { StreamMeter } from './StreamMeter';
import { ModeChip, StatusChip } from './StatusChip';
import { Pnl, Skeleton, Stat } from './ui';

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

/** Plain-language reason for a stream that isn't flowing normally. */
export function statusReason(status: Status, s: StreamView): { text: string; tone?: 'neg' } | null {
  if (status === 'halted') return { text: `Halted: equity fell more than ${s.risk.maxDrawdownBps / 100}% below its high. Resume to reset the breaker.`, tone: 'neg' };
  if (status === 'starved') return { text: 'Starved: the vault can’t pull more because your allowance or USDT balance is empty.' };
  return null;
}

export function StreamCardSkeleton() {
  return (
    <div className="card stream-card" aria-busy="true" aria-label="Loading stream">
      <div className="spread"><Skeleton w={140} h={18} /><Skeleton w={56} h={22} /></div>
      <div className="stack-2"><Skeleton w={110} /><Skeleton w={180} h={34} /></div>
      <Skeleton h={14} style={{ borderRadius: 999 }} />
      <div className="grid-3">{[0, 1, 2].map((i) => <div key={i} className="stack-2"><Skeleton w="70%" /><Skeleton w="50%" h={16} /></div>)}</div>
      <div className="grid-3 stream-card-stats">{[0, 1, 2].map((i) => <div key={i} className="stack-2"><Skeleton w="60%" /><Skeleton w="45%" h={16} /></div>)}</div>
    </div>
  );
}

export function StreamCard({ id }: { id: bigint }) {
  const data = useStream(id);
  const live = useLiveMeter(data);
  const { pnl, pct } = usePnl(id, data);
  const s = data.stream;
  if (!s || !live) return <StreamCardSkeleton />;
  const reason = statusReason(live.status, s);
  return (
    <Link href={`/app/stream/${id.toString()}`} className="card stream-card" aria-label={`Stream ${id.toString()}, ${live.status}`}>
      <div className="spread">
        <div className="row">
          <span className="h4">Stream #{id.toString()}</span>
          <ModeChip mode={s.mode} target={symbolOf(s.targetToken)} />
        </div>
        <StatusChip status={live.status} />
      </div>
      {reason && <p className={`reason${reason.tone ? ` ${reason.tone}` : ''}`}>{reason.text}</p>}
      <StreamMeter variant="thin" meter={live.meter} ratePerSec={s.ratePerSec} flowing={live.status === 'live'} label="Agent can use" />
      <div className="grid-3 stream-card-stats">
        <Stat label="Equity" value={fmtUsdt(data.equity)} />
        <Stat label="P&L" value={<Pnl value={pnl} />} sub={`${pct >= 0 ? '+' : '−'}${Math.abs(pct).toFixed(2)}%`} />
        <Stat label="Streamed" value={fmtUsdt(live.meter.streamed)} sub={s.maxTotal > 0n ? `of ${fmtUsdt(s.maxTotal)}` : 'No cap'} />
      </div>
    </Link>
  );
}
