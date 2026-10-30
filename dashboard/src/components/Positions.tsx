'use client';
import { useReadContracts } from 'wagmi';
import type { Address } from 'viem';
import { streamVaultAbi } from '@/lib/abi';
import type { Position } from '@/lib/agentApi';
import { targetChain } from '@/lib/chains';
import { decimalsOf, deployment, symbolOf } from '@/lib/deployments';
import { fmtUnits, toBaseUnits } from '@/lib/format';
import { Num } from './ui';

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
        return { sym: p.symbol || symbolOf(p.token), amount: fmtUnits(amt, dec, dec > 6 ? 6 : 2, 0), value: val != null ? fmtUnits(val, 6, 2) : '—', bal: amt };
      }).filter((r) => r.bal !== 0n)
    : tokens.map((t, i) => {
        const r = reads.data?.[i];
        const bal = r?.status === 'success' ? (r.result as bigint) : 0n;
        const dec = decimalsOf(t);
        return { sym: symbolOf(t), amount: fmtUnits(bal, dec, dec > 6 ? 6 : 2, 0), value: symbolOf(t) === 'USDT' ? fmtUnits(bal, 6, 2) : '—', bal };
      }).filter((r) => (r as { bal?: bigint }).bal !== 0n);

  if (rows.length === 0) return <p className="muted" style={{ margin: 0 }}>The vault holds nothing for this stream right now.</p>;
  return (
    <>
      <table className="table">
        <thead><tr><th>Asset</th><th className="r">Amount</th><th className="r">Value (USDT)</th></tr></thead>
        <tbody>{rows.map((r) => <tr key={r.sym}><td>{r.sym}</td><td className="r num"><Num>{r.amount}</Num></td><td className="r num"><Num>{r.value}</Num></td></tr>)}</tbody>
      </table>
      {!apiPositions && <p className="small faint" style={{ margin: '10px 0 0' }}>Read from the vault. Non-USDT values appear when the agent is online.</p>}
    </>
  );
}
