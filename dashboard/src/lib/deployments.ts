import raw from '@/generated/deployments.json';
import type { Address } from 'viem';
import { targetChain } from './chains';

const MAINNET_DEFAULTS = {
  USDT: '0xF1B50eD67A9e2CC94Ad3c477779E2d4cBfFf9029',
  WETH: '0xefd4bC9afD210517803f293ABABd701CaeeCdfd0',
  WBTC: '0x6119CA49a79f5825C8B345F8d7aC36B272565b14',
  WHSK: '0xB210D2120d57b758EE163cFfb43e73728c471Cf1',
} as const;

export type AssetSymbol = 'WETH' | 'WBTC' | 'WHSK';
export interface TokenInfo { symbol: string; address: Address; decimals: number }

export interface Deployment {
  chainId: number;
  vault?: Address;
  venue?: Address;
  usdt?: Address;
  tokens: Partial<Record<'USDT' | AssetSymbol, Address>>;
  startBlock?: bigint;
}

const isAddr = (v: unknown): v is Address => typeof v === 'string' && /^0x[0-9a-fA-F]{40}$/.test(v);

/** Flattens any reasonable JSON shape into lowercase-key -> address. */
function collect(obj: unknown, out: Record<string, Address>, prefix = '') {
  if (!obj || typeof obj !== 'object') return;
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (isAddr(v)) {
      out[k.toLowerCase()] ??= v;
      if (prefix) out[`${prefix}.${k}`.toLowerCase()] ??= v;
    } else if (v && typeof v === 'object' && 'address' in (v as object) && isAddr((v as { address: unknown }).address)) {
      out[k.toLowerCase()] ??= (v as { address: Address }).address;
    } else if (v && typeof v === 'object') {
      collect(v, out, k);
    }
  }
}

function pick(m: Record<string, Address>, ...keys: string[]): Address | undefined {
  for (const k of keys) if (m[k.toLowerCase()]) return m[k.toLowerCase()];
  return undefined;
}

function normalize(chainId: number, j: unknown): Deployment {
  const m: Record<string, Address> = {};
  collect(j, m);
  const usdt = pick(m, 'USDT', 'MockUSDT', 'baseToken', 'base', 'tokens.USDT') ?? (chainId === 177 ? MAINNET_DEFAULTS.USDT : undefined);
  const weth = pick(m, 'WETH', 'MockWETH') ?? (chainId === 177 ? MAINNET_DEFAULTS.WETH : undefined);
  const wbtc = pick(m, 'WBTC', 'MockWBTC') ?? (chainId === 177 ? MAINNET_DEFAULTS.WBTC : undefined);
  const whsk = pick(m, 'WHSK', 'MockWHSK') ?? (chainId === 177 ? MAINNET_DEFAULTS.WHSK : undefined);
  const sb = (j as Record<string, unknown> | null)?.startBlock ?? (j as Record<string, unknown> | null)?.deployBlock ?? (j as Record<string, unknown> | null)?.blockNumber;
  return {
    chainId,
    vault: pick(m, 'StreamVault', 'vault', 'streamVault'),
    venue: pick(m, 'venue', 'MockAMMVenue', 'UniV3Venue'),
    usdt,
    tokens: { USDT: usdt, WETH: weth, WBTC: wbtc, WHSK: whsk },
    startBlock: typeof sb === 'number' || typeof sb === 'string' ? BigInt(sb) : undefined,
  };
}

const all = raw as Record<string, unknown>;
export const deployment: Deployment = normalize(targetChain.id, all[String(targetChain.id)] ?? {});

export const TOKEN_DECIMALS: Record<string, number> = { USDT: 6, WETH: 18, WBTC: 8, WHSK: 18 };
export const ASSETS: AssetSymbol[] = ['WETH', 'WBTC', 'WHSK'];

export function symbolOf(addr?: string): string {
  if (!addr) return '?';
  const a = addr.toLowerCase();
  for (const [sym, v] of Object.entries(deployment.tokens)) if (v && v.toLowerCase() === a) return sym;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}
export function decimalsOf(addrOrSym?: string): number {
  if (!addrOrSym) return 18;
  if (TOKEN_DECIMALS[addrOrSym] != null) return TOKEN_DECIMALS[addrOrSym];
  return TOKEN_DECIMALS[symbolOf(addrOrSym)] ?? 18;
}
