'use client';
import { useEffect, useRef } from 'react';
import { useAccount, useAccountEffect } from 'wagmi';
import { allChains } from '@/lib/chains';
import { shortAddr } from '@/lib/format';
import { useToastControls } from './Toast';

const chainName = (id?: number) => allChains.find((c) => c.id === id)?.name ?? (id ? `chain ${id}` : 'an unknown network');

/** Popups for wallet activity that doesn't go through useTx: connect, disconnect, account and network changes. */
export function WalletActivity() {
  const { push } = useToastControls();
  const { address, chainId, status } = useAccount();
  const prev = useRef<{ address?: string; chainId?: number }>({});

  useAccountEffect({
    onConnect: ({ address: a, chainId: c, isReconnected }) => {
      prev.current = { address: a, chainId: c };
      // Silent on page-load auto-reconnect; only announce a fresh connection.
      if (!isReconnected) push({ kind: 'wallet', title: 'Wallet connected', msg: <>{shortAddr(a)} on {chainName(c)}</> });
    },
    onDisconnect: () => {
      prev.current = {};
      push({ kind: 'wallet', title: 'Wallet disconnected', msg: 'Your streams keep running on-chain.' });
    },
  });

  useEffect(() => {
    if (status !== 'connected') return;
    const p = prev.current;
    if (p.address && address && p.address !== address) {
      push({ kind: 'wallet', title: 'Account changed', msg: shortAddr(address) });
    } else if (p.chainId && chainId && p.chainId !== chainId) {
      push({ kind: 'wallet', title: 'Network switched', msg: `Your wallet is now on ${chainName(chainId)}.` });
    }
    prev.current = { address, chainId };
  }, [address, chainId, status, push]);

  return null;
}
