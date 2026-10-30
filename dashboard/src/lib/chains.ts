import { defineChain } from 'viem';

export const anvil = defineChain({
  id: 31337,
  name: 'Anvil (local)',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['http://127.0.0.1:8545'] } },
  testnet: true,
});

export const hskTestnet = defineChain({
  id: 133,
  name: 'HashKey Chain Testnet',
  nativeCurrency: { name: 'HSK', symbol: 'HSK', decimals: 18 },
  rpcUrls: { default: { http: ['https://testnet.hsk.xyz'] } },
  blockExplorers: { default: { name: 'HSK Testnet Explorer', url: 'https://testnet-explorer.hsk.xyz' } },
  testnet: true,
});

export const hskMainnet = defineChain({
  id: 177,
  name: 'HashKey Chain',
  nativeCurrency: { name: 'HSK', symbol: 'HSK', decimals: 18 },
  rpcUrls: { default: { http: ['https://mainnet.hsk.xyz'] } },
  blockExplorers: { default: { name: 'Blockscout', url: 'https://hsk.blockscout.com' } },
});

export const allChains = [hskTestnet, hskMainnet, anvil] as const;
export type SupportedChainId = (typeof allChains)[number]['id'];

const envId = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? '133');
export const targetChain = allChains.find((c) => c.id === envId) ?? hskTestnet;
export const isTestnetTarget = targetChain.id !== 177;

export function explorerTx(hash: string): string | null {
  const url = targetChain.blockExplorers?.default.url;
  return url ? `${url}/tx/${hash}` : null;
}
export function explorerAddress(addr: string): string | null {
  const url = targetChain.blockExplorers?.default.url;
  return url ? `${url}/address/${addr}` : null;
}
