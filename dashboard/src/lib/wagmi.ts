import { createConfig, http } from 'wagmi';
import { injected } from '@wagmi/core';
import { anvil, hskMainnet, hskTestnet, targetChain } from './chains';

const override = process.env.NEXT_PUBLIC_RPC_URL || undefined;
const rpc = (id: number, url: string) => http(id === targetChain.id && override ? override : url);

export const wagmiConfig = createConfig({
  chains: [targetChain, ...[hskTestnet, hskMainnet, anvil].filter((c) => c.id !== targetChain.id)] as [
    typeof targetChain,
    ...(typeof hskTestnet | typeof hskMainnet | typeof anvil)[],
  ],
  connectors: [injected({ shimDisconnect: true })],
  transports: {
    [hskTestnet.id]: rpc(hskTestnet.id, 'https://testnet.hsk.xyz'),
    [hskMainnet.id]: rpc(hskMainnet.id, 'https://mainnet.hsk.xyz'),
    [anvil.id]: rpc(anvil.id, 'http://127.0.0.1:8545'),
  },
  ssr: true,
});

declare module 'wagmi' {
  interface Register {
    config: typeof wagmiConfig;
  }
}
