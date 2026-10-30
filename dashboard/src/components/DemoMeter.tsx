'use client';
import { useEffect, useState } from 'react';
import { computeMeter, useLocalNow, type StreamView } from '@/lib/stream';
import { StreamMeter } from './StreamMeter';

const ZERO = '0x0000000000000000000000000000000000000000' as const;
const BACK = 12_000_000n;

/** Simulated 100 USDT budget at 10 USDT/hour, started 4h ago, 12 USDT already withdrawn. */
export function DemoMeter() {
  const [start, setStart] = useState<number | null>(null);
  useEffect(() => setStart(Math.floor(Date.now() / 1000) - 4 * 3600 - 12 * 60), []);
  const now = useLocalNow();
  if (start === null) return <div style={{ minHeight: 260 }} />;
  const rate = 2778n;
  const s: StreamView = {
    id: 0n, owner: ZERO, agent: ZERO, baseToken: ZERO, targetToken: ZERO, mode: 0,
    ratePerSec: rate, startTime: BigInt(start), endTime: 0n, maxTotal: 100_000_000n,
    totalStreamed: 0n, lastAccrual: BigInt(start), lastTradeAt: 0n, paused: false, halted: false, cancelled: false,
    highWaterMark: 0n, risk: { maxSlippageBps: 100, maxTradeBps: 2500, maxDrawdownBps: 1000, cooldownSec: 300 },
  };
  const m = computeMeter(s, now, 0n, BACK, undefined);
  return <StreamMeter variant="hero" meter={{ ...m, exposed: m.exposed > BACK ? m.exposed - BACK : 0n }} ratePerSec={rate} flowing />;
}
