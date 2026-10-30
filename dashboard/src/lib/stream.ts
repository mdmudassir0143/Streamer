'use client';
import { useEffect, useMemo, useState } from 'react';
import { useAccount, useReadContract, useReadContracts, usePublicClient } from 'wagmi';
import { useQuery } from '@tanstack/react-query';
import type { Address } from 'viem';
import { erc20Abi, streamVaultAbi } from './abi';
import { deployment } from './deployments';
import { targetChain } from './chains';

export interface Risk { maxSlippageBps: number; maxTradeBps: number; maxDrawdownBps: number; cooldownSec: number }
export interface StreamView {
  id: bigint; owner: Address; agent: Address; baseToken: Address; targetToken: Address; mode: number;
  ratePerSec: bigint; startTime: bigint; endTime: bigint; maxTotal: bigint; totalStreamed: bigint;
  lastAccrual: bigint; lastTradeAt: bigint; paused: boolean; halted: boolean; cancelled: boolean;
  highWaterMark: bigint; risk: Risk;
}

export const MODE_AGENT = 0;
export const MODE_INVEST = 1;

export const RISK_PRESETS = {
  Conservative: { maxSlippageBps: 50, maxTradeBps: 1000, maxDrawdownBps: 500, cooldownSec: 600 },
  Balanced: { maxSlippageBps: 100, maxTradeBps: 2500, maxDrawdownBps: 1000, cooldownSec: 300 },
  Aggressive: { maxSlippageBps: 200, maxTradeBps: 5000, maxDrawdownBps: 2000, cooldownSec: 60 },
} as const satisfies Record<string, Risk>;
export type RiskPreset = keyof typeof RISK_PRESETS;

/** 1Hz clock (seconds), shifted forward if the chain clock runs ahead of ours (e.g. anvil evm_increaseTime). */
export function useNow(): number {
  return useLocalNow() + useChainOffset();
}

export function useLocalNow(): number {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

function useChainOffset(): number {
  const client = usePublicClient({ chainId: targetChain.id });
  const q = useQuery({
    queryKey: ['chain-offset', targetChain.id],
    enabled: !!client,
    refetchInterval: 30000,
    retry: 0,
    queryFn: async () => {
      const b = await client!.getBlock({ blockTag: 'latest' });
      const d = Number(b.timestamp) - Math.floor(Date.now() / 1000);
      return d > 5 ? d : 0;
    },
  });
  return q.data ?? 0;
}

export type Status = 'live' | 'paused' | 'halted' | 'cancelled' | 'ended' | 'starved';

export function statusOf(s: StreamView, now: number, reachable?: bigint): Status {
  if (s.cancelled) return 'cancelled';
  if (s.halted) return 'halted';
  if (s.paused) return 'paused';
  if (s.endTime > 0n && BigInt(now) >= s.endTime) return 'ended';
  if (s.maxTotal > 0n && s.totalStreamed >= s.maxTotal) return 'ended';
  if (reachable !== undefined && reachable === 0n) return 'starved';
  return 'live';
}

/** Mirror of the vault's owed(): what accrue() could pull right now (ignoring allowance). */
export function owedAt(s: StreamView, now: number): bigint {
  if (s.paused || s.cancelled) return 0n;
  let t = BigInt(now);
  if (s.endTime > 0n && t > s.endTime) t = s.endTime;
  if (t <= s.lastAccrual) return 0n;
  let o = (t - s.lastAccrual) * s.ratePerSec;
  if (s.maxTotal > 0n) {
    const room = s.maxTotal > s.totalStreamed ? s.maxTotal - s.totalStreamed : 0n;
    if (o > room) o = room;
  }
  return o;
}

export interface Meter {
  unstreamed: bigint;   // still in the wallet (planned remainder, or reachable via allowance if open-ended)
  exposed: bigint;      // in the vault + owed: what the agent can touch = worst-case loss
  returned: bigint;     // withdrawn back to owner
  streamed: bigint;     // total ever streamed incl. pending
  openEnded: boolean;
}

export function computeMeter(
  s: StreamView, now: number, equity: bigint, withdrawn: bigint, reachable: bigint | undefined,
): Meter {
  const owed = owedAt(s, now);
  // Starving stream: can't pull beyond allowance/balance.
  const pending = reachable !== undefined && owed > reachable ? reachable : owed;
  const streamed = s.totalStreamed + pending;
  const exposed = s.cancelled ? 0n : equity + pending;
  let unstreamed = 0n;
  let openEnded = false;
  if (!s.cancelled) {
    if (s.maxTotal > 0n) unstreamed = s.maxTotal > streamed ? s.maxTotal - streamed : 0n;
    else if (s.endTime > 0n) {
      const left = s.endTime > BigInt(now) ? s.endTime - BigInt(now) : 0n;
      unstreamed = left * s.ratePerSec;
    } else openEnded = true;
    if (reachable !== undefined) {
      const r = reachable > pending ? reachable - pending : 0n;
      if (openEnded || unstreamed > r) unstreamed = r;
    }
  }
  return { unstreamed, exposed, returned: withdrawn, streamed, openEnded };
}

const vault = deployment.vault;

export function useStreamIds() {
  const { address } = useAccount();
  return useReadContract({
    address: vault, abi: streamVaultAbi, functionName: 'streamsOf', args: address ? [address] : undefined,
    chainId: targetChain.id,
    query: { enabled: !!vault && !!address, refetchInterval: 10000 },
  });
}

/** Chain state for one stream, reconciled every ~10s; meter values tick client-side each second. */
export function useStream(id: bigint | undefined) {
  const enabled = !!vault && id !== undefined;
  const reads = useReadContracts({
    allowFailure: true,
    contracts: id === undefined || !vault ? [] : [
      { address: vault, abi: streamVaultAbi, functionName: 'getStream', args: [id], chainId: targetChain.id },
      { address: vault, abi: streamVaultAbi, functionName: 'equity', args: [id], chainId: targetChain.id },
    ],
    query: { enabled, refetchInterval: 10000 },
  });
  const stream = reads.data?.[0]?.status === 'success' ? (reads.data[0].result as unknown as StreamView) : undefined;
  const equity = reads.data?.[1]?.status === 'success' ? (reads.data[1].result as bigint) : 0n;

  const owner = stream?.owner;
  const base = stream?.baseToken;
  const wallet = useReadContracts({
    allowFailure: true,
    contracts: !owner || !base || !vault ? [] : [
      { address: base, abi: erc20Abi, functionName: 'balanceOf', args: [owner], chainId: targetChain.id },
      { address: base, abi: erc20Abi, functionName: 'allowance', args: [owner, vault], chainId: targetChain.id },
    ],
    query: { enabled: !!owner && !!base, refetchInterval: 10000 },
  });
  const bal = wallet.data?.[0]?.status === 'success' ? (wallet.data[0].result as bigint) : undefined;
  const allow = wallet.data?.[1]?.status === 'success' ? (wallet.data[1].result as bigint) : undefined;
  const reachable = bal !== undefined && allow !== undefined ? (bal < allow ? bal : allow) : undefined;

  const client = usePublicClient({ chainId: targetChain.id });
  const withdrawnQ = useQuery({
    queryKey: ['withdrawn', String(id), stream?.cancelled, String(stream?.totalStreamed)],
    enabled: enabled && !!client && !!stream,
    staleTime: 15000,
    retry: 0,
    queryFn: async () => {
      if (!client || !vault || id === undefined) return 0n;
      try {
        const logs = await client.getContractEvents({
          address: vault, abi: streamVaultAbi, eventName: 'Withdrawn', args: { id },
          fromBlock: deployment.startBlock ?? 0n, toBlock: 'latest',
        });
        // Only count base-token amounts (non-base withdrawals are valued 0 here; good enough for the meter).
        return logs.reduce((acc, l) => {
          const a = l.args as { token?: Address; amount?: bigint };
          return a.token && base && a.token.toLowerCase() === base.toLowerCase() ? acc + (a.amount ?? 0n) : acc;
        }, 0n);
      } catch {
        return 0n;
      }
    },
  });

  return {
    stream, equity, withdrawn: withdrawnQ.data ?? 0n, walletBalance: bal, allowance: allow, reachable,
    isLoading: reads.isLoading, error: reads.error, refetch: () => { reads.refetch(); wallet.refetch(); withdrawnQ.refetch(); },
  };
}

export function useLiveMeter(data: ReturnType<typeof useStream>) {
  const now = useNow();
  const { stream, equity, withdrawn, reachable } = data;
  return useMemo(() => {
    if (!stream) return null;
    return { now, meter: computeMeter(stream, now, equity, withdrawn, reachable), status: statusOf(stream, now, reachable) };
  }, [stream, equity, withdrawn, reachable, now]);
}
