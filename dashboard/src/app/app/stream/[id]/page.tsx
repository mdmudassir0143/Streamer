'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import { ChatPanel } from '@/components/ChatPanel';
import { DecisionsFeed, FeedSkeleton } from '@/components/DecisionsFeed';
import { KillSwitch } from '@/components/KillSwitch';
import { StreamInfo } from '@/components/StreamInfo';
import { ModeChip, StatusChip } from '@/components/StatusChip';
import { StreamMeter } from '@/components/StreamMeter';
import { statusReason, usePnl } from '@/components/StreamCard';
import { Pnl, Skeleton, Stat } from '@/components/ui';
import { deployment, symbolOf } from '@/lib/deployments';
import { fmtDuration, fmtPct, fmtUsdt, ratePerHour } from '@/lib/format';
import { MODE_AGENT, useLiveMeter, useStream } from '@/lib/stream';

function DetailSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading stream">
      <div className="page-head"><div className="stack-2"><Skeleton w={60} /><Skeleton w={200} h={34} /><Skeleton w={260} h={22} /></div></div>
      <div className="detail">
        <div className="stack">
          <section className="card card-pad stack">
            <Skeleton w={160} /><Skeleton w={260} h={50} /><Skeleton h={48} style={{ borderRadius: 999 }} />
            <div className="spread"><Skeleton w={120} /><Skeleton w={120} /></div>
          </section>
          <div className="stats">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="stat stack-2"><Skeleton w="60%" /><Skeleton w="70%" h={22} /></div>)}</div>
          <FeedSkeleton />
        </div>
        <div className="aside only-wide"><div className="aside-panel card-pad stack"><Skeleton w={116} h={116} style={{ borderRadius: '50%' }} /><Skeleton h={40} /><Skeleton h={44} /></div></div>
      </div>
    </div>
  );
}

const STATUS_LABEL: Record<string, string> = {
  paused: 'Paused', halted: 'Halted by drawdown', cancelled: 'Cancelled', ended: 'Ended', starved: 'Waiting for allowance', live: 'Streaming',
};

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

  if (id === undefined) return <div className="notice notice-neg">&ldquo;{raw}&rdquo; isn&apos;t a stream number. <Link className="link" href="/app">Back to your streams</Link></div>;
  if (!deployment.vault) return <div className="notice notice-neg">There&apos;s no vault on this network yet.</div>;
  if (!mounted || data.isLoading) return <DetailSkeleton />;
  if (!s || !live) {
    return (
      <div className="empty">
        <h2 className="h3">Stream #{raw} couldn&apos;t be read</h2>
        <p>It may not exist, or the network didn&apos;t answer.</p>
        <div className="row"><button className="btn" onClick={data.refetch}>Try again</button><Link className="btn btn-ghost" href="/app">Back to your streams</Link></div>
      </div>
    );
  }

  const isOwner = !!address && address.toLowerCase() === s.owner.toLowerCase();
  const isAgentMode = s.mode === MODE_AGENT;
  const { meter, status, now } = live;
  const flowing = status === 'live' || status === 'halted';
  // Next hour of flow, bounded by the stream's end time and its maxTotal cap.
  const secsLeft = s.endTime > 0n ? Math.max(0, Math.min(3600, Number(s.endTime) - now)) : 3600;
  let nextHour = flowing ? s.ratePerSec * BigInt(secsLeft) : 0n;
  const capLeft = s.maxTotal > 0n ? (s.maxTotal > meter.streamed ? s.maxTotal - meter.streamed : 0n) : undefined;
  if (capLeft !== undefined && nextHour > capLeft) nextHour = capLeft;
  const reachableHour = data.reachable !== undefined && nextHour > data.reachable ? data.reachable : nextHour;
  const elapsed = now - Number(s.startTime);
  // The cap can end a stream before its endTime.
  const capEnd = capLeft !== undefined && s.ratePerSec > 0n ? now + Number(capLeft / s.ratePerSec) : undefined;
  const endsAt = s.endTime > 0n ? Math.min(Number(s.endTime), capEnd ?? Infinity) : capEnd;
  const reason = statusReason(status, s);
  const controls = { stream: s, allowance: data.allowance, isOwner, onDone: data.refetch };

  return (
    <>
      <div className="page-head">
        <div className="stack-2">
          <Link href="/app" className="crumb">Your streams</Link>
          <h1 className="page-title">Stream #{raw}</h1>
          <div className="row">
            <StatusChip status={status} />
            <ModeChip mode={s.mode} target={symbolOf(s.targetToken)} />
            <span className="small muted">Running for {fmtDuration(elapsed)}{status === 'cancelled' || status === 'ended' ? '' : endsAt !== undefined ? `, ends in ${fmtDuration(Math.max(0, endsAt - now))}${capEnd !== undefined && endsAt === capEnd ? ', when the cap is reached' : ''}` : ', open-ended'}</span>
          </div>
        </div>
      </div>

      <div className="detail">
        <div className="stack">
          {reason && <p className={`reason${reason.tone ? ` ${reason.tone}` : ''}`}>{reason.text}</p>}
          <section className="card card-pad">
            <StreamMeter variant="panel" meter={meter} ratePerSec={s.ratePerSec} flowing={status === 'live'} statusLabel={STATUS_LABEL[status]} />
          </section>
          <div className="only-narrow"><KillSwitch {...controls} variant="bar" /></div>
          <div className="stats">
            <Stat label="Equity" value={fmtUsdt(data.equity)} sub="Venue value" />
            <Stat label="P&L" value={<Pnl value={pnl} />} sub={fmtPct(pct, true)} title={source === 'agent' ? 'P&L reported by the agent' : 'P&L computed from chain'} />
            <Stat label="Streamed" value={fmtUsdt(meter.streamed)} sub={s.maxTotal > 0n ? `of ${fmtUsdt(s.maxTotal)} cap` : 'No cap'} />
            <Stat label="Rate" value={`${ratePerHour(s.ratePerSec)}/h`} sub={flowing ? 'Flowing' : 'Stopped'} />
            <Stat label="Agent can use in 1h" value={fmtUsdt(meter.exposed + reachableHour)} sub={flowing ? 'If unchanged' : 'Not flowing'} />
          </div>
          <StreamInfo stream={s} equity={data.equity} allowance={data.allowance} apiPositions={agent?.positions} />
          {isAgentMode && <DecisionsFeed id={raw} />}
        </div>
        <aside className="aside">
          <div className="aside-panel">
            <div className="only-wide"><KillSwitch {...controls} variant="full" /></div>
            <div className="only-narrow"><KillSwitch {...controls} variant="rate" /></div>
            {isAgentMode && <ChatPanel streamId={raw} owner={s.owner} />}
          </div>
        </aside>
      </div>
    </>
  );
}
