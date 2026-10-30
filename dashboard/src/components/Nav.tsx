'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAccount, useConnect, useDisconnect, useSwitchChain, useWriteContract } from 'wagmi';
import { targetChain, isTestnetTarget, explorerAddress } from '@/lib/chains';
import { deployment } from '@/lib/deployments';
import { erc20Abi } from '@/lib/abi';
import { useAgentOnline } from '@/lib/agentApi';
import { shortAddr } from '@/lib/format';
import { useTx } from './useTx';
import { useToast } from './Toast';
import { Badge, BrandMark, Menu, Spinner } from './ui';

export const GITHUB = 'https://github.com/mdmudassir0143/Streamer';
export const NETWORK_NAME = targetChain.id === 177 ? 'HashKey Chain' : targetChain.id === 133 ? 'HSK Testnet' : 'Local anvil';

export function NetworkBadge() {
  return <Badge dot>{NETWORK_NAME}</Badge>;
}

function AgentBadge() {
  const { online, loading } = useAgentOnline();
  if (loading) return null;
  return (
    <span className="nav-hide-sm">
      <Badge tone={online ? 'pos' : 'neutral'} dot title={online ? 'The agent API is reachable' : 'The agent API is unreachable. On-chain controls still work.'}>
        {online ? 'Agent online' : 'Agent offline'}
      </Badge>
    </span>
  );
}

function FaucetButton() {
  const { isConnected } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const { run, state } = useTx();
  const [showDone, setShowDone] = useState(false);
  const st = state('Faucet');
  useEffect(() => {
    if (st.phase !== 'done') return;
    setShowDone(true);
    const t = setTimeout(() => setShowDone(false), 4000);
    return () => clearTimeout(t);
  }, [st.phase]);
  if (!isTestnetTarget || !deployment.usdt || !isConnected) return null;
  const busy = st.phase === 'wallet' || st.phase === 'confirming';
  return (
    <button
      className="btn btn-sm nav-hide-sm"
      disabled={busy}
      onClick={() =>
        run('Faucet', () => writeContractAsync({ address: deployment.usdt!, abi: erc20Abi, functionName: 'faucet', chainId: targetChain.id }),
          '10,000 test USDT is in your wallet')
      }
    >
      {busy ? <><Spinner />{st.phase === 'wallet' ? 'Confirm in wallet' : 'Minting'}</> : showDone ? <><span className="ok-mark" aria-hidden>✓</span>USDT received</> : 'Get test USDT'}
    </button>
  );
}

export function useConnectInjected() {
  const toast = useToast();
  const { connect, connectors, isPending } = useConnect({
    mutation: {
      onError: (e) => toast('err', 'Couldn’t connect your wallet', `${((e as { shortMessage?: string }).shortMessage ?? e.message.split('\n')[0]).replace(/\.$/, '')}. Install or unlock MetaMask, then try again.`),
    },
  });
  const c = connectors[0];
  return { connect: () => c && connect({ connector: c, chainId: targetChain.id }), isPending, available: !!c };
}

export function SwitchNetworkButton({ className = 'btn btn-primary' }: { className?: string }) {
  const { switchChain, isPending } = useSwitchChain();
  return (
    <button className={className} disabled={isPending} onClick={() => switchChain({ chainId: targetChain.id })}>
      {isPending ? <><Spinner />Switching</> : `Switch to ${NETWORK_NAME}`}
    </button>
  );
}

function Connect() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const { address, isConnected, chainId } = useAccount();
  const { connect, isPending, available } = useConnectInjected();
  const { disconnect } = useDisconnect();
  const toast = useToast();
  if (!mounted) return <button className="btn btn-primary btn-sm" disabled>Connect wallet</button>;
  if (isConnected && address) {
    const link = explorerAddress(address);
    const copy = async () => {
      try {
        await navigator.clipboard.writeText(address);
        toast('ok', 'Address copied', shortAddr(address));
      } catch {
        toast('err', 'Couldn’t copy the address', 'Your browser blocked clipboard access. Select the address in the explorer instead.');
      }
    };
    return (
      <>
        {chainId !== targetChain.id && <span className="nav-hide-sm"><SwitchNetworkButton className="btn btn-sm" /></span>}
        <Menu label={<span className="mono">{shortAddr(address)}</span>}>
          {(close) => (
            <>
              <div className="menu-head">Connected to {NETWORK_NAME}</div>
              <button role="menuitem" className="menu-item" onClick={() => { close(); void copy(); }}>Copy address</button>
              {link && <a role="menuitem" className="menu-item" href={link} target="_blank" rel="noreferrer" onClick={close}>View on explorer</a>}
              <div className="menu-sep" />
              <button role="menuitem" className="menu-item" onClick={() => { close(); disconnect(); }}>Disconnect</button>
            </>
          )}
        </Menu>
      </>
    );
  }
  return (
    <button className="btn btn-primary btn-sm" disabled={!available || isPending} onClick={connect}>
      {isPending ? <><Spinner />Connecting</> : 'Connect wallet'}
    </button>
  );
}

export function AppNav() {
  const path = usePathname();
  const streams = path === '/app' || path?.startsWith('/app/stream') ? 'page' : undefined;
  const create = path === '/app/new' ? 'page' : undefined;
  return (
    <header className="nav">
      <div className="container nav-inner">
        <Link href="/" className="brand" aria-label="StreamPilot home"><BrandMark />StreamPilot</Link>
        <nav className="nav-links" aria-label="App">
          <Link href="/app" aria-current={streams}>Streams</Link>
          <Link href="/app/new" aria-current={create}>New stream</Link>
        </nav>
        <div className="nav-right">
          <span className="nav-hide-md"><NetworkBadge /></span>
          <AgentBadge />
          <FaucetButton />
          <Connect />
        </div>
      </div>
      <nav className="container nav-sub" aria-label="App sections">
        <Link href="/app" aria-current={streams}>Streams</Link>
        <Link href="/app/new" aria-current={create}>New stream</Link>
      </nav>
    </header>
  );
}

export function LandingNav() {
  return (
    <header className="nav">
      <div className="container nav-inner">
        <Link href="/" className="brand" aria-label="StreamPilot home"><BrandMark />StreamPilot</Link>
        <nav className="nav-links" aria-label="Sections">
          <a href="#how">How it works</a>
          <a href="#safety">Safety</a>
          <a href={GITHUB} target="_blank" rel="noreferrer">GitHub</a>
        </nav>
        <div className="nav-right">
          <span className="nav-hide-sm"><NetworkBadge /></span>
          <Link href="/app" className="btn btn-primary btn-sm">Launch app</Link>
        </div>
      </div>
    </header>
  );
}
