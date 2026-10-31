'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAccount, useReadContracts, useWriteContract } from 'wagmi';
import { decodeEventLog, isAddress, maxUint256, parseUnits, type Address } from 'viem';
import { erc20Abi, streamVaultAbi } from '@/lib/abi';
import { useAgentOnline } from '@/lib/agentApi';
import { targetChain } from '@/lib/chains';
import { ASSETS, deployment, type AssetSymbol } from '@/lib/deployments';
import { fmtPct, fmtTick, fmtUsdt, shortAddr } from '@/lib/format';
import { MODE_AGENT, MODE_INVEST, RISK_PRESETS, type RiskPreset } from '@/lib/stream';
import { useTx, type Phase } from '@/components/useTx';
import { Num, Spinner } from '@/components/ui';
import { StreamMeter } from '@/components/StreamMeter';

type Unit = 'hour' | 'day';
type DurUnit = 'min' | Unit;
const DUR_SECS: Record<DurUnit, number> = { min: 60, hour: 3600, day: 86400 };
const PRESET_COPY: Record<RiskPreset, string> = {
  Conservative: 'Small, careful trades.',
  Balanced: 'Moderate size and pace.',
  Aggressive: 'Larger, more frequent trades.',
};

function safeParse(v: string): bigint {
  try { return v.trim() ? parseUnits(v.trim(), 6) : 0n; } catch { return 0n; }
}

export default function NewStream() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const { address, isConnected } = useAccount();
  const { health, online, loading: agentLoading } = useAgentOnline();

  const [mode, setMode] = useState<number>(MODE_AGENT);
  const [agent, setAgent] = useState('');
  const [asset, setAsset] = useState<AssetSymbol>('WETH');
  const [rate, setRate] = useState('5');
  const [unit, setUnit] = useState<Unit>('hour');
  const [openEnded, setOpenEnded] = useState(false);
  const [duration, setDuration] = useState('24');
  const [durUnit, setDurUnit] = useState<DurUnit>('hour');
  const [maxTotal, setMaxTotal] = useState('');
  const [preset, setPreset] = useState<RiskPreset>('Balanced');
  const [cap, setCap] = useState('');
  const [capTouched, setCapTouched] = useState(false);

  useEffect(() => {
    if (health?.agentAddress && !agent) setAgent(health.agentAddress);
  }, [health, agent]);

  const rateBase = safeParse(rate);
  const ratePerSec = rateBase / (unit === 'hour' ? 3600n : 86400n);
  const durationSec = openEnded ? 0n : BigInt(Math.max(0, Math.floor(Number(duration || '0') * DUR_SECS[durUnit])));
  const plannedTotal = durationSec > 0n ? ratePerSec * durationSec : 0n;
  const maxTotalBase = maxTotal.trim() ? safeParse(maxTotal) : plannedTotal;
  const capBase = capTouched ? safeParse(cap) : maxTotalBase;

  useEffect(() => {
    if (!capTouched) setCap(maxTotalBase > 0n ? fmtUsdt(maxTotalBase).replace(/,/g, '') : '');
  }, [maxTotalBase, capTouched]);

  const vault = deployment.vault;
  const usdt = deployment.usdt;
  const reads = useReadContracts({
    allowFailure: true,
    contracts: address && usdt && vault ? [
      { address: usdt, abi: erc20Abi, functionName: 'allowance', args: [address, vault], chainId: targetChain.id },
      { address: usdt, abi: erc20Abi, functionName: 'balanceOf', args: [address], chainId: targetChain.id },
    ] : [],
    query: { enabled: !!address && !!usdt && !!vault, refetchInterval: 8000 },
  });
  const allowance = reads.data?.[0]?.status === 'success' ? (reads.data[0].result as bigint) : 0n;
  const balance = reads.data?.[1]?.status === 'success' ? (reads.data[1].result as bigint) : undefined;

  const { writeContractAsync } = useWriteContract();
  const { run, pending, state } = useTx();

  const target: Address | undefined = deployment.tokens[asset];
  const agentAddr = mode === MODE_INVEST ? (address ?? '0x0000000000000000000000000000000000000000') : agent;
  const approved = capBase > 0n && allowance >= capBase;

  const problems = useMemo(() => {
    const p: string[] = [];
    if (!vault || !usdt) p.push(`No vault/USDT deployment for chain ${targetChain.id}.`);
    if (ratePerSec === 0n) p.push('Rate is too small. It must be at least 0.000001 USDT per second.');
    if (mode === MODE_AGENT && !isAddress(agent)) p.push(online ? 'Add the agent address under Advanced.' : 'The agent is offline. Add its address under Advanced.');
    if (!target) p.push(`${asset} isn't deployed on this chain.`);
    if (capBase === 0n) p.push('Set a budget cap. Open-ended streams need one so you control the ceiling.');
    if (!openEnded && durationSec === 0n) p.push('Enter a duration, or choose open-ended.');
    return p;
  }, [vault, usdt, ratePerSec, mode, agent, online, target, asset, capBase, openEnded, durationSec]);

  async function approve() {
    if (!usdt || !vault) return;
    await run('Approve USDT', () => writeContractAsync({ address: usdt, abi: erc20Abi, functionName: 'approve', args: [vault, capBase], chainId: targetChain.id }),
      `USDT approved. The vault can pull up to ${fmtUsdt(capBase)} USDT as it streams.`);
    reads.refetch();
  }

  async function create() {
    if (!vault || !usdt || !target) return;
    const risk = RISK_PRESETS[preset];
    const receipt = await run('Create stream', () => writeContractAsync({
      address: vault, abi: streamVaultAbi, functionName: 'createStream', chainId: targetChain.id,
      args: [agentAddr as Address, usdt, target, mode, ratePerSec, durationSec, maxTotalBase, risk],
    }), 'Stream created and flowing');
    if (!receipt) return;
    for (const log of receipt.logs) {
      try {
        const ev = decodeEventLog({ abi: streamVaultAbi, data: log.data, topics: log.topics });
        if (ev.eventName === 'StreamCreated') { router.push(`/app/stream/${(ev.args as { id: bigint }).id.toString()}`); return; }
      } catch { /* other contract's log */ }
    }
    router.push('/app');
  }

  const perSec = fmtTick(ratePerSec);
  const hours = ratePerSec > 0n && maxTotalBase > 0n ? Number(maxTotalBase / ratePerSec) / 3600 : null;

  const hourExposed = maxTotalBase > 0n && ratePerSec * 3600n > maxTotalBase ? maxTotalBase : ratePerSec * 3600n;
  const ceiling = maxTotalBase > 0n ? maxTotalBase : capBase;
  const preview = {
    unstreamed: ceiling > hourExposed ? ceiling - hourExposed : 0n,
    exposed: hourExposed,
    returned: 0n,
    streamed: hourExposed,
    openEnded: ceiling === 0n,
  };

  const approvePhase: Phase = approved ? 'done' : state('Approve USDT').phase;
  const createPhase: Phase = state('Create stream').phase;
  const isDefaultAgent = !!health?.agentAddress && agent.toLowerCase() === health.agentAddress.toLowerCase();

  return (
    <>
      <div className="page-head">
        <div className="stack-2">
          <h1 className="page-title">Start a stream</h1>
          <p className="muted" style={{ maxWidth: '60ch' }}>Your USDT stays in your wallet. The vault pulls it a little each second, and never more than your budget cap.</p>
        </div>
      </div>
      <div className="new-layout">
        <div className="card card-pad">
          <section className="form-step" aria-labelledby="step-mode">
            <span className="form-step-n" aria-hidden>1</span>
            <div className="form-step-body">
              <h2 className="h4" id="step-mode">Mode</h2>
              <div className="option-grid">
                <button type="button" className="option" aria-pressed={mode === MODE_AGENT} onClick={() => setMode(MODE_AGENT)}>
                  <span className="option-title">AI agent</span>
                  <span className="option-desc">An analyst and a risk officer trade inside the limits you set.</span>
                </button>
                <button type="button" className="option" aria-pressed={mode === MODE_INVEST} onClick={() => setMode(MODE_INVEST)}>
                  <span className="option-title">Invest</span>
                  <span className="option-desc">Buy one asset second by second. No model involved.</span>
                </button>
              </div>
              <div className="field">
                <span className="field-label" id="asset-label">{mode === MODE_AGENT ? 'Default asset' : 'Asset to buy'}</span>
                <div><div className="segmented" role="group" aria-labelledby="asset-label">
                  {ASSETS.map((a) => (
                    <button key={a} type="button" aria-pressed={asset === a} onClick={() => setAsset(a)}>{a}</button>
                  ))}
                </div></div>
              </div>
              {mode === MODE_AGENT && (
                <div className="agent-line">
                  {isAddress(agent) ? (
                    <>
                      <span>{isDefaultAgent ? 'Hashtream agent' : 'Custom agent'}</span>
                      <span className="muted">·</span>
                      <span className="mono">{shortAddr(agent)}</span>
                      {isDefaultAgent && <span className="ok-mark" aria-label="verified">✓</span>}
                    </>
                  ) : (
                    <span className="muted">{agentLoading ? 'Looking up the Hashtream agent…' : 'The agent is offline. Add its address under Advanced.'}</span>
                  )}
                </div>
              )}
            </div>
          </section>

          <section className="form-step" aria-labelledby="step-rate">
            <span className="form-step-n" aria-hidden>2</span>
            <div className="form-step-body">
              <h2 className="h4" id="step-rate">Rate and budget</h2>
              <div className="field">
                <label className="field-label" htmlFor="rate">How fast</label>
                <div className="input-row">
                  <input id="rate" className="input" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} />
                  <div className="segmented" role="group" aria-label="Rate unit">
                    <button type="button" aria-pressed={unit === 'hour'} onClick={() => setUnit('hour')}>USDT per hour</button>
                    <button type="button" aria-pressed={unit === 'day'} onClick={() => setUnit('day')}>USDT per day</button>
                  </div>
                </div>
                <span className="field-hint">About {perSec} USDT a second.</span>
              </div>
              <div className="field">
                <label className="field-label" htmlFor="duration">For how long</label>
                <div className="input-row">
                  <input id="duration" className="input" inputMode="decimal" value={openEnded ? '' : duration} disabled={openEnded} onChange={(e) => setDuration(e.target.value)} placeholder={openEnded ? 'Open-ended' : ''} />
                  <div className="segmented" role="group" aria-label="Duration unit">
                    <button type="button" aria-pressed={!openEnded && durUnit === 'min'} onClick={() => { setOpenEnded(false); setDurUnit('min'); }}>Mins</button>
                    <button type="button" aria-pressed={!openEnded && durUnit === 'hour'} onClick={() => { setOpenEnded(false); setDurUnit('hour'); }}>Hours</button>
                    <button type="button" aria-pressed={!openEnded && durUnit === 'day'} onClick={() => { setOpenEnded(false); setDurUnit('day'); }}>Days</button>
                    <button type="button" aria-pressed={openEnded} onClick={() => setOpenEnded(true)}>Open-ended</button>
                  </div>
                </div>
              </div>
              <div className="field">
                <label className="field-label" htmlFor="budget">Budget cap</label>
                <div className="input-suffix">
                  <input id="budget" className="input" inputMode="decimal" value={maxTotal} onChange={(e) => setMaxTotal(e.target.value)} placeholder={plannedTotal > 0n ? fmtUsdt(plannedTotal).replace(/,/g, '') : 'Required for open-ended'} />
                  <span>USDT</span>
                </div>
                <span className="field-hint">The most this stream can ever take from your wallet. {plannedTotal > 0n && !maxTotal.trim() ? 'Defaults to rate × duration.' : ''}</span>
              </div>
            </div>
          </section>

          <section className="form-step" aria-labelledby="step-limits">
            <span className="form-step-n" aria-hidden>3</span>
            <div className="form-step-body">
              <div className="stack-2">
                <h2 className="h4" id="step-limits">Limits</h2>
                <span className="field-hint">The contract checks these on every trade.</span>
              </div>
              <div className="option-grid">
                {(Object.keys(RISK_PRESETS) as RiskPreset[]).map((k) => {
                  const r = RISK_PRESETS[k];
                  return (
                    <button key={k} type="button" className="option" aria-pressed={preset === k} onClick={() => setPreset(k)}>
                      <span className="option-title">{k}</span>
                      <span className="option-desc">{PRESET_COPY[k]}</span>
                      <dl className="option-kv">
                        <dt>Slippage</dt><dd><Num>{fmtPct(r.maxSlippageBps / 100)}</Num></dd>
                        <dt>Max trade</dt><dd><Num>{fmtPct(r.maxTradeBps / 100)}</Num></dd>
                        <dt>Halts at</dt><dd><Num>{`−${fmtPct(r.maxDrawdownBps / 100)}`}</Num></dd>
                      </dl>
                    </button>
                  );
                })}
              </div>
              <details className="disclosure">
                <summary>Advanced</summary>
                <div className="disclosure-body">
                  {mode === MODE_AGENT && (
                    <label className="field">
                      <span className="field-label">Agent address</span>
                      <input className="input mono" value={agent} onChange={(e) => setAgent(e.target.value)} placeholder="0x…" spellCheck={false} />
                      <span className="field-hint">The agent can trade inside the vault. It can never withdraw.</span>
                    </label>
                  )}
                  <div className="field">
                    <label className="field-label" htmlFor="cap">Wallet allowance</label>
                    <div className="input-suffix">
                      <input id="cap" className="input" inputMode="decimal" value={cap} onChange={(e) => { setCapTouched(true); setCap(e.target.value); }} placeholder="Same as budget cap" />
                      <span>USDT</span>
                    </div>
                    <span className="field-hint">What you approve the vault to pull. It matches your budget cap unless you change it here.</span>
                  </div>
                </div>
              </details>
            </div>
          </section>

          <section className="form-step" aria-labelledby="step-go">
            <span className="form-step-n" aria-hidden>4</span>
            <div className="form-step-body">
              <h2 className="h4" id="step-go">Approve and create</h2>
              {mounted && !isConnected ? (
                <div className="notice">Connect your wallet to approve and create the stream.</div>
              ) : (
                <div className="action-bar">
                  <ActionStep n="Step 1" title="Approve USDT" phase={approvePhase} error={state('Approve USDT').error} doneText="Approved"
                    hint={`Lets the vault pull up to ${fmtUsdt(capBase)} USDT as it streams.`}>
                    {!approved && (
                      <button className="btn btn-block" disabled={!!pending || capBase === 0n || !vault} onClick={approve}>
                        {`Approve ${fmtUsdt(capBase)} USDT`}
                      </button>
                    )}
                  </ActionStep>
                  <ActionStep n="Step 2" title="Create stream" phase={createPhase} error={state('Create stream').error} doneText="Created"
                    hint={approved ? 'Starts the clock. You can pause or cancel any time.' : 'Available once USDT is approved.'}>
                    <button className="btn btn-primary btn-block" disabled={!!pending || !approved || problems.length > 0} onClick={create}>Create stream</button>
                  </ActionStep>
                </div>
              )}
              {mounted && isConnected && problems.length > 0 && (
                <ul className="small neg" style={{ margin: 0, paddingLeft: 'var(--s-5)' }}>
                  {problems.map((p) => <li key={p}>{p}</li>)}
                </ul>
              )}
              {allowance > 0n && allowance !== maxUint256 && !approved && (
                <p className="small muted">You currently allow {fmtUsdt(allowance)} USDT.</p>
              )}
            </div>
          </section>
        </div>

        <aside className="aside">
          <div className="aside-panel card-pad stack">
            <StreamMeter variant="thin" meter={preview} ratePerSec={ratePerSec} flowing label="Agent can use after one hour" />
            <dl className="kv">
              <dt>Per hour</dt><dd>{fmtUsdt(ratePerSec * 3600n)} USDT</dd>
              <dt>Budget cap</dt><dd>{maxTotalBase > 0n ? `${fmtUsdt(maxTotalBase)} USDT` : 'Allowance only'}</dd>
              <dt>Fully streamed in</dt><dd>{hours != null ? (hours >= 48 ? `${(hours / 24).toFixed(1)} days` : hours < 1 ? `${Math.round(hours * 60)} min` : `${hours.toFixed(1)} hours`) : 'Open-ended'}</dd>
              <dt>Wallet balance</dt><dd>{balance !== undefined ? `${fmtUsdt(balance)} USDT` : '—'}</dd>
            </dl>
          </div>
        </aside>
      </div>
    </>
  );
}

function ActionStep({ n, title, hint, phase, error, doneText, children }: { n: string; title: string; hint: string; phase: Phase; error?: string; doneText: string; children: React.ReactNode }) {
  const status =
    phase === 'wallet' ? <><Spinner />Confirm in your wallet</> :
    phase === 'confirming' ? <><Spinner />Confirming on-chain</> :
    phase === 'done' ? <>✓ {doneText}</> :
    phase === 'error' ? <>{error}</> : null;
  return (
    <div className="action" data-phase={phase}>
      <div className="action-top"><span className="action-n">{n}</span></div>
      <span className="strong">{title}</span>
      <span className="small muted">{hint}</span>
      <span className={`action-status${phase === 'done' ? ' ok' : phase === 'error' ? ' err' : ''}`} role="status">{status}</span>
      {children}
    </div>
  );
}
