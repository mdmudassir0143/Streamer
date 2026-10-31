'use client';
import { useCallback, useId, useState } from 'react';
import { ShieldCheck, Zap } from 'lucide-react';
import { AnimatedNumber } from './AnimatedNumber';

const BUDGETS = [1_000, 10_000, 50_000];
const RATES = [1, 10, 50];

const fmt = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: n < 10 ? 2 : 0 });
const fmtHours = (h: number) => {
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'}`;
  const d = h / 24;
  return `${d.toFixed(h % 24 ? 1 : 0)} day${d === 1 ? '' : 's'}`;
};

/** Pick a budget, a stream speed and a time: see what stays in your wallet vs what the agent can use. */
export function SafetyCalculator() {
  const [budget, setBudget] = useState(10_000);
  const [rate, setRate] = useState(10);
  const [hours, setHours] = useState(3);
  const sliderId = useId();

  const working = Math.min(budget, rate * hours);
  const safe = budget - working;
  const safePct = (safe / budget) * 100;
  const fmtUsdt = useCallback((n: number) => fmt(Math.round(n * 100) / 100), []);
  const fmtPct = useCallback((n: number) => `${n.toFixed(1)}%`, []);

  return (
    <div className="calc">
      <div className="calc-controls">
        <div className="calc-field">
          <span className="field-label">Your trading budget</span>
          <div className="segmented" role="group" aria-label="Trading budget">
            {BUDGETS.map((d) => (
              <button key={d} type="button" aria-pressed={budget === d} onClick={() => setBudget(d)}>{fmt(d)} USDT</button>
            ))}
          </div>
        </div>
        <div className="calc-field">
          <span className="field-label">Stream speed</span>
          <div className="segmented" role="group" aria-label="Stream speed">
            {RATES.map((r) => (
              <button key={r} type="button" aria-pressed={rate === r} onClick={() => setRate(r)}>{r} USDT/h</button>
            ))}
          </div>
        </div>
        <div className="calc-field calc-time">
          <label className="field-label" htmlFor={sliderId}>After <strong>{fmtHours(hours)}</strong></label>
          <input id={sliderId} className="calc-slider" type="range" min={1} max={168} value={hours}
            onChange={(e) => setHours(Number(e.target.value))} style={{ ['--p' as string]: `${((hours - 1) / 167) * 100}%` }} />
        </div>
      </div>

      <div className="calc-out" aria-live="polite">
        <div className="calc-tile calc-tile-safe">
          <span className="calc-tile-label"><ShieldCheck size={16} strokeWidth={2} />Still safe in your wallet</span>
          <span className="calc-big"><AnimatedNumber value={safe} format={fmtUsdt} /><small>USDT</small></span>
          <span className="calc-tile-sub"><AnimatedNumber value={safePct} format={fmtPct} /> of your budget never left you</span>
        </div>
        <div className="calc-tile">
          <span className="calc-tile-label"><Zap size={16} strokeWidth={2} />Working with your agent</span>
          <span className="calc-big calc-big-sm"><AnimatedNumber value={working} format={fmtUsdt} /><small>USDT</small></span>
          <span className="calc-tile-sub">{rate} USDT an hour for {fmtHours(hours)}</span>
        </div>
      </div>

      <div className="calc-split" aria-hidden>
        <div className="calc-split-safe" style={{ flexGrow: Math.max(safe, 0.0001) }} />
        <div className="calc-split-work" style={{ flexGrow: Math.max(working, budget * 0.006) }} />
      </div>

      <p className="calc-verdict">
        {safe > 0
          ? <>A typical trading bot would hold all <strong>{fmt(budget)} USDT</strong> from the first second. With Hashtream, it gets a little at a time, and you can stop it whenever you want.</>
          : <>By now your whole budget has streamed in. That is exactly why every stream has a cap: it stops there.</>}
      </p>
    </div>
  );
}
