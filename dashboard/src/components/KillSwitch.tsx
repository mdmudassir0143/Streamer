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
import { Spinner } from './ui';

const HOLD_MS = 1200;

interface Props { stream: StreamView; allowance?: bigint; isOwner: boolean; onDone: () => void }

/**
 * Owner controls. `full` = round hold-to-kill + pause/revoke + set rate (desktop side panel).
 * `bar` = compact hold-to-kill + pause/revoke (mobile/tablet, under the meter). `rate` = set rate only.
 */
export function KillSwitch({ stream, allowance, isOwner, onDone, variant = 'full' }: Props & { variant?: 'full' | 'bar' | 'rate' }) {
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
      'Stream cancelled. Every token went back to your wallet.');
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
      'Allowance revoked. The vault can’t pull any more USDT.').then(onDone);

  const busy = (label: string, text: string, idle: string) => (pending === label ? <><Spinner />{text}</> : idle);

  const holdButton = (
    <button
      className={`kill-btn${holding ? ' holding' : ''}`}
      style={{ ['--p' as string]: progress }}
      disabled={disabled}
      onPointerDown={startHold}
      onPointerUp={stopHold}
      onPointerLeave={stopHold}
      onKeyDown={(e) => { if ((e.key === ' ' || e.key === 'Enter') && !holding) { e.preventDefault(); startHold(); } }}
      onKeyUp={stopHold}
      aria-label="Hold to cancel the stream and withdraw everything"
    >
      <span className="kill-btn-face">{pending === 'Cancel & withdraw' ? 'Sending…' : <>Hold to<br />kill</>}</span>
    </button>
  );

  const actions = (
    <div className="kill-grid">
      {stream.paused || stream.halted ? (
        <button className="btn" disabled={disabled} onClick={() => tx('Resume', 'resume', stream.halted ? 'Resumed. The drawdown breaker is reset.' : 'Resumed. The stream is flowing again.')}>
          {busy('Resume', 'Resuming', stream.halted ? 'Reset & resume' : 'Resume')}
        </button>
      ) : (
        <button className="btn" disabled={disabled} onClick={() => tx('Pause', 'pause', 'Paused. Nothing more streams until you resume.')}>{busy('Pause', 'Pausing', 'Pause')}</button>
      )}
      <button className="btn" disabled={disabled || allowance === 0n} onClick={revoke}>
        {allowance === 0n ? 'Revoked' : busy('Revoke allowance', 'Revoking', 'Revoke')}
      </button>
    </div>
  );

  const rateRow = (
    <div className="input-row">
      <div className="input-suffix">
        <input className="input" inputMode="decimal" placeholder={ratePerHour(stream.ratePerSec)} value={newRate} onChange={(e) => setNewRate(e.target.value)} aria-label="New rate in USDT per hour" />
        <span>USDT/h</span>
      </div>
      <button className="btn" style={{ height: 44 }} disabled={disabled || !newRate.trim()} onClick={setRate}>{busy('Set rate', 'Saving', 'Set rate')}</button>
    </div>
  );

  const ownerNote = !isOwner && <p className="small strong">Connect the owner wallet to use these controls.</p>;

  if (stream.cancelled) {
    if (variant === 'rate') return null;
    return (
      <section className={variant === 'bar' ? 'control-bar' : 'kill'} aria-label="Kill switch" style={variant === 'bar' ? { gridTemplateColumns: '1fr' } : undefined}>
        <div className="stack-2">
          <div className="kill-done">Stream cancelled</div>
          <p className="small muted">Everything this stream held went back to your wallet. The agent has nothing left to trade.</p>
        </div>
        {allowance !== undefined && allowance > 0n && (
          <button className="btn btn-block" disabled={disabled} onClick={revoke}>Revoke remaining {fmtUsdt(allowance)} USDT allowance</button>
        )}
      </section>
    );
  }

  if (variant === 'bar') {
    return (
      <section className="control-bar" aria-label="Kill switch">
        {holdButton}
        <div className="control-bar-actions">
          <div className="small"><span className="strong">Kill switch.</span> <span className="muted">Hold to cancel and get every token back.</span></div>
          {actions}
          {ownerNote}
        </div>
      </section>
    );
  }

  if (variant === 'rate') {
    return (
      <section className="kill" aria-label="Change rate">
        <h2 className="h4">Change rate</h2>
        {rateRow}
      </section>
    );
  }

  return (
    <section className="kill" aria-label="Kill switch">
      <div className="kill-main">
        {holdButton}
        <div className="kill-copy">
          <h2 className="h4">Kill switch</h2>
          <p>Hold to cancel. Every token the stream holds comes back to you in one transaction, and pulling stops.</p>
        </div>
      </div>
      {actions}
      {rateRow}
      {ownerNote}
    </section>
  );
}
