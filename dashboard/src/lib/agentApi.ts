'use client';
import { useQuery } from '@tanstack/react-query';

export const AGENT_API = (process.env.NEXT_PUBLIC_AGENT_API || 'http://localhost:8787').replace(/\/$/, '');

export interface Health { ok: boolean; chainId: number; agentAddress: `0x${string}` | null; vault: `0x${string}` | null; engine?: string }
export interface Prices {
  ts: number;
  prices: Record<string, number>;
  venue: Record<string, number>;
  source?: Record<string, string>;
}
export interface Position { token: string; symbol: string; decimals?: number; amount: string | number; valueBase: string | number }
export interface StreamDetail {
  id?: number | string;
  positions?: Position[];
  pnlBase?: string | number;
  pnlPct?: number;
  exposedBase?: string | number;
  unstreamedBase?: string | number;
  equity?: string | number;
  [k: string]: unknown;
}
export interface Decision {
  ts: number | string;
  streamId: number | string;
  action: 'buy' | 'sell' | 'hold';
  tokenIn?: string;
  tokenOut?: string;
  amountIn?: string | number;
  reason?: string;
  analyst?: unknown;
  risk?: unknown;
  txHash?: string;
  reasonHash?: string;
  blocked?: boolean;
  error?: string;
  engine?: string;
}
export interface Prefs { riskAppetite: 'low' | 'medium' | 'high'; assets: string[]; maxPositionPct: number; intervalSec: number; enabled: boolean }
export interface ChatTx { description: string; to: `0x${string}`; data: `0x${string}`; value?: string }
export interface ChatResponse { reply: string; prefsUpdated?: Prefs; txs?: ChatTx[] }

async function req<T>(path: string, init?: RequestInit, timeoutMs = 6000): Promise<T> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(`${AGENT_API}${path}`, {
      ...init,
      signal: ctl.signal,
      headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
    });
    if (!r.ok) throw new Error(`${r.status} ${await r.text().catch(() => '')}`.trim());
    return (await r.json()) as T;
  } finally {
    clearTimeout(t);
  }
}

export const agentApi = {
  health: () => req<Health>('/api/health', undefined, 3000),
  prices: () => req<Prices>('/api/prices'),
  stream: (id: string) => req<StreamDetail>(`/api/streams/${id}`),
  decisions: (id: string) => req<Decision[]>(`/api/streams/${id}/decisions?limit=500`),
  chat: (body: { streamId: string; owner: string; message: string }) =>
    req<ChatResponse>('/api/chat', { method: 'POST', body: JSON.stringify(body) }, 60000),
};

export function useAgentHealth() {
  return useQuery({ queryKey: ['agent', 'health'], queryFn: agentApi.health, refetchInterval: 15000, retry: 0 });
}
/** Agent-dependent queries only run while /api/health answers. */
export function useAgentOnline() {
  const h = useAgentHealth();
  return { online: h.isSuccess, health: h.data, loading: h.isLoading };
}
export function usePrices() {
  const { online } = useAgentOnline();
  return useQuery({ queryKey: ['agent', 'prices'], queryFn: agentApi.prices, enabled: online, refetchInterval: 10000, retry: 0 });
}
export function useAgentStream(id: string) {
  const { online } = useAgentOnline();
  return useQuery({ queryKey: ['agent', 'stream', id], queryFn: () => agentApi.stream(id), enabled: online, refetchInterval: 10000, retry: 0 });
}
export function useDecisions(id: string) {
  const { online } = useAgentOnline();
  return useQuery({ queryKey: ['agent', 'decisions', id], queryFn: () => agentApi.decisions(id), enabled: online, refetchInterval: 8000, retry: 0 });
}
