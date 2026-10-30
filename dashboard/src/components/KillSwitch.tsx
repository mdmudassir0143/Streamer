'use client';
import { useEffect, useRef, useState } from 'react';
import { useWriteContract } from 'wagmi';
import { parseUnits } from 'viem';
import { erc20Abi, streamVaultAbi } from '@/lib/abi';
import { targetChain } from '@/lib/chains';
import { deployment } from '@/lib/deployments';
import { fmtUsdt, ratePerHour } from '@/lib/format';
import type { StreamView } from '@/lib/stream';
import { useTx } from './useTx';

const HOLD_MS = 1200;

export function KillSwitch({ stream, allowance, isOwner, onDone }: { stream: StreamView; allowance?: bigint; isOwner: boolean; onDone: () => void }) {
  const { writeContractAsync } = useWriteContract();
  const { run, pending } = useTx();
  const vault = deployment.vault!;
  const id = stream.id;
  const [progress, setProgress] = useState(0);
  const [holding, setHolding] = useState(false);
  const raf = useRef<number | null>(null);
  const t0 = useRef(0);
  const [newRate, setNewRate] = useState('');

  const disabled = !isOwner || !!pending;

  const cancel = async () => {
    await run('Cancel & withdraw', () => writeContractAsync({ address: vault, abi: streamVaultAbi, functionName: 'cancel', args: [id], chainId: targetChain.id }),
      'Stream cancelled. Every token in the vault went back to your wallet.');
    onDone();
  };

  const stopHold = () => {
    setHolding(false);
    if (raf.current) cancelAnimationFrame(raf.current);
    raf.current = null;
    setProgress(0);
  };
  const startHold = () => {
    if (disabled || stream.cancelled) return;
    setHolding(true);
    t0.current = performance.now();
    const step = (t: number) => {
      const p = Math.min(1, (t - t0.current) / HOLD_MS);
      setProgress(p);
      if (p >= 1) { stopHold(); void cancel(); return; }
      raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
  };
  useEffect(() => () => { if (raf.current) cancelAnimationFrame(raf.current); }, []);

  const tx = (label: string, fn: 'pause' | 'resume', done: string) =>
    run(label, () => writeContractAsync({ address: vault, abi: streamVaultAbi, functionName: fn, args: [id], chainId: targetChain.id }), done).then(onDone);

  const setRate = async () => {
    let perHour: bigint;
    try { perHour = parseUnits(newRate.trim() || '0', 6); } catch { return; }
    const rps = perHour / 3600n;
    await run('Set rate', () => writeContractAsync({ address: vault, abi: streamVaultAbi, functionName: 'setRate', args: [id, rps], chainId: targetChain.id }),
      `Rate set to ${ratePerHour(rps)} USDT per hour`);
    setNewRate('');
    onDone();
  };

  const revoke = () =>
    run('Revoke allowance', () => writeContractAsync({ address: stream.baseToken, abi: erc20Abi, functionName: 'approve', args: [vault, 0n], chainId: targetChain.id }),
      'Allowance revoked. The vault cannot pull another cent from your wallet.').then(onDone);

  if (stream.cancelled) {
    return (
      <section className="card" aria-label="Kill switch">
        <div className="card-head"><h2 className="h4">Kill switch</h2><span className="badge">Cancelled</span></div>
        <div className="card-body stack">
          <p className="muted" style={{ margin: 0 }}>Everything this stream held went back to your wallet. The agent has nothing left to trade.</p>
          {allowance !== undefined && allowance > 0n && (
            <button className="btn btn-block" disabled={disabled} onClick={revoke}>Revoke remaining {fmtUsdt(allowance)} USDT allowance</button>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="card" aria-label="Kill switch">
      <div className="card-head">
        <h2 className="h4">Kill switch</h2>
        {!isOwner && <span className="small faint">Owner only</span>}
      </div>
      <div className="card-body stack">
        <button
          className={`btn btn-danger btn-block hold-btn${holding ? ' holding' : ''}`}
          style={{ ['--p' as string]: progress }}
          disabled={disabled}
          onPointerDown={startHold}
          onPointerUp={stopHold}
          onPointerLeave={stopHold}
          onKeyDown={(e) => { if ((e.key === ' ' || e.key === 'Enter') && !holding) { e.preventDefault(); startHold(); } }}
          onKeyUp={stopHold}
          aria-label="Hold to cancel the stream and withdraw everything"
        >
          <span className="hold-fill" aria-hidden />
          <span>{pending === 'Cancel & withdraw' ? 'Cancelling…' : holding ? 'Keep holding…' : 'Hold to cancel & withdraw all'}</span>
        </button>
        <p className="small muted" style={{ margin: 0 }}>Sends every token the stream holds back to you in one transaction and stops all pulls.</p>
        <div className="kill-grid">
          {stream.paused || stream.halted ? (
            <button className="btn" disabled={disabled} onClick={() => tx('Resume', 'resume', stream.halted ? 'Resumed. Drawdown breaker reset.' : 'Resumed. The stream is flowing again.')}>
              {stream.halted ? 'Reset & resume' : 'Resume'}
            </button>
          ) : (
            <button className="btn" disabled={disabled} onClick={() => tx('Pause', 'pause', 'Paused. Nothing more will stream until you resume.')}>Pause</button>
          )}
          <button className="btn" disabled={disabled || allowance === 0n} onClick={revoke}>
            {allowance === 0n ? 'Allowance revoked' : 'Revoke allowance'}
          </button>
        </div>
        <div className="input-row">
          <input className="input mono" inputMode="decimal" placeholder={`${ratePerHour(stream.ratePerSec)} USDT/h`} value={newRate} onChange={(e) => setNewRate(e.target.value)} aria-label="New rate in USDT per hour" />
          <button className="btn" style={{ height: 40 }} disabled={disabled || !newRate.trim()} onClick={setRate}>Set rate</button>
        </div>
        {!isOwner && <p className="small faint" style={{ margin: 0 }}>Connect the owner wallet to use these controls.</p>}
      </div>
    </section>
  );
}
