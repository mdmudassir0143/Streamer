'use client';
import { useQuery } from '@tanstack/react-query';
import { usePublicClient } from 'wagmi';
import { nextIdAbi, streamVaultAbi } from '@/lib/abi';
import { targetChain } from '@/lib/chains';
import { deployment } from '@/lib/deployments';
import { fmtUsdt } from '@/lib/format';
import { Num } from './ui';
import { owedAt, statusOf, useLocalNow, type StreamView } from '@/lib/stream';

const MAX_SCAN = 200;

/** Protocol-wide numbers read straight from the vault. Shows "Unavailable" if the RPC can't be reached. */
export function ProtocolStats() {
  const client = usePublicClient({ chainId: targetChain.id });
  const vault = deployment.vault;
  const q = useQuery({
    queryKey: ['protocol-stats', targetChain.id],
    enabled: !!client && !!vault,
    refetchInterval: 20000,
    retry: 1,
    queryFn: async () => {
      const next = await client!.readContract({ address: vault!, abi: nextIdAbi, functionName: 'nextId' });
      const count = next > 0n ? Number(next) - 1 : 0;
      const ids = Array.from({ length: Math.min(count, MAX_SCAN) }, (_, i) => BigInt(i + 1));
      const streams = await Promise.all(
        ids.map((id) => client!.readContract({ address: vault!, abi: streamVaultAbi, functionName: 'getStream', args: [id] }).catch(() => null)),
      );
      return { count, streams: streams.filter(Boolean) as unknown as StreamView[] };
    },
  });
  const now = useLocalNow();
  const ok = q.isSuccess && q.data;
  const total = ok ? q.data.streams.reduce((a, s) => a + s.totalStreamed + owedAt(s, now), 0n) : 0n;
  const live = ok ? q.data.streams.filter((s) => statusOf(s, now) === 'live').length : 0;
  const dash = q.isError || !vault ? 'Unavailable' : '—';
  return (
    <div className="figures">
      <div><div className="figure-big">{ok ? q.data.count.toLocaleString('en-US') : dash}</div><div className="muted">Streams created</div></div>
      <div><div className="figure-big">{ok ? live.toLocaleString('en-US') : dash}</div><div className="muted">Streaming right now</div></div>
      <div><div className="figure-big"><Num>{ok ? fmtUsdt(total) : dash}</Num></div><div className="muted">USDT streamed so far</div></div>
    </div>
  );
}
