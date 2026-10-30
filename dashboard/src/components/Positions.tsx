'use client';
import { useReadContracts } from 'wagmi';
import type { Address } from 'viem';
import { streamVaultAbi } from '@/lib/abi';
import type { Position } from '@/lib/agentApi';
import { targetChain } from '@/lib/chains';
import { decimalsOf, deployment, symbolOf } from '@/lib/deployments';
import { fmtAmount, fmtUsdt, toBaseUnits } from '@/lib/format';
import { Num, Skeleton } from './ui';

export function Positions({ id, apiPositions }: { id: bigint; apiPositions?: Position[] }) {
  const tokens = Object.values(deployment.tokens).filter(Boolean) as Address[];
  const vault = deployment.vault;
  const reads = useReadContracts({
    allowFailure: true,
    contracts: vault ? tokens.map((t) => ({ address: vault, abi: streamVaultAbi, functionName: 'balanceOf' as const, args: [id, t] as const, chainId: targetChain.id })) : [],
    query: { enabled: !!vault && !apiPositions, refetchInterval: 10000 },
  });

  const rows = apiPositions
    ? apiPositions.map((p) => {
        const dec = p.decimals ?? decimalsOf(p.symbol || p.token);
        const amt = toBaseUnits(p.amount, dec) ?? 0n;
        const val = toBaseUnits(p.valueBase, 6);
        return { sym: p.symbol || symbolOf(p.token), amount: fmtAmount(amt, dec), value: val != null ? fmtUsdt(val) : '—', bal: amt };
      }).filter((r) => r.bal !== 0n)
    : tokens.map((t, i) => {
        const r = reads.data?.[i];
        const bal = r?.status === 'success' ? (r.result as bigint) : 0n;
        const dec = decimalsOf(t);
        return { sym: symbolOf(t), amount: fmtAmount(bal, dec), value: symbolOf(t) === 'USDT' ? fmtUsdt(bal) : '—', bal };
      }).filter((r) => (r as { bal?: bigint }).bal !== 0n);

  if (!apiPositions && reads.isLoading) {
    return <div className="stack-2" aria-busy="true">{[0, 1, 2].map((i) => <div key={i} className="spread" style={{ height: 44 }}><Skeleton w={60} /><Skeleton w={90} /></div>)}</div>;
  }
  if (rows.length === 0) return <p className="muted">The vault holds nothing for this stream yet. Balances appear as USDT streams in.</p>;
  return (
    <>
      <table className="table">
        <thead><tr><th>Asset</th><th className="r">Amount</th><th className="r">Value (USDT)</th></tr></thead>
        <tbody>{rows.map((r) => <tr key={r.sym}><td>{r.sym}</td><td className="r num"><Num>{r.amount}</Num></td><td className="r num"><Num>{r.value}</Num></td></tr>)}</tbody>
      </table>
      {!apiPositions && <p className="small faint" style={{ marginTop: 'var(--s-3)' }}>Read from the vault. Non-USDT values appear when the agent is online.</p>}
    </>
  );
}
