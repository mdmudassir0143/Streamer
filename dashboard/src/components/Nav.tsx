'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAccount, useConnect, useDisconnect, useSwitchChain, useWriteContract } from 'wagmi';
import { targetChain, isTestnetTarget, explorerAddress, networkName } from '@/lib/chains';
import { deployment } from '@/lib/deployments';
import { erc20Abi } from '@/lib/abi';
import { useAgentOnline } from '@/lib/agentApi';
import { shortAddr } from '@/lib/format';
import { useTx } from './useTx';
import { useToast, useToastControls } from './Toast';
import { useNetwork } from './Providers';
import { ThemeToggle } from './ThemeToggle';
import { Badge, BrandMark, Menu, Spinner } from './ui';

export const GITHUB = 'https://github.com/mdmudassir0143/Streamer';
export function NetworkBadge() {
  useNetwork(); // re-render on switch
  return <Badge dot>{networkName()}</Badge>;
}

const NETWORK_NOTE: Record<number, string> = { 177: 'Mainnet · real funds', 133: 'Testnet · free test USDT', 31337: 'Local anvil node' };

function Chevron() {
  return <svg className="chev" width="10" height="10" viewBox="0 0 10 10" aria-hidden><path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

/** Testnet ⇄ mainnet picker; falls back to a plain badge when only one network is deployed. */
export function NetworkSwitch() {
  const { chainId, options, select } = useNetwork();
  const { push } = useToastControls();
  if (options.length < 2) return <NetworkBadge />;
  return (
    <Menu buttonClass="badge net-trigger" popClass="net-pop" ariaLabel={`Network: ${networkName(chainId)}. Change network`}
      label={<><span className={`dot${chainId === 177 ? ' dot-main' : ' dot-test'}`} aria-hidden />{networkName(chainId)}<Chevron /></>}>
      {(close) => (
        <>
          <div className="menu-head">Choose network</div>
          {options.map((id) => (
            <button key={id} role="menuitemradio" aria-checked={id === chainId} className="menu-item net-item"
              onClick={() => { close(); if (id !== chainId) { select(id); push({ kind: 'info', title: `Now on ${networkName(id)}`, msg: NETWORK_NOTE[id] }); } }}>
              <span className={`net-dot${id === 177 ? ' main' : ''}`} aria-hidden />
              <span className="net-text">
                <span className="net-name">{networkName(id)}</span>
                <span className="net-note">{NETWORK_NOTE[id] ?? ''}</span>
              </span>
              <span className="net-check" aria-hidden>{id === chainId ? '✓' : ''}</span>
            </button>
          ))}
        </>
      )}
    </Menu>
  );
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
      {isPending ? <><Spinner />Switching</> : `Switch to ${networkName()}`}
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
              <div className="menu-head">Connected to {networkName()}</div>
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
        <Link href="/" className="brand" aria-label="Hashtream home"><BrandMark />Hashtream</Link>
        <nav className="nav-links" aria-label="App">
          <Link href="/app" aria-current={streams}>Streams</Link>
          <Link href="/app/new" aria-current={create}>New stream</Link>
        </nav>
        <div className="nav-right">
          <NetworkSwitch />
          <AgentBadge />
          <FaucetButton />
          <ThemeToggle />
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
        <Link href="/" className="brand" aria-label="Hashtream home"><BrandMark />Hashtream</Link>
        <nav className="nav-links" aria-label="Sections">
          <a href="#safe">Stay safe</a>
          <a href="#how">How it works</a>
          <a href="#safety">Safety</a>
          <a href={GITHUB} target="_blank" rel="noreferrer">GitHub</a>
        </nav>
        <div className="nav-right">
          <span className="nav-hide-sm"><NetworkBadge /></span>
          <ThemeToggle />
          <Link href="/app" className="btn btn-primary btn-sm">Launch app</Link>
        </div>
      </div>
    </header>
  );
}
