'use client';
import type { Meter } from '@/lib/stream';
import { fmtTick, fmtUsdt, ratePerHour } from '@/lib/format';
import { Num } from './ui';

type Variant = 'hero' | 'panel' | 'thin';
interface Props {
  meter: Meter;
  ratePerSec: bigint;
  flowing: boolean;
  variant?: Variant;
  label?: string;
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

export function StreamMeter({ meter, ratePerSec, flowing, variant = 'panel', label = 'Worst-case loss right now' }: Props) {
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
  // Label cells follow the segment proportions; empty segments keep a small share so all three labels stay.
  const cellGrow = (v: bigint) => Math.max(grow(v), 12);

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
            <div className="pipe-name"><span className="sw wallet" />Wallet</div>
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

  return (
    <div className={`pipe-wrap pipe-${variant}`}>
      <div className="pipe-top">
        <div>
          <div className="worst-label">{label}</div>
          <div className="worst-figure"><Num>{fmtTick(exposed)}</Num><span className="unit">USDT</span></div>
        </div>
        <div className="pipe-rate">
          {flowing ? 'Streaming' : 'Not flowing'}
          <b><Num>{ratePerHour(ratePerSec)}</Num> USDT/h</b>
        </div>
      </div>
      <div className="pipe-row vals" aria-hidden>
        {segs.map((s) => <div key={s.k} className="pipe-cell pipe-val" style={{ flexGrow: cellGrow(s.v) }}>{s.val && <span><Num>{s.val}</Num></span>}</div>)}
      </div>
      {pipe}
      <div className="pipe-row">
        {segs.map((s) => (
          <div key={s.k} className="pipe-cell" style={{ flexGrow: cellGrow(s.v) }}>
            <span className="pipe-name"><span className={`sw ${s.k}`} />{s.name}</span>
            {s.val && <span className="pipe-val-inline"><Num>{s.val}</Num></span>}
            {variant === 'hero' && <span className="pipe-note">{s.note}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
