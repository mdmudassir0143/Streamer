'use client';
import { useEffect, useState } from 'react';
import { Bot, Check, Droplets, Power, SlidersHorizontal } from 'lucide-react';

/** Four steps, each with a small live visual. The switch in step 4 really stops the flow in step 2. */
export function HowItWorks() {
  const [on, setOn] = useState(true);
  const [arrived, setArrived] = useState(0.0);

  useEffect(() => {
    if (!on) return;
    const t = setInterval(() => setArrived((a) => +(a + 0.0014).toFixed(4)), 1000);
    return () => clearInterval(t);
  }, [on]);

  return (
    <ol className="how">
      <li className="how-card" data-animate>
        <div className="how-top"><span className="how-n">1</span><SlidersHorizontal size={18} strokeWidth={1.75} /></div>
        <h3 className="h4">Pick a speed and a limit</h3>
        <p>Say 5 USDT an hour, up to 100 USDT. You approve once from your wallet.</p>
        <div className="how-vis how-vis-set">
          <span className="how-chip how-chip-on">5 USDT / hour</span>
          <span className="how-chip">Limit 100 USDT</span>
        </div>
      </li>

      <li className="how-card" data-animate>
        <div className="how-top"><span className="how-n">2</span><Droplets size={18} strokeWidth={1.75} /></div>
        <h3 className="h4">Money moves in every second</h3>
        <p>A tiny amount leaves your wallet each second. The rest doesn&apos;t move.</p>
        <div className={`how-vis how-vis-flow${on ? '' : ' paused'}`}>
          <div className="how-flow-bar"><span /></div>
          <div className="how-flow-num"><span className="mono">+{arrived.toFixed(4)}</span> USDT arrived{on ? '' : ', stopped'}</div>
        </div>
      </li>

      <li className="how-card" data-animate>
        <div className="how-top"><span className="how-n">3</span><Bot size={18} strokeWidth={1.75} /></div>
        <h3 className="h4">Your agent trades only that</h3>
        <p>It looks at prices, checks your limits, then trades with what has arrived. Nothing more.</p>
        <div className="how-vis how-vis-trade">
          <div className="how-trade"><Check size={14} strokeWidth={2.5} />Bought ETH with 0.05 USDT</div>
          <div className="how-trade how-trade-muted">Skipped: not enough money yet</div>
        </div>
      </li>

      <li className="how-card" data-animate>
        <div className="how-top"><span className="how-n">4</span><Power size={18} strokeWidth={1.75} /></div>
        <h3 className="h4">Stop whenever you want</h3>
        <p>Flip it off and the flow stops. Cancel and everything comes back to your wallet.</p>
        <div className="how-vis how-vis-stop">
          <button type="button" role="switch" aria-checked={on} className="how-switch" onClick={() => setOn((v) => !v)}>
            <span className="how-switch-knob" />
          </button>
          <span className="how-switch-label">{on ? 'Streaming. Try turning it off' : 'Stopped. Your money stays put'}</span>
        </div>
      </li>
    </ol>
  );
}
