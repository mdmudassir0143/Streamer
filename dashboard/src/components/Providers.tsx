'use client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { WagmiProvider } from 'wagmi';
import { switchChain } from '@wagmi/core';
import { wagmiConfig } from '@/lib/wagmi';
import { defaultChain, setTargetChain } from '@/lib/chains';
import { deployedChainIds, refreshDeployment } from '@/lib/deployments';
import { ToastProvider } from './Toast';

const STORAGE_KEY = 'streampilot:network';

interface NetworkCtx { chainId: number; options: number[]; select: (id: number) => void }
const NetworkContext = createContext<NetworkCtx>({ chainId: defaultChain.id, options: [defaultChain.id], select: () => {} });
export const useNetwork = () => useContext(NetworkContext);

function apply(id: number) {
  setTargetChain(id);
  refreshDeployment();
}

export function Providers({ children }: { children: ReactNode }) {
  // First render matches the server (env default); a stored choice is applied after mount.
  const [chainId, setChainId] = useState<number>(defaultChain.id);
  const options = useMemo(() => {
    const ids = deployedChainIds().filter((id) => id !== 31337 || defaultChain.id === 31337);
    return ids.includes(defaultChain.id) ? ids : [defaultChain.id, ...ids];
  }, []);

  useEffect(() => {
    let stored: number | undefined;
    try { stored = Number(localStorage.getItem(STORAGE_KEY)) || undefined; } catch { /* storage blocked */ }
    // ?network=testnet|mainnet (from landing links) wins over the stored choice.
    const fromUrl = ({ testnet: 133, mainnet: 177 } as Record<string, number>)[new URLSearchParams(location.search).get('network') ?? ''];
    if (fromUrl && options.includes(fromUrl)) {
      stored = fromUrl;
      try { localStorage.setItem(STORAGE_KEY, String(fromUrl)); } catch { /* storage blocked */ }
    }
    if (stored && stored !== defaultChain.id && options.includes(stored)) {
      apply(stored);
      setChainId(stored);
    }
  }, [options]);

  const select = useCallback((id: number) => {
    try { localStorage.setItem(STORAGE_KEY, String(id)); } catch { /* storage blocked */ }
    apply(id);
    setChainId(id);
    // Ask the wallet to follow; if it declines, the "Switch to …" prompt stays visible.
    if (wagmiConfig.state.status === 'connected') switchChain(wagmiConfig, { chainId: id as never }).catch(() => {});
  }, []);

  // A fresh query cache per network, and `key` remounts everything that read the old chain.
  const qc = useMemo(() => new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false } } }), [chainId]);
  const ctx = useMemo(() => ({ chainId, options, select }), [chainId, options, select]);
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={qc}>
        <NetworkContext.Provider value={ctx}>
          <ToastProvider key={chainId}>{children}</ToastProvider>
        </NetworkContext.Provider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
