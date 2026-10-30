import Link from 'next/link';
import { DemoMeter } from '@/components/DemoMeter';
import { Footer } from '@/components/Footer';
import { LandingNav } from '@/components/Nav';
import { ProtocolStats } from '@/components/ProtocolStats';
import { Badge } from '@/components/ui';

const STEPS = [
  { t: 'Stream USDT per second', d: 'Pick a rate, a duration and a cap. Approve once. Your USDT stays in your wallet and moves to the vault a little each second.' },
  { t: 'The agent trades the streamed balance', d: 'The agent can only trade what has already arrived in the vault. Everything still in your wallet is out of its reach.' },
  { t: 'Pause, cancel or revoke', d: 'Pause stops the flow. Cancel sends every token back to you in one transaction. Revoking the allowance cuts the stream off at the source.' },
];

const LIMITS = [
  { t: 'Slippage vs TWAP', d: 'Every trade sets a minimum output from a manipulation-resistant venue quote. Looser trades revert.' },
  { t: 'Max trade size', d: 'A single trade can only use a set share of the stream’s equity.' },
  { t: 'Drawdown breaker', d: 'If equity falls a set percentage below its high, trading halts until you resume it.' },
  { t: 'Cooldown', d: 'A minimum wait between trades stops the agent from churning your balance.' },
];

export default function Landing() {
  return (
    <>
      <LandingNav />
      <main className="container">
        <section className="hero">
          <div className="hero-copy">
            <h1 className="h1">Your AI trader can only touch what you&apos;ve streamed.</h1>
            <p className="lead">
              StreamPilot moves USDT from your wallet to an on-chain vault second by second. The agent trades only what has arrived,
              so your exposure is bounded by rate × time, not by your balance.
            </p>
            <div className="hero-cta">
              <Link href="/app" className="btn btn-primary btn-lg">Launch app</Link>
              <a href="#how" className="btn btn-ghost btn-lg">How it works</a>
            </div>
          </div>
          <div className="hero-visual"><DemoMeter /></div>
        </section>

        <section className="section" id="how">
          <div className="section-head">
            <h2 className="h2">How it works</h2>
            <p className="body">Three steps, all enforced by the StreamVault contract.</p>
          </div>
          <ol className="steps">
            {STEPS.map((s, i) => (
              <li key={s.t} className="card step">
                <span className="step-n">{String(i + 1).padStart(2, '0')}</span>
                <h3 className="h4">{s.t}</h3>
                <p className="muted" style={{ margin: 0 }}>{s.d}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="section" id="modes">
          <div className="section-head">
            <h2 className="h2">Two ways to stream</h2>
            <p className="body">Both modes use the same vault, the same limits and the same kill switch.</p>
          </div>
          <div className="grid-2">
            <article className="card feature">
              <h3 className="h3">AI agent</h3>
              <p>An analyst reads CEX and venue prices. A risk officer checks every proposal against your limits. An executor sends the trade.</p>
              <div className="pipeline">
                <Badge>Analyst</Badge><span className="arrow">→</span>
                <Badge>Risk officer</Badge><span className="arrow">→</span>
                <Badge tone="accent">Executor</Badge>
              </div>
              <p className="small">Each decision is hashed and the hash is written on-chain with the trade, so you can check the reasoning against what happened.</p>
            </article>
            <article className="card feature">
              <h3 className="h3">Invest</h3>
              <p>Per-second dollar-cost averaging. The streamed USDT is swapped into one asset as it arrives. No model in the loop.</p>
              <div className="pipeline">
                <Badge>ETH</Badge><Badge>BTC</Badge><Badge>HSK</Badge>
              </div>
              <p className="small">Swaps use the same slippage limit against the venue quote, through HSKSwap on mainnet.</p>
            </article>
          </div>
        </section>

        <section className="section" id="safety">
          <div className="section-head">
            <h2 className="h2">Limits the agent can&apos;t talk its way past</h2>
            <p className="body">The risk checks live in the contract, not in the prompt. A trade that breaks one reverts.</p>
          </div>
          <div className="grid-4">
            {LIMITS.map((l) => (
              <article key={l.t} className="card feature">
                <h3 className="h4">{l.t}</h3>
                <p className="small">{l.d}</p>
              </article>
            ))}
          </div>
          <ul className="check-list" style={{ marginTop: 32 }}>
            <li>Funds stay in your wallet until they stream. The vault pulls only what has accrued.</li>
            <li>The agent can trade inside the vault. It can never withdraw, and it is never the owner.</li>
            <li>Anything that changes the stream on-chain is a transaction you sign.</li>
          </ul>
        </section>

        <section className="section">
          <div className="section-head">
            <h2 className="h2">Worst case, compared</h2>
          </div>
          <div className="card compare">
            <div>
              <span className="muted">Vault trading bots</span>
              <div className="compare-figure">10,000 USDT</div>
              <div className="mini-track"><span style={{ width: '100%', background: 'var(--n-500)' }} /></div>
              <p className="small muted" style={{ margin: 0 }}>Deposit 10,000 and the whole deposit is at risk from the first block.</p>
            </div>
            <div>
              <span className="muted">StreamPilot</span>
              <div className="compare-figure">30 USDT</div>
              <div className="mini-track"><span style={{ width: '0.3%', minWidth: 6, background: 'var(--accent)' }} /></div>
              <p className="small muted" style={{ margin: 0 }}>Worst case = rate × time. At 10 USDT an hour, three hours in, the agent has touched at most 30.</p>
            </div>
          </div>
        </section>

        <section className="section">
          <div className="section-head">
            <h2 className="h2">Protocol, live from chain</h2>
            <p className="body">Read directly from the StreamVault contract.</p>
          </div>
          <ProtocolStats />
        </section>
      </main>
      <Footer />
    </>
  );
}
