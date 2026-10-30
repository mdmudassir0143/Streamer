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
export function StreamMeter({ meter, ratePerSec, flowing, variant = 'panel', label = 'Worst-case loss right now' }: Props) {
  const { unstreamed, exposed, returned, openEnded } = meter;
  const total = unstreamed + exposed + returned;
  const share = (v: bigint) => (total === 0n ? 0 : Number((v * 100000n) / total) / 1000);
  const grow = (v: bigint) => (v === 0n ? 0 : Math.max(share(v), 1.5));
  const walletVal = openEnded && unstreamed === 0n ? 'Open' : fmtUsdt(unstreamed);

  const segs = [
    { k: 'wallet', name: 'In your wallet', val: walletVal, v: unstreamed, note: openEnded ? 'Bounded by your allowance' : 'Not streamed yet' },
    { k: 'exposed', name: 'Agent can trade', val: variant === 'thin' ? fmtUsdt(exposed) : fmtTick(exposed), v: exposed, note: `+${fmtTick(ratePerSec)} USDT each second` },
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
      <div className="pipe-wrap thin">
        <div>
          <div className="worst-label">{label}</div>
          <div className="worst-figure"><Num>{fmtTick(exposed)}</Num><span className="unit">USDT</span></div>
        </div>
        {pipe}
        <div className="thin-legend">
          {segs.map((s) => (
            <div key={s.k}>
              <div className="pipe-name"><span className={`sw ${s.k}`} />{s.k === 'wallet' ? 'Wallet' : s.k === 'exposed' ? 'Exposed' : 'Back'}</div>
              <div className="pipe-val"><Num>{s.k === 'exposed' ? fmtUsdt(exposed) : s.val}</Num></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={`pipe-wrap ${variant}`}>
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
        {segs.map((s) => <div key={s.k} className="pipe-cell pipe-val" style={{ flexGrow: cellGrow(s.v) }}><span><Num>{s.val}</Num></span></div>)}
      </div>
      {pipe}
      <div className="pipe-row">
        {segs.map((s) => (
          <div key={s.k} className="pipe-cell" style={{ flexGrow: cellGrow(s.v) }}>
            <span className="pipe-name"><span className={`sw ${s.k}`} />{s.name}</span>
            <span className="pipe-val-inline"><Num>{s.val}</Num></span>
            {variant === 'hero' && <span className="pipe-note">{s.note}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
