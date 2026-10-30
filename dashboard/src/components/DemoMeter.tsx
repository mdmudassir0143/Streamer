'use client';
import { useEffect, useState } from 'react';
import { computeMeter, useLocalNow, type StreamView } from '@/lib/stream';
import { StreamMeter } from './StreamMeter';

const ZERO = '0x0000000000000000000000000000000000000000' as const;

/** Simulated 100 USDT budget at 10 USDT/hour, started 2h17m ago, 4 USDT already withdrawn. */
export function DemoMeter() {
  const [start, setStart] = useState<number | null>(null);
  useEffect(() => setStart(Math.floor(Date.now() / 1000) - 2 * 3600 - 17 * 60), []);
  const now = useLocalNow();
  if (start === null) return <div className="card card-pad" style={{ minHeight: 236 }} />;
  const rate = 2778n;
  const s: StreamView = {
    id: 0n, owner: ZERO, agent: ZERO, baseToken: ZERO, targetToken: ZERO, mode: 0,
    ratePerSec: rate, startTime: BigInt(start), endTime: 0n, maxTotal: 100_000_000n,
    totalStreamed: 0n, lastAccrual: BigInt(start), lastTradeAt: 0n, paused: false, halted: false, cancelled: false,
    highWaterMark: 0n, risk: { maxSlippageBps: 100, maxTradeBps: 2500, maxDrawdownBps: 1000, cooldownSec: 300 },
  };
  const m = computeMeter(s, now, 0n, 4_000_000n, undefined);
  return (
    <div className="card card-pad" style={{ boxShadow: 'var(--shadow)' }}>
      <StreamMeter meter={{ ...m, exposed: m.exposed > 4_000_000n ? m.exposed - 4_000_000n : 0n }} ratePerSec={rate} flowing />
      <p className="small faint" style={{ margin: '16px 0 0' }}>
        Example stream: a 100 USDT budget at 10 USDT an hour. The agent can only reach the highlighted part.
      </p>
    </div>
  );
}
