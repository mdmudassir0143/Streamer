'use client';
import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { MotionPathPlugin } from 'gsap/MotionPathPlugin';
import { Bot, Landmark, Wallet } from 'lucide-react';

gsap.registerPlugin(MotionPathPlugin);

const IN = 'M96 262 C 170 262, 182 132, 260 132';
const OUT = 'M260 132 C 338 132, 350 262, 424 262';

/** Wallet → vault → agent, with USDT particles dripping along the stream. */
export function HeroFlow() {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = root.current;
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const ctx = gsap.context(() => {
      gsap.utils.toArray<SVGCircleElement>('.hf-p-in').forEach((c, i, all) => {
        gsap.to(c, { motionPath: { path: '#hf-in', align: '#hf-in', alignOrigin: [0.5, 0.5] }, duration: 2.6, ease: 'none', repeat: -1, delay: (i * 2.6) / all.length });
      });
      gsap.utils.toArray<SVGCircleElement>('.hf-p-out').forEach((c, i, all) => {
        gsap.to(c, { motionPath: { path: '#hf-out', align: '#hf-out', alignOrigin: [0.5, 0.5] }, duration: 3.4, ease: 'none', repeat: -1, delay: (i * 3.4) / all.length });
      });
      // Animate the icons, not .hf-node: its CSS transform positions the labels.
      gsap.fromTo('.hf-icon', { scale: 0.6, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.7, stagger: 0.14, ease: 'back.out(1.6)', delay: 0.3 });
      gsap.fromTo('.hf-line', { strokeDashoffset: 420 }, { strokeDashoffset: 0, duration: 1.4, ease: 'power2.inOut', delay: 0.2 });
      gsap.to('.hf-wallet .hf-icon, .hf-agent .hf-icon', { y: -5, duration: 2.4, ease: 'sine.inOut', yoyo: true, repeat: -1, delay: 1.2, stagger: 0.6 });
      gsap.to('.hf-vault-ring', { scale: 1.18, opacity: 0, transformOrigin: '50% 50%', duration: 2.2, repeat: -1, ease: 'power1.out' });
    }, el);
    return () => ctx.revert();
  }, []);

  return (
    <div className="hf" ref={root} aria-label="Your wallet streams USDT into a vault every second. The agent can only trade what reached the vault.">
      <svg className="hf-svg" viewBox="0 0 520 360" aria-hidden>
        <defs>
          <linearGradient id="hf-grad" x1="0" x2="1">
            <stop offset="0" style={{ stopColor: 'var(--flow)' }} stopOpacity="0.15" />
            <stop offset="0.5" style={{ stopColor: 'var(--flow)' }} stopOpacity="0.9" />
            <stop offset="1" style={{ stopColor: 'var(--flow)' }} stopOpacity="0.3" />
          </linearGradient>
          <radialGradient id="hf-glow">
            <stop offset="0" style={{ stopColor: 'var(--flow)' }} stopOpacity="0.28" />
            <stop offset="1" style={{ stopColor: 'var(--flow)' }} stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx="260" cy="132" r="120" fill="url(#hf-glow)" />
        <path id="hf-in" className="hf-line" d={IN} fill="none" stroke="url(#hf-grad)" strokeWidth="2" strokeDasharray="420" />
        <path id="hf-out" className="hf-line" d={OUT} fill="none" stroke="url(#hf-grad)" strokeWidth="2" strokeDasharray="420" />
        <circle className="hf-vault-ring" cx="260" cy="132" r="44" fill="none" strokeOpacity="0.5" style={{ stroke: 'var(--flow)' }} />
        {Array.from({ length: 7 }, (_, i) => <circle key={`i${i}`} className="hf-p-in" r={i % 3 === 0 ? 3.2 : 2.2} cx="96" cy="262" style={{ fill: 'var(--flow)' }} />)}
        {Array.from({ length: 4 }, (_, i) => <circle key={`o${i}`} className="hf-p-out" r="2.6" cx="260" cy="132" opacity="0.75" style={{ fill: 'var(--flow)' }} />)}
      </svg>

      <div className="hf-node hf-wallet">
        <span className="hf-icon"><Wallet size={18} strokeWidth={1.75} /></span>
        <strong>Your wallet</strong>
        <span>Unstreamed USDT stays here</span>
      </div>
      <div className="hf-node hf-vault">
        <span className="hf-icon hf-icon-accent"><Landmark size={20} strokeWidth={1.75} /></span>
        <strong>Vault</strong>
        <span>Fills a little every second</span>
      </div>
      <div className="hf-node hf-agent">
        <span className="hf-icon"><Bot size={18} strokeWidth={1.75} /></span>
        <strong>AI agent</strong>
        <span>Trades only what arrived</span>
      </div>
    </div>
  );
}
