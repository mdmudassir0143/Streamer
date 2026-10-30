'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import { StreamCard } from '@/components/StreamCard';
import { deployment } from '@/lib/deployments';
import { targetChain } from '@/lib/chains';
import { useStreamIds } from '@/lib/stream';

function StreamsList() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const { isConnected } = useAccount();
  const ids = useStreamIds();
  if (!mounted) return null;
  if (!deployment.vault) {
    return <div className="notice notice-neg">No StreamVault deployment for chain {targetChain.id}. Deploy the contracts, then restart the dashboard so it picks up deployments/{targetChain.id}.json.</div>;
  }
  if (!isConnected) {
    return <div className="empty"><b>Connect your wallet to see your streams</b><span>Streams are read straight from the vault contract.</span></div>;
  }
  if (ids.isLoading) return <div className="muted">Reading your streams from chain…</div>;
  if (ids.error) return <div className="notice notice-neg">Couldn&apos;t read streams from the vault: {ids.error.message.split('\n')[0]}</div>;
  const list = [...(ids.data ?? [])].reverse();
  if (list.length === 0) {
    return (
      <div className="empty">
        <b>No streams yet</b>
        <span>Start with a small hourly rate. Nothing leaves your wallet until it streams.</span>
        <Link href="/app/new" className="btn btn-primary">Start a stream</Link>
      </div>
    );
  }
  return <div className="stream-grid">{list.map((id) => <StreamCard key={id.toString()} id={id} />)}</div>;
}

export default function AppHome() {
  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Your streams</h1>
          <p className="muted" style={{ margin: '4px 0 0' }}>The highlighted part of each bar is all the agent can reach.</p>
        </div>
        <Link href="/app/new" className="btn btn-primary">Start a stream</Link>
      </div>
      <StreamsList />
    </>
  );
}
