'use client';
import type { Meter } from '@/lib/stream';
import { fmtTick, fmtUsdt, ratePerHour } from '@/lib/format';
import { Bot, Pause, Wallet } from 'lucide-react';
import { Num } from './ui';

type Variant = 'hero' | 'panel' | 'thin';
interface Props {
  meter: Meter;
  ratePerSec: bigint;
  flowing: boolean;
  variant?: Variant;
  label?: string;
  /** Why the stream isn't flowing (Paused, Cancelled…). Shown in the status pill. */
  statusLabel?: string;
}

/** The flow pipe: in your wallet → agent can trade (liquid) → back to you. Ticks every second. */
/** Static mini pipe for illustrations (no numbers). */
export function MiniPipe({ parts = [55, 30, 15] }: { parts?: [number, number, number] }) {
  return (
    <div className="pipe-wrap pipe-mini" aria-hidden>
      <div className="pipe">
        <div className="pipe-seg wallet" style={{ flexGrow: parts[0] }} />
        <div className="pipe-seg exposed" style={{ flexGrow: parts[1] }} />
        <div className="pipe-seg back" style={{ flexGrow: parts[2] }} />
      </div>
    </div>
  );
}

export function StreamMeter({ meter, ratePerSec, flowing, variant = 'panel', label = 'Your agent can use right now', statusLabel }: Props) {
  const { unstreamed, exposed, returned, openEnded } = meter;
  const total = unstreamed + exposed + returned;
  const share = (v: bigint) => (total === 0n ? 0 : Number((v * 100000n) / total) / 1000);
  const grow = (v: bigint) => (v === 0n ? 0 : Math.max(share(v), 1.5));
  const walletVal = openEnded && unstreamed === 0n ? 'Open' : fmtUsdt(unstreamed);

  const segs = [
    { k: 'wallet', name: 'In your wallet', val: walletVal, v: unstreamed, note: openEnded ? 'Bounded by your allowance' : 'Not streamed yet' },
    { k: 'exposed', name: 'Agent can trade', val: variant === 'thin' ? fmtUsdt(exposed) : variant === 'panel' ? '' : fmtTick(exposed), v: exposed, note: `+${fmtTick(ratePerSec)} USDT each second` },
    { k: 'back', name: 'Back to you', val: fmtUsdt(returned), v: returned, note: 'Withdrawn or cancelled' },
  ];

  const pipe = (
    <div className="pipe" role="img" aria-label={`${fmtUsdt(unstreamed)} USDT in your wallet, ${fmtUsdt(exposed)} USDT the agent can trade, ${fmtUsdt(returned)} USDT back to you`}>
      {segs.map((s) => s.v > 0n && (
        <div key={s.k} className={`pipe-seg ${s.k}${s.k === 'exposed' && !flowing ? ' still' : ''}`} style={{ flexGrow: grow(s.v) }} />
      ))}
    </div>
  );

  if (variant === 'thin') {
    return (
      <div className="pipe-wrap pipe-thin">
        <div>
          <div className="worst-label">{label}</div>
          <div className="worst-figure"><Num>{fmtTick(exposed)}</Num><span className="unit">USDT</span></div>
        </div>
        {pipe}
        <div className="grid-3">
          <div>
            <div className="pipe-name"><span className="sw wallet" />Remaining</div>
            <div className="pipe-val"><Num>{walletVal}</Num></div>
          </div>
          <div>
            <div className="pipe-name"><span className="sw exposed" />Flowing in</div>
            <div className="pipe-val"><Num>{`${ratePerHour(ratePerSec)}/h`}</Num></div>
          </div>
          <div>
            <div className="pipe-name"><span className="sw back" />Back to you</div>
            <div className="pipe-val"><Num>{fmtUsdt(returned)}</Num></div>
          </div>
        </div>
      </div>
    );
  }

  const pct = (v: bigint) => (total === 0n ? '0%' : `${share(v) < 1 && v > 0n ? '<1' : Math.round(share(v))}%`);
  const state = flowing ? 'Streaming' : statusLabel ?? 'Not flowing';

  return (
    <div className={`flow flow-${variant}${flowing ? '' : ' is-still'}`}>
      <div className="flow-head">
        <div>
          <div className="worst-label">{label}</div>
          <div className="worst-figure">
            <Num>{fmtTick(exposed)}</Num><span className="unit">USDT</span>
            {/* Re-keyed every tick so the "+x" floats up once per second while flowing. */}
            {flowing && ratePerSec > 0n && <span key={fmtTick(exposed)} className="flow-tick" aria-hidden>+{fmtTick(ratePerSec)}</span>}
          </div>
        </div>
        <div className="flow-status">
          <span className={`flow-pill${flowing ? ' on' : ''}`}><span className="flow-pill-dot" />{state}</span>
          <span className="flow-rate"><b><Num>{ratePerHour(ratePerSec)}</Num> USDT/h</b><span>{fmtTick(ratePerSec)} USDT every second</span></span>
        </div>
      </div>

      <div className="flow-lane" role="img" aria-label={`${fmtUsdt(unstreamed)} USDT in your wallet streaming to the agent at ${ratePerHour(ratePerSec)} USDT an hour; the agent can trade ${fmtUsdt(exposed)} USDT`}>
        <div className="flow-node">
          <span className="flow-icon"><Wallet size={18} strokeWidth={1.8} /></span>
          <span className="flow-node-label">In your wallet</span>
          <b className="flow-node-val"><Num>{walletVal}</Num></b>
        </div>
        <div className="flow-channel" aria-hidden>
          <div className="flow-coins">{Array.from({ length: 7 }, (_, i) => <span key={i} style={{ animationDelay: `${(-i * 2.4) / 7}s` }}>$</span>)}</div>
          {!flowing && <span className="flow-stopped"><Pause size={12} strokeWidth={2.5} />{state}</span>}
        </div>
        <div className="flow-node flow-node-agent">
          <span className="flow-icon"><Bot size={18} strokeWidth={1.8} /></span>
          <span className="flow-node-label">Agent can use</span>
          <b className="flow-node-val"><Num>{fmtUsdt(exposed)}</Num></b>
        </div>
      </div>

      {pipe}
      <div className="flow-legend">
        {segs.map((s) => (
          <span key={s.k} className="pipe-name"><span className={`sw ${s.k}`} />{s.name}<b><Num>{s.k === 'exposed' ? fmtUsdt(exposed) : s.val}</Num></b><em>{pct(s.v)}</em></span>
        ))}
      </div>
    </div>
  );
}
