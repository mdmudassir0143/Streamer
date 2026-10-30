'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAccount, useConnect, useDisconnect, useWriteContract } from 'wagmi';
import { targetChain, isTestnetTarget } from '@/lib/chains';
import { deployment } from '@/lib/deployments';
import { erc20Abi } from '@/lib/abi';
import { useAgentOnline } from '@/lib/agentApi';
import { shortAddr } from '@/lib/format';
import { useTx } from './useTx';
import { useToast } from './Toast';
import { Badge, BrandMark } from './ui';

export function NetworkBadge() {
  const id = targetChain.id;
  const label = id === 177 ? 'HashKey Chain' : id === 133 ? 'HSK Testnet' : 'Local anvil';
  return <Badge dot>{label}</Badge>;
}

function AgentBadge() {
  const { online, loading } = useAgentOnline();
  if (loading) return null;
  return (
    <span className="nav-hide-sm">
      <Badge tone={online ? 'neutral' : 'warn'} dot title={online ? 'Agent API reachable' : 'Agent API unreachable; on-chain controls still work'}>
        {online ? 'Agent online' : 'Agent offline'}
      </Badge>
    </span>
  );
}

function FaucetButton() {
  const { isConnected } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const { run, pending } = useTx();
  if (!isTestnetTarget || !deployment.usdt || !isConnected) return null;
  return (
    <button
      className="btn btn-ghost btn-sm nav-hide-sm"
      disabled={!!pending}
      onClick={() =>
        run('Faucet', () => writeContractAsync({ address: deployment.usdt!, abi: erc20Abi, functionName: 'faucet', chainId: targetChain.id }),
          'Faucet: 10,000 test USDT is in your wallet')
      }
    >
      {pending ? 'Minting…' : 'Get test USDT'}
    </button>
  );
}

function Connect() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const { address, isConnected, chainId } = useAccount();
  const toast = useToast();
  const { connect, connectors, isPending } = useConnect({
    mutation: {
      onError: (e) => toast('err', <>Couldn&apos;t connect: {((e as { shortMessage?: string }).shortMessage ?? e.message.split('\n')[0]).replace(/\.$/, '')}. Install or unlock MetaMask.</>),
    },
  });
  const { disconnect } = useDisconnect();
  if (!mounted) return <button className="btn btn-primary btn-sm" disabled>Connect wallet</button>;
  if (isConnected && address) {
    return (
      <>
        {chainId !== targetChain.id && <Badge tone="warn" title="Transactions will ask to switch">Wrong network</Badge>}
        <button className="btn btn-sm mono" onClick={() => disconnect()} title="Disconnect">{shortAddr(address)}</button>
      </>
    );
  }
  const injectedC = connectors[0];
  return (
    <button className="btn btn-primary btn-sm" disabled={!injectedC || isPending} onClick={() => injectedC && connect({ connector: injectedC, chainId: targetChain.id })}>
      {isPending ? 'Connecting…' : 'Connect wallet'}
    </button>
  );
}

export function AppNav() {
  const path = usePathname();
  return (
    <header className="nav">
      <div className="container nav-inner">
        <Link href="/" className="brand" aria-label="StreamPilot home"><BrandMark />StreamPilot</Link>
        <nav className="nav-links" aria-label="App">
          <Link href="/app" aria-current={path === '/app' || path?.startsWith('/app/stream') ? 'page' : undefined}>Streams</Link>
          <Link href="/app/new" aria-current={path === '/app/new' ? 'page' : undefined}>New stream</Link>
        </nav>
        <div className="nav-right">
          <span className="nav-hide-sm"><NetworkBadge /></span>
          <AgentBadge />
          <FaucetButton />
          <Connect />
        </div>
      </div>
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
          <a href="#modes">Modes</a>
          <a href="#safety">Safety</a>
        </nav>
        <div className="nav-right">
          <span className="nav-hide-sm"><NetworkBadge /></span>
          <Link href="/app" className="btn btn-primary btn-sm">Launch app</Link>
        </div>
      </div>
    </header>
  );
}
