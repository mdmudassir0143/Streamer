'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import { ChatPanel } from '@/components/ChatPanel';
import { DecisionsFeed } from '@/components/DecisionsFeed';
import { KillSwitch } from '@/components/KillSwitch';
import { StreamInfo } from '@/components/StreamInfo';
import { ModeChip, StatusChip } from '@/components/StatusChip';
import { StreamMeter } from '@/components/StreamMeter';
import { pnlStr, usePnl } from '@/components/StreamCard';
import { Stat } from '@/components/ui';
import { deployment, symbolOf } from '@/lib/deployments';
import { fmtDuration, fmtUsdt } from '@/lib/format';
import { MODE_AGENT, useLiveMeter, useStream } from '@/lib/stream';

export default function StreamDetail() {
  const params = useParams<{ id: string }>();
  const raw = params?.id ?? '';
  const id = /^\d+$/.test(raw) ? BigInt(raw) : undefined;
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const { address } = useAccount();
  const data = useStream(id);
  const live = useLiveMeter(data);
  const { pnl, pct, source, agent } = usePnl(id ?? 0n, data);
  const s = data.stream;

  if (id === undefined) return <div className="notice notice-neg">&ldquo;{raw}&rdquo; isn&apos;t a stream id.</div>;
  if (!deployment.vault) return <div className="notice notice-neg">No vault deployment for this chain.</div>;
  if (!mounted || data.isLoading) return <p className="muted">Reading stream #{raw} from chain…</p>;
  if (!s || !live) return <div className="notice notice-neg">Stream #{raw} couldn&apos;t be read. {data.error?.message.split('\n')[0]}</div>;

  const isOwner = !!address && address.toLowerCase() === s.owner.toLowerCase();
  const isAgentMode = s.mode === MODE_AGENT;
  const { meter, status, now } = live;
  const flowing = status === 'live' || status === 'halted';
  const nextHour = flowing ? s.ratePerSec * 3600n : 0n;
  const reachableHour = data.reachable !== undefined && nextHour > data.reachable ? data.reachable : nextHour;
  const elapsed = now - Number(s.startTime);

  return (
    <>
      <div className="page-head">
        <div className="stack" style={{ gap: 10 }}>
          <Link href="/app" className="small muted">Streams</Link>
          <h1 className="page-title">Stream #{raw}</h1>
          <div className="row">
            <StatusChip status={status} />
            <ModeChip mode={s.mode} target={symbolOf(s.targetToken)} />
            <span className="small faint">Running {fmtDuration(elapsed)}{s.endTime > 0n ? `, ends in ${fmtDuration(Number(s.endTime) - now)}` : ', open-ended'}</span>
          </div>
        </div>
      </div>

      {status === 'halted' && <div className="notice notice-neg" style={{ marginBottom: 16 }}>The drawdown breaker tripped: equity fell more than {s.risk.maxDrawdownBps / 100}% below its high. Trading is frozen until you resume.</div>}
      {status === 'starved' && <div className="notice notice-warn" style={{ marginBottom: 16 }}>The vault can&apos;t pull more because your allowance or balance is empty. Nothing new is exposed.</div>}

      <div className="detail">
        <div className="stack">
          <section className="card card-pad">
            <StreamMeter variant="panel" meter={meter} ratePerSec={s.ratePerSec} flowing={status === 'live'} />
          </section>
          <div className="stats">
            <Stat label="Exposed now" value={fmtUsdt(meter.exposed)} sub="In vault + accrued" />
            <Stat label="Worst case in 1h" value={fmtUsdt(meter.exposed + reachableHour)} sub={flowing ? 'If you do nothing' : 'Not flowing'} />
            <Stat label="Equity" value={fmtUsdt(data.equity)} sub="Valued at venue quote" />
            <Stat label="P&L" value={pnlStr(pnl)} sub={`${pct.toFixed(2)}% ${source === 'agent' ? '(agent)' : '(on-chain)'}`} tone={pnl > 0n ? 'pos' : pnl < 0n ? 'neg' : undefined} />
            <Stat label="Streamed" value={fmtUsdt(meter.streamed)} sub={s.maxTotal > 0n ? `of ${fmtUsdt(s.maxTotal)} cap` : 'No cap'} />
          </div>
          <StreamInfo stream={s} equity={data.equity} allowance={data.allowance} apiPositions={agent?.positions} />
          {isAgentMode && <DecisionsFeed id={raw} />}
        </div>
        <aside className="aside">
          <div className="aside-panel">
            <KillSwitch stream={s} allowance={data.allowance} isOwner={isOwner} onDone={data.refetch} />
            {isAgentMode && <ChatPanel streamId={raw} owner={s.owner} />}
          </div>
        </aside>
      </div>
    </>
  );
}
