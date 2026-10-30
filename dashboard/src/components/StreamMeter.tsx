'use client';
import type { Meter } from '@/lib/stream';
import { fmtTick, fmtUsdt, ratePerHour } from '@/lib/format';

interface Props {
  meter: Meter;
  ratePerSec: bigint;
  flowing: boolean;
  compact?: boolean;
  label?: string;
}

/** Wallet (neutral) → exposed (accent) → returned (soft neutral), ticking every second. */
export function StreamMeter({ meter, ratePerSec, flowing, compact, label = 'Worst-case loss right now' }: Props) {
  const { unstreamed, exposed, returned, openEnded } = meter;
  const total = unstreamed + exposed + returned;
  const share = (v: bigint) => (total === 0n ? 0 : Number((v * 100000n) / total) / 1000);
  const grow = (v: bigint) => (v === 0n ? 0 : Math.max(share(v), 1.5));

  return (
    <div className={`meter${compact ? ' compact' : ''}`}>
      <div className="meter-head">
        <div>
          <div className="stat-label">{label}</div>
          <div className="meter-figure">{fmtTick(exposed)}<span className="unit">USDT</span></div>
        </div>
        {!compact && (
          <div className="meter-rate">
            <div className="stat-label">{flowing ? 'Streaming' : 'Not flowing'}</div>
            <div className="mono">{ratePerHour(ratePerSec)} <span className="muted small">USDT/h</span></div>
          </div>
        )}
      </div>

      <div className="track" role="img" aria-label={`${fmtUsdt(unstreamed)} USDT in wallet, ${fmtUsdt(exposed)} USDT exposed, ${fmtUsdt(returned)} USDT returned`}>
        {unstreamed > 0n && <div className="seg seg-wallet" style={{ flexGrow: grow(unstreamed) }} />}
        {exposed > 0n && <div className={`seg seg-exposed${flowing ? '' : ' still'}`} style={{ flexGrow: grow(exposed) }} />}
        {returned > 0n && <div className="seg seg-returned" style={{ flexGrow: grow(returned) }} />}
      </div>

      <div className="legend">
        <div className="legend-item">
          <span className="legend-key"><span className="swatch wallet" />{compact ? 'Wallet' : 'In your wallet'}</span>
          <span className="legend-val">{openEnded && unstreamed === 0n ? 'Open' : fmtUsdt(unstreamed)}</span>
          {!compact && <span className="legend-note">{openEnded ? 'Open-ended, bounded by your allowance' : 'Not streamed yet'}</span>}
        </div>
        <div className="legend-item">
          <span className="legend-key"><span className="swatch exposed" />{compact ? 'Exposed' : 'Agent can trade'}</span>
          <span className="legend-val">{fmtUsdt(exposed)}</span>
          {!compact && <span className="legend-note">+{fmtTick(ratePerSec)} USDT per second</span>}
        </div>
        <div className="legend-item">
          <span className="legend-key"><span className="swatch returned" />Returned</span>
          <span className="legend-val">{fmtUsdt(returned)}</span>
          {!compact && <span className="legend-note">Withdrawn back to you</span>}
        </div>
      </div>
    </div>
  );
}
