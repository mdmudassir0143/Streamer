import { Check, ChartLine, ShieldCheck, Zap } from 'lucide-react';
import { hskMainnet } from '@/lib/chains';

// The first real Hashtream trade on HashKey Chain mainnet (stream #2), as the agent logged it.
export const FIRST_TRADE_TX = '0x210b92ffbc1daa31117ee06414285ef9e4d5631f57cd55dd902fa9634ca535f9';
export const FIRST_TRADE_URL = `${hskMainnet.blockExplorers.default.url}/tx/${FIRST_TRADE_TX}`;

const CHECKS = ['Stream is live', 'Inside max trade size', 'Cooldown passed', 'Enough balance', 'Price within 2% of TWAP'];

export function DecisionShowcase() {
  return (
    <figure className="decision">
      <ol className="decision-steps">
        <li>
          <span className="decision-role"><ChartLine size={15} strokeWidth={2} />Analyst</span>
          <p>ETH on HSKSwap is about 1% cheaper than on Coinbase and Gate. <strong>Buy ETH, conviction 0.33.</strong></p>
        </li>
        <li>
          <span className="decision-role"><ShieldCheck size={15} strokeWidth={2} />Risk officer</span>
          <ul className="decision-checks">
            {CHECKS.map((c) => <li key={c}><Check size={13} strokeWidth={2.5} aria-hidden />{c}</li>)}
          </ul>
          <p><strong>Approved.</strong></p>
        </li>
        <li>
          <span className="decision-role"><Zap size={15} strokeWidth={2} />Executor</span>
          <p>Swapped <strong>0.05 USDT for 0.0000223 WETH</strong> on HSKSwap. The hash of this reasoning went on-chain with the trade.</p>
        </li>
      </ol>
      <figcaption>
        <span className="dot-live" aria-hidden />Hashtream&apos;s first trade on HashKey Chain mainnet.{' '}
        <a className="link" href={FIRST_TRADE_URL} target="_blank" rel="noreferrer">View it on the explorer</a>
      </figcaption>
    </figure>
  );
}
