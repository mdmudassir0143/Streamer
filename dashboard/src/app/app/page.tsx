'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import { SwitchNetworkButton, useConnectInjected } from '@/components/Nav';
import { StreamCard, StreamCardSkeleton } from '@/components/StreamCard';
import { MiniPipe } from '@/components/StreamMeter';
import { Spinner } from '@/components/ui';
import { deployment } from '@/lib/deployments';
import { networkName, targetChain } from '@/lib/chains';
import { useStreamIds } from '@/lib/stream';

function Empty({ title, children, action, art = true }: { title: string; children: React.ReactNode; action?: React.ReactNode; art?: boolean }) {
  return (
    <div className="empty">
      {art && <div className="empty-illustration"><MiniPipe /></div>}
      <h2 className="h3">{title}</h2>
      <p>{children}</p>
      {action}
    </div>
  );
}

function StreamsList() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const { isConnected, chainId } = useAccount();
  const { connect, isPending, available } = useConnectInjected();
  const ids = useStreamIds();
  const skeletons = <div className="stream-grid"><StreamCardSkeleton /><StreamCardSkeleton /></div>;
  if (!mounted) return skeletons;
  if (!deployment.vault) {
    return <Empty title="No vault on this network" art={false}>Hashtream isn&apos;t deployed on chain {targetChain.id} yet. Deploy the contracts, then restart the dashboard.</Empty>;
  }
  if (!isConnected) {
    return (
      <Empty title="Connect your wallet to see your streams"
        action={<button className="btn btn-primary" disabled={!available || isPending} onClick={connect}>{isPending ? <><Spinner />Connecting</> : 'Connect wallet'}</button>}>
        Your streams are read straight from the vault contract. Connecting doesn&apos;t move any funds.
      </Empty>
    );
  }
  if (chainId !== targetChain.id) {
    return <Empty title={`Switch to ${networkName()}`} art={false} action={<SwitchNetworkButton />}>Your wallet is on another network. Hashtream runs on {networkName()}.</Empty>;
  }
  if (ids.isLoading) return skeletons;
  if (ids.error) {
    return <Empty title="Couldn’t read your streams" art={false} action={<button className="btn" onClick={() => ids.refetch()}>Try again</button>}>The network didn&apos;t answer. Check your connection and try again.</Empty>;
  }
  const list = [...(ids.data ?? [])].reverse();
  if (list.length === 0) {
    return (
      <Empty title="No streams yet" action={<Link href="/app/new" className="btn btn-primary">Start a stream</Link>}>
        Start with a small hourly rate. Nothing leaves your wallet until it streams.
      </Empty>
    );
  }
  return <div className="stream-grid">{list.map((id) => <StreamCard key={id.toString()} id={id} />)}</div>;
}

export default function AppHome() {
  return (
    <>
      <div className="page-head">
        <div className="stack-2">
          <h1 className="page-title">Your streams</h1>
          <p className="muted">The cobalt part of each pipe is all the agent can reach.</p>
        </div>
        <Link href="/app/new" className="btn btn-primary">Start a stream</Link>
      </div>
      <StreamsList />
    </>
  );
}
