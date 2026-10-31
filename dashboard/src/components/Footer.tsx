'use client';
import { targetChain, explorerAddress } from '@/lib/chains';
import { deployment } from '@/lib/deployments';
import { shortAddr } from '@/lib/format';

export function Footer() {
  const v = deployment.vault;
  const link = v ? explorerAddress(v) : null;
  return (
    <footer className="footer">
      <div className="container footer-inner">
        <span>Hashtream is built on HashKey Chain and trades through HSKSwap.</span>
        <span className="row">
          <span>Vault on {targetChain.name}</span>
          {v ? (link ? <a className="link mono" href={link} target="_blank" rel="noreferrer">{shortAddr(v)}</a> : <span className="mono">{shortAddr(v)}</span>) : <span>not deployed</span>}
        </span>
        <a className="link" href="https://github.com/mdmudassir0143/Streamer" target="_blank" rel="noreferrer">GitHub</a>
      </div>
    </footer>
  );
}
