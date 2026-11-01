'use client';
import { useAccount, useBalance } from 'wagmi';
import { Fuel, Wallet } from 'lucide-react';
import { networkName, targetChain } from '@/lib/chains';
import { fmtUsdt, shortAddr } from '@/lib/format';
import { Num } from './ui';

const fmtHsk = (wei: bigint) => {
  const v = Number(wei) / 1e18;
  return v.toLocaleString('en-US', { maximumFractionDigits: v < 1 ? 4 : 2, minimumFractionDigits: 2 });
};

/** The connected wallet's USDT (what can stream) and HSK (gas) on the selected network. */
export function WalletCard({ usdt, needed }: { usdt?: bigint; needed?: bigint }) {
  const { address, isConnected } = useAccount();
  const hsk = useBalance({ address, chainId: targetChain.id, query: { enabled: !!address, refetchInterval: 15000 } });
  const short = needed !== undefined && usdt !== undefined && needed > 0n && usdt < needed;

  return (
    <div className="aside-panel wallet-card">
      <div className="wallet-card-head">
        <span className="wallet-card-icon"><Wallet size={16} strokeWidth={1.9} /></span>
        <div>
          <div className="strong">Your wallet</div>
          <div className="tiny muted">{isConnected && address ? `${shortAddr(address)} on ${networkName()}` : 'Not connected'}</div>
        </div>
      </div>
      {isConnected ? (
        <div className="wallet-card-rows">
          <div className="wallet-row">
            <span className="wallet-token wallet-token-usdt">$</span>
            <span className="wallet-row-name">USDT<small>Streams to the agent</small></span>
            <b><Num>{usdt !== undefined ? fmtUsdt(usdt) : '—'}</Num></b>
          </div>
          <div className="wallet-row">
            <span className="wallet-token wallet-token-hsk"><Fuel size={13} strokeWidth={2.2} /></span>
            <span className="wallet-row-name">HSK<small>Pays for gas</small></span>
            <b><Num>{hsk.data ? fmtHsk(hsk.data.value) : '—'}</Num></b>
          </div>
          {short && <p className="wallet-warn">Your budget cap is more than your USDT. The stream will only pull what you have.</p>}
          {hsk.data && hsk.data.value === 0n && <p className="wallet-warn">You need a little HSK to pay for gas before you can start a stream.</p>}
        </div>
      ) : (
        <p className="small muted" style={{ margin: 0 }}>Connect your wallet to see your USDT and HSK.</p>
      )}
    </div>
  );
}
