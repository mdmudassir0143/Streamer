import Link from 'next/link';
import { ArrowUpRight, Check, X } from 'lucide-react';
import { DemoMeter } from '@/components/DemoMeter';
import { DecisionShowcase, FIRST_TRADE_URL } from '@/components/DecisionShowcase';
import { Footer } from '@/components/Footer';
import { HeroFlow } from '@/components/HeroFlow';
import { HowItWorks } from '@/components/HowItWorks';
import { LandingMotion } from '@/components/LandingMotion';
import { LandingNav } from '@/components/Nav';
import { ProtocolStats } from '@/components/ProtocolStats';
import { SafetyCalculator } from '@/components/SafetyCalculator';

const CAN = [
  'Trade the USDT that has already arrived',
  'Swap between USDT, ETH, BTC and HSK on HSKSwap',
  'Suggest changes, which you sign or ignore',
];

const CANNOT = [
  'Withdraw a single token, ever',
  'Touch the USDT still in your wallet',
  'Trade bigger than your max trade size',
  'Pay more than your slippage limit',
  'Keep trading after a big drop. The stream pauses until you say so',
  'Trade again before the cooldown ends',
];

export default function Landing() {
  return (
    <>
      <LandingNav />
      <LandingMotion />
      <main className="container">
        <section className="hero hero-split">
          <div className="hero-copy">
            <h1 className="h1 hero-title" data-reveal>Give your AI trader a little money, not your entire wallet.</h1>
            <p className="lead" data-reveal>
              Hashtream streams USDT to your AI agent every second. It can only spend what it receives. Stop the
              stream anytime. You&apos;re always in control.
            </p>
            <div className="hero-cta" data-reveal>
              <a href="/app/new?network=mainnet" className="btn btn-primary btn-lg">Start a stream</a>
              <a href="/app/new?network=testnet" className="btn btn-lg">Try free on testnet</a>
            </div>
          </div>
          <div className="hero-visual" data-reveal>
            <HeroFlow />
          </div>
        </section>

        <section className="hero-meter" data-reveal>
          <div className="hero-meter-head">
            <span className="hero-meter-title">Live example</span>
            <span className="muted small">100 USDT limit, streaming at 10 USDT an hour. The green part is all the agent can use.</span>
          </div>
          <DemoMeter />
        </section>

        <section className="section" id="safe">
          <div className="section-head" data-animate>
            <h2 className="h2">Keep most of your money safe while your agent works</h2>
            <p className="body">Choose a budget and a speed. See how much stays in your wallet, and how much your agent gets to work with.</p>
          </div>
          <div data-animate><SafetyCalculator /></div>
        </section>

        <section className="section" id="how">
          <div className="section-head" data-animate>
            <h2 className="h2">How it works</h2>
            <p className="body">Four steps. The vault contract on HashKey Chain enforces every one of them.</p>
          </div>
          <HowItWorks />
        </section>

        <section className="section" id="agent">
          <div className="showcase">
            <div className="showcase-copy" data-animate>
              <h2 className="h2">Three checks before every trade</h2>
              <p className="body">
                An analyst compares exchange prices with the on-chain pool. A risk officer checks the idea against your
                limits and can shrink it or say no. Only then does the executor send the trade.
              </p>
              <p className="body">
                Each decision is saved on-chain with its trade, so you can always see why the agent did what it did.
              </p>
              <div className="mode-alt">
                <h3 className="h4">Just want to buy and hold?</h3>
                <p>Pick Invest mode. Your stream buys ETH, BTC or HSK as it arrives, with no AI involved. It&apos;s dollar-cost averaging, by the second.</p>
              </div>
            </div>
            <div data-animate><DecisionShowcase /></div>
          </div>
        </section>

        <section className="section" id="safety">
          <div className="section-head" data-animate>
            <h2 className="h2">Rules in the contract, not in a prompt</h2>
            <p className="body">The agent can&apos;t talk its way around these. A trade that breaks one simply fails.</p>
          </div>
          <div className="cancan" data-animate>
            <div className="cancan-col">
              <h3 className="h4">The agent can</h3>
              <ul>{CAN.map((c) => <li key={c}><span className="cc-mark cc-yes" aria-hidden><Check size={13} strokeWidth={3} /></span>{c}</li>)}</ul>
            </div>
            <div className="cancan-col cancan-no">
              <h3 className="h4">The agent can never</h3>
              <ul>{CANNOT.map((c) => <li key={c}><span className="cc-mark cc-no" aria-hidden><X size={13} strokeWidth={3} /></span>{c}</li>)}</ul>
            </div>
          </div>
        </section>

        <section className="section">
          <div className="section-head" data-animate>
            <h2 className="h2">Live on HashKey Chain</h2>
            <p className="body">
              Read straight from the vault contract.{' '}
              <a className="link" href={FIRST_TRADE_URL} target="_blank" rel="noreferrer">See the first mainnet trade<ArrowUpRight size={14} className="link-icon" aria-hidden /></a>
            </p>
          </div>
          <div data-animate><ProtocolStats /></div>
        </section>

        <section className="cta-band" data-animate>
          <h2 className="h2">Start small. Stay in control.</h2>
          <p className="body">Try 1 USDT an hour. If you don&apos;t like what the agent does, stop the stream.</p>
          <div className="hero-cta">
            <a href="/app/new?network=mainnet" className="btn btn-primary btn-lg">Start a stream</a>
            <Link href="/app" className="btn btn-lg">Open the app</Link>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
