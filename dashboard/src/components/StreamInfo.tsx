'use client';
import { useState } from 'react';
import type { Position } from '@/lib/agentApi';
import { explorerAddress } from '@/lib/chains';
import { fmtDuration, fmtPct, fmtUsdt, shortAddr } from '@/lib/format';
import type { StreamView } from '@/lib/stream';
import { Positions } from './Positions';
import { PricePanel } from './PricePanel';
import { Tabs } from './ui';

type T = 'positions' | 'limits' | 'prices';

export function StreamInfo({ stream: s, equity, allowance, apiPositions }: { stream: StreamView; equity: bigint; allowance?: bigint; apiPositions?: Position[] }) {
  const [tab, setTab] = useState<T>('positions');
  const r = s.risk;
  const ddFloor = s.highWaterMark > 0n && r.maxDrawdownBps > 0 ? (s.highWaterMark * BigInt(10000 - r.maxDrawdownBps)) / 10000n : 0n;
  const agentLink = explorerAddress(s.agent);
  return (
    <section className="card" aria-label="Stream details">
      <div className="card-head">
        <Tabs label="Stream details" value={tab} onChange={setTab}
          tabs={[{ id: 'positions', label: 'Positions' }, { id: 'limits', label: 'Limits' }, { id: 'prices', label: 'Prices' }]} />
      </div>
      <div className="card-body">
        {tab === 'positions' && <Positions id={s.id} apiPositions={apiPositions} />}
        {tab === 'limits' && (
          <dl className="kv">
            <dt>Equity</dt><dd>{fmtUsdt(equity)} USDT</dd>
            <dt>High-water mark</dt><dd>{fmtUsdt(s.highWaterMark)} USDT</dd>
            <dt>Drawdown breaker</dt><dd>{r.maxDrawdownBps > 0 ? `${fmtPct(r.maxDrawdownBps / 100)}${ddFloor > 0n ? `, trips below ${fmtUsdt(ddFloor)}` : ''}` : 'Off'}</dd>
            <dt>Max trade</dt><dd>{fmtPct(r.maxTradeBps / 100)} of equity</dd>
            <dt>Max slippage</dt><dd>{fmtPct(r.maxSlippageBps / 100)}</dd>
            <dt>Cooldown</dt><dd>{fmtDuration(r.cooldownSec)}</dd>
            <dt>Cap</dt><dd>{s.maxTotal > 0n ? `${fmtUsdt(s.maxTotal)} USDT` : 'None'}</dd>
            <dt>Allowance left</dt><dd>{allowance !== undefined ? `${fmtUsdt(allowance)} USDT` : '—'}</dd>
            <dt>Agent</dt><dd>{agentLink ? <a className="link mono" href={agentLink} target="_blank" rel="noreferrer">{shortAddr(s.agent)}</a> : <span className="mono">{shortAddr(s.agent)}</span>}</dd>
          </dl>
        )}
        {tab === 'prices' && <PricePanel />}
      </div>
    </section>
  );
}
