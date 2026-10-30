import Link from 'next/link';
import { DemoMeter } from '@/components/DemoMeter';
import { Footer } from '@/components/Footer';
import { LandingNav } from '@/components/Nav';
import { ProtocolStats } from '@/components/ProtocolStats';
import { Num } from '@/components/ui';

const STEPS = [
  { t: 'Stream USDT by the second', d: 'Pick a rate and a cap, then approve once. Your USDT stays in your wallet and moves to the vault a little each second.' },
  { t: 'The agent trades what has arrived', d: 'It can only use the balance already in the vault. Everything still in your wallet is out of its reach.' },
  { t: 'Pause, cancel or revoke', d: 'Pause stops the flow. Cancel sends every token back in one transaction. Revoking the allowance cuts it off at the source.' },
];

const RULES = [
  { t: 'Slippage vs TWAP', d: 'Every trade sets a minimum output from a manipulation-resistant venue quote. A looser trade reverts.' },
  { t: 'Max trade size', d: 'One trade can use only a set share of the stream’s equity.' },
  { t: 'Drawdown breaker', d: 'If equity drops a set percentage below its high, trading halts until you resume.' },
  { t: 'Cooldown', d: 'A minimum wait between trades stops the agent from churning your balance.' },
  { t: 'Funds stay with you', d: 'USDT leaves your wallet only as it streams. The vault pulls what has accrued, nothing more.' },
  { t: 'No withdrawals for the agent', d: 'The agent can trade inside the vault. It can never withdraw, and it is never the owner.' },
  { t: 'You sign every change', d: 'Rate, pause, cancel and risk changes are transactions from your wallet, even when the agent suggests them.' },
];

export default function Landing() {
  return (
    <>
      <LandingNav />
      <main className="container">
        <section className="hero">
          <h1 className="h1">Your AI trader can only touch what you&apos;ve streamed.</h1>
          <p className="lead">StreamPilot drips USDT into an on-chain vault on HashKey Chain, so the most you can lose is the rate times the time it has run.</p>
          <div className="hero-cta">
            <Link href="/app" className="btn btn-primary btn-lg">Launch app</Link>
            <a href="#how" className="btn btn-ghost btn-lg">Read how it works</a>
          </div>
          <div className="hero-pipe"><DemoMeter /></div>
        </section>

        <section className="section" id="how">
          <div className="section-head">
            <h2 className="h2">How it works</h2>
            <p className="body">Three steps, each enforced by the StreamVault contract.</p>
          </div>
          <div className="steps-line">
            <div className="rail" aria-hidden>
              <span style={{ flex: 1, background: 'var(--accent-tint)' }} />
              <span style={{ flex: 1, background: 'var(--accent)' }} />
              <span style={{ flex: 1, background: 'var(--ink-tint)' }} />
            </div>
            <ol className="steps">
              {STEPS.map((s, i) => (
                <li key={s.t} className="step">
                  <span className="step-n">{i + 1}</span>
                  <h3 className="h4">{s.t}</h3>
                  <p>{s.d}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="section" id="modes">
          <div className="section-head">
            <h2 className="h2">Two ways to stream</h2>
            <p className="body">Both use the same vault, the same limits and the same kill switch.</p>
          </div>
          <div className="split">
            <div>
              <h3 className="h3">AI agent</h3>
              <p>An analyst reads CEX and on-chain prices, a risk officer checks the proposal against your limits, and an executor sends the trade.</p>
              <div className="flow" aria-label="Analyst, then risk officer, then executor">
                <span>Analyst</span><span className="arrow" aria-hidden>→</span>
                <span>Risk officer</span><span className="arrow" aria-hidden>→</span>
                <span>Executor</span>
              </div>
              <p className="small">Each decision is hashed, and the hash goes on-chain with the trade, so you can check the reasoning against what happened.</p>
            </div>
            <div>
              <h3 className="h3">Invest</h3>
              <p>Per-second dollar-cost averaging into ETH, BTC or HSK. The USDT is swapped as it arrives, with no model in the loop.</p>
              <p className="small">Swaps use the same slippage limit against the venue quote, through HSKSwap on mainnet.</p>
            </div>
          </div>
        </section>

        <section className="section" id="safety">
          <div className="section-head">
            <h2 className="h2">Limits the agent can&apos;t argue with</h2>
            <p className="body">The checks live in the contract, not in a prompt. A trade that breaks one reverts.</p>
          </div>
          <dl className="rules">
            {RULES.map((r) => (
              <div key={r.t} style={{ display: 'contents' }}>
                <dt>{r.t}</dt>
                <dd>{r.d}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="section">
          <div className="section-head">
            <h2 className="h2">Worst case, compared</h2>
          </div>
          <div className="bars">
            <div className="bar-row">
              <span className="muted">Vault trading bot</span>
              <div className="bar-track"><div className="bar-fill" style={{ width: '100%', background: 'var(--ink)' }} /></div>
              <span className="bar-figure"><Num>10,000</Num> USDT</span>
            </div>
            <div className="bar-row">
              <span className="muted">StreamPilot</span>
              <div className="bar-track"><div className="bar-fill" style={{ width: '0.3%', minWidth: 5, background: 'var(--accent)' }} /></div>
              <span className="bar-figure">30 USDT</span>
            </div>
            <p className="small muted" style={{ margin: 0 }}>A 10,000 USDT deposit, three hours in. A bot can lose all of it. A stream at 10 USDT an hour has exposed 30.</p>
          </div>
        </section>

        <section className="section">
          <div className="section-head">
            <h2 className="h2">Live from chain</h2>
          </div>
          <ProtocolStats />
        </section>
      </main>
      <Footer />
    </>
  );
}
