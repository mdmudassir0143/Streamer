'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAccount, useReadContracts, useWriteContract } from 'wagmi';
import { decodeEventLog, isAddress, maxUint256, parseUnits, type Address } from 'viem';
import { erc20Abi, streamVaultAbi } from '@/lib/abi';
import { useAgentOnline } from '@/lib/agentApi';
import { targetChain } from '@/lib/chains';
import { ASSETS, deployment, type AssetSymbol } from '@/lib/deployments';
import { fmtTick, fmtUsdt } from '@/lib/format';
import { MODE_AGENT, MODE_INVEST, RISK_PRESETS, type RiskPreset } from '@/lib/stream';
import { useTx } from '@/components/useTx';

type Unit = 'hour' | 'day';
const PRESET_COPY: Record<RiskPreset, string> = {
  Conservative: 'Small trades, tight slippage, halts at 5% drawdown.',
  Balanced: 'Moderate size, halts at 10% drawdown.',
  Aggressive: 'Bigger, faster trades, halts at 20% drawdown.',
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
  const [durUnit, setDurUnit] = useState<Unit>('hour');
  const [maxTotal, setMaxTotal] = useState('');
  const [preset, setPreset] = useState<RiskPreset>('Balanced');
  const [cap, setCap] = useState('');
  const [capTouched, setCapTouched] = useState(false);

  useEffect(() => {
    if (health?.agentAddress && !agent) setAgent(health.agentAddress);
  }, [health, agent]);

  const rateBase = safeParse(rate);
  const ratePerSec = rateBase / (unit === 'hour' ? 3600n : 86400n);
  const durationSec = openEnded ? 0n : BigInt(Math.max(0, Math.floor(Number(duration || '0') * (durUnit === 'hour' ? 3600 : 86400))));
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
  const { run, pending } = useTx();

  const target: Address | undefined = deployment.tokens[asset];
  const agentAddr = mode === MODE_INVEST ? (address ?? '0x0000000000000000000000000000000000000000') : agent;
  const approved = capBase > 0n && allowance >= capBase;

  const problems = useMemo(() => {
    const p: string[] = [];
    if (!vault || !usdt) p.push(`No vault/USDT deployment for chain ${targetChain.id}.`);
    if (ratePerSec === 0n) p.push('Rate is too small. It must be at least 0.000001 USDT per second.');
    if (mode === MODE_AGENT && !isAddress(agent)) p.push(online ? 'Enter the agent address.' : 'Agent offline: paste the agent address manually.');
    if (!target) p.push(`${asset} isn't deployed on this chain.`);
    if (capBase === 0n) p.push('Set an allowance cap. Open-ended streams need one so you control the ceiling.');
    if (!openEnded && durationSec === 0n) p.push('Enter a duration, or choose open-ended.');
    return p;
  }, [vault, usdt, ratePerSec, mode, agent, online, target, asset, capBase, openEnded, durationSec]);

  async function approve() {
    if (!usdt || !vault) return;
    await run('Approve USDT', () => writeContractAsync({ address: usdt, abi: erc20Abi, functionName: 'approve', args: [vault, capBase], chainId: targetChain.id }),
      `Approved: the vault may pull up to ${fmtUsdt(capBase)} USDT, only as it streams`);
    reads.refetch();
  }

  async function create() {
    if (!vault || !usdt || !target) return;
    const risk = RISK_PRESETS[preset];
    const receipt = await run('Create stream', () => writeContractAsync({
      address: vault, abi: streamVaultAbi, functionName: 'createStream', chainId: targetChain.id,
      args: [agentAddr as Address, usdt, target, mode, ratePerSec, durationSec, maxTotalBase, risk],
    }), 'Stream created. It is flowing now.');
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

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Start a stream</h1>
          <p className="muted" style={{ margin: '4px 0 0', maxWidth: '60ch' }}>Your USDT stays in your wallet. The vault pulls it a little each second, and never more than the cap you approve.</p>
        </div>
      </div>
      <div className="new-layout">
        <div className="form">
          <div className="field">
            <span className="field-label">Mode</span>
            <div className="option-grid">
              <button type="button" className="option" aria-pressed={mode === MODE_AGENT} onClick={() => setMode(MODE_AGENT)}>
                <span className="option-title">AI agent</span>
                <span className="option-desc">An analyst and a risk officer decide trades inside the limits you set.</span>
              </button>
              <button type="button" className="option" aria-pressed={mode === MODE_INVEST} onClick={() => setMode(MODE_INVEST)}>
                <span className="option-title">Invest</span>
                <span className="option-desc">Buy one asset continuously, second by second. No model involved.</span>
              </button>
            </div>
          </div>

          {mode === MODE_AGENT ? (
            <label className="field">
              <span className="field-label">Agent address</span>
              <input className="input mono" value={agent} onChange={(e) => setAgent(e.target.value)} placeholder="0x…" spellCheck={false} />
              <span className="field-hint">{online ? 'Filled in from the StreamPilot agent. It can trade, never withdraw.' : agentLoading ? 'Asking the agent for its address…' : 'Agent offline. Paste the agent address to continue.'}</span>
            </label>
          ) : null}

          <div className="field">
            <span className="field-label">{mode === MODE_AGENT ? 'Default asset' : 'Asset to buy'}</span>
            <div><div className="segmented" role="group">
              {ASSETS.map((a) => (
                <button key={a} type="button" aria-pressed={asset === a} onClick={() => setAsset(a)}>{a}</button>
              ))}
            </div></div>
          </div>

          <div className="field">
            <span className="field-label">Rate</span>
            <div className="input-row">
              <input className="input mono" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} aria-label="Rate in USDT" />
              <div className="segmented" role="group">
                <button type="button" aria-pressed={unit === 'hour'} onClick={() => setUnit('hour')}>USDT / hour</button>
                <button type="button" aria-pressed={unit === 'day'} onClick={() => setUnit('day')}>USDT / day</button>
              </div>
            </div>
            <span className="field-hint">{perSec} USDT per second ({ratePerSec.toString()} base units).</span>
          </div>

          <div className="field">
            <span className="field-label">Duration</span>
            <div className="input-row">
              <input className="input mono" inputMode="decimal" value={openEnded ? '' : duration} disabled={openEnded} onChange={(e) => setDuration(e.target.value)} aria-label="Duration" placeholder={openEnded ? 'Open-ended' : ''} />
              <div className="segmented" role="group">
                <button type="button" aria-pressed={!openEnded && durUnit === 'hour'} onClick={() => { setOpenEnded(false); setDurUnit('hour'); }}>Hours</button>
                <button type="button" aria-pressed={!openEnded && durUnit === 'day'} onClick={() => { setOpenEnded(false); setDurUnit('day'); }}>Days</button>
                <button type="button" aria-pressed={openEnded} onClick={() => setOpenEnded(true)}>Open-ended</button>
              </div>
            </div>
          </div>

          <label className="field">
            <span className="field-label">Max total</span>
            <input className="input mono" inputMode="decimal" value={maxTotal} onChange={(e) => setMaxTotal(e.target.value)} placeholder={plannedTotal > 0n ? `${fmtUsdt(plannedTotal).replace(/,/g, '')} (rate × duration)` : 'No cap'} />
            <span className="field-hint">The vault never pulls more than this in total. Leave empty to use rate × duration.</span>
          </label>

          <div className="field">
            <span className="field-label">Risk limits</span>
            <span className="field-hint" style={{ marginTop: -4 }}>Enforced by the contract on every trade.</span>
            <div className="option-grid">
              {(Object.keys(RISK_PRESETS) as RiskPreset[]).map((k) => {
                const r = RISK_PRESETS[k];
                return (
                  <button key={k} type="button" className="option" aria-pressed={preset === k} onClick={() => setPreset(k)}>
                    <span className="option-title">{k}</span>
                    <span className="option-desc">{PRESET_COPY[k]}</span>
                    <span className="option-desc mono" style={{ fontSize: 12 }}>Slippage {r.maxSlippageBps / 100}%, trade ≤{r.maxTradeBps / 100}%, cooldown {r.cooldownSec / 60}m</span>
                  </button>
                );
              })}
            </div>
          </div>

          <label className="field">
            <span className="field-label">Allowance cap</span>
            <input className="input mono" inputMode="decimal" value={cap} onChange={(e) => { setCapTouched(true); setCap(e.target.value); }} placeholder="USDT" />
            <span className="field-hint">The most the vault can ever pull from your wallet. Revoke it any time to stop the stream at the source.</span>
          </label>
        </div>

        <aside className="aside">
          <section className="card">
            <div className="card-head"><h2 className="h4">Exposure</h2></div>
            <div className="card-body stack">
              <dl className="kv">
                <dt>Per second</dt><dd>{perSec} USDT</dd>
                <dt>Per hour</dt><dd>{fmtUsdt(ratePerSec * 3600n)} USDT</dd>
                <dt>Cap</dt><dd>{maxTotalBase > 0n ? `${fmtUsdt(maxTotalBase)} USDT` : 'Allowance only'}</dd>
                <dt>Fully streamed in</dt><dd>{hours != null ? (hours >= 48 ? `${(hours / 24).toFixed(1)} days` : `${hours.toFixed(1)} hours`) : 'Open-ended'}</dd>
                <dt>Wallet balance</dt><dd>{balance !== undefined ? `${fmtUsdt(balance)} USDT` : '—'}</dd>
              </dl>
              <p className="small muted" style={{ margin: 0 }}>After one hour the agent can reach at most {fmtUsdt(ratePerSec * 3600n)} USDT. The rest stays in your wallet.</p>
            </div>
          </section>

          <section className="card">
            <div className="card-body stack">
              <ol className="steps-v">
                <li>
                  <span className={`step-dot${approved ? ' done' : ''}`}>{approved ? '✓' : '1'}</span>
                  <div className="stack" style={{ gap: 6 }}>
                    <span className="h4">Approve USDT</span>
                    <span className="small muted">Lets the vault pull up to {fmtUsdt(capBase)} USDT as it streams. Nothing moves yet.</span>
                    {mounted && isConnected && !approved && (
                      <button className="btn" disabled={!!pending || capBase === 0n || !vault} onClick={approve}>
                        {pending === 'Approve USDT' ? 'Approving…' : `Approve ${fmtUsdt(capBase)} USDT`}
                      </button>
                    )}
                  </div>
                </li>
                <li>
                  <span className="step-dot">2</span>
                  <div className="stack" style={{ gap: 6 }}>
                    <span className="h4">Create stream</span>
                    <span className="small muted">Starts the clock. Pause, change the rate or cancel whenever you like.</span>
                    {mounted && isConnected && (
                      <button className="btn btn-primary" disabled={!!pending || !approved || problems.length > 0} onClick={create}>
                        {pending === 'Create stream' ? 'Creating…' : 'Create stream'}
                      </button>
                    )}
                  </div>
                </li>
              </ol>
              {mounted && !isConnected && <div className="notice">Connect your wallet to approve and create.</div>}
              {mounted && isConnected && problems.length > 0 && (
                <ul className="small neg" style={{ margin: 0, paddingLeft: 18 }}>
                  {problems.map((p) => <li key={p}>{p}</li>)}
                </ul>
              )}
              {allowance > 0n && allowance !== maxUint256 && (
                <p className="small faint" style={{ margin: 0 }}>Current allowance: {fmtUsdt(allowance)} USDT</p>
              )}
            </div>
          </section>
        </aside>
      </div>
    </>
  );
}
