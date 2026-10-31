import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { defineChain, isAddress, type Address, type Chain, type Hex } from "viem";
import { foundry } from "viem/chains";

const here = path.dirname(fileURLToPath(import.meta.url));
export const AGENT_DIR = path.resolve(here, "..");
export const ROOT_DIR = path.resolve(AGENT_DIR, "..");
export const DATA_DIR = process.env.AGENT_DATA_DIR ? path.resolve(process.env.AGENT_DATA_DIR) : path.join(AGENT_DIR, "data");
export const DEPLOYMENTS_DIR = process.env.DEPLOYMENTS_DIR
  ? path.resolve(process.env.DEPLOYMENTS_DIR)
  : path.join(ROOT_DIR, "deployments");

// Root .env; existing process env wins (so CHAIN_ID=31337 npm start works).
dotenv.config({ path: path.join(ROOT_DIR, ".env"), quiet: true } as dotenv.DotenvConfigOptions);

export const hashkeyTestnet = defineChain({
  id: 133,
  name: "HashKey Chain Testnet",
  nativeCurrency: { name: "HSK", symbol: "HSK", decimals: 18 },
  rpcUrls: { default: { http: ["https://testnet.hsk.xyz"] } },
  blockExplorers: { default: { name: "Explorer", url: "https://testnet-explorer.hsk.xyz" } },
});

export const hashkeyMainnet = defineChain({
  id: 177,
  name: "HashKey Chain",
  nativeCurrency: { name: "HSK", symbol: "HSK", decimals: 18 },
  rpcUrls: { default: { http: ["https://mainnet.hsk.xyz"] } },
  blockExplorers: { default: { name: "Blockscout", url: "https://hsk.blockscout.com" } },
});

export const MAINNET_ADDRESSES = {
  USDT: "0xF1B50eD67A9e2CC94Ad3c477779E2d4cBfFf9029",
  WETH: "0xefd4bC9afD210517803f293ABABd701CaeeCdfd0",
  WBTC: "0x6119CA49a79f5825C8B345F8d7aC36B272565b14",
  WHSK: "0xB210D2120d57b758EE163cFfb43e73728c471Cf1",
} as const;

export interface Deployment {
  chainId: number;
  vault: Address;
  venue?: Address;
  baseToken?: Address;
  tokens: Record<string, Address>; // symbol (WETH/WBTC/WHSK/USDT) -> address, best effort
  startBlock: bigint;
  raw: unknown;
}

function flatten(obj: unknown, prefix = "", out: Record<string, unknown> = {}): Record<string, unknown> {
  if (obj && typeof obj === "object" && !Array.isArray(obj)) {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) flatten(v, prefix ? `${prefix}.${k}` : k, out);
  } else out[prefix] = obj;
  return out;
}

/** Tolerant parser: we don't know the deploy script's exact key names, so match by name. */
export function parseDeployment(raw: unknown, chainId: number): Deployment {
  const flat = flatten(raw);
  const addrs = Object.entries(flat).filter(([, v]) => typeof v === "string" && isAddress(v)) as [string, Address][];
  const find = (re: RegExp, not?: RegExp) =>
    addrs.find(([k]) => re.test(k.split(".").pop()!) && !(not && not.test(k)))?.[1] ??
    addrs.find(([k]) => re.test(k) && !(not && not.test(k)))?.[1];
  const vault = find(/^(stream)?vault$/i) ?? find(/vault/i);
  if (!vault) throw new Error(`deployments/${chainId}.json has no vault address`);
  const venue = find(/venue|amm/i);
  const baseToken = find(/^(mock)?usdt$|^base(token)?$/i) ?? find(/usdt/i);
  const tokens: Record<string, Address> = {};
  for (const sym of ["WETH", "WBTC", "WHSK"]) {
    const a = find(new RegExp(`^(mock)?${sym}$`, "i")) ?? find(new RegExp(sym, "i"));
    if (a) tokens[sym] = a;
  }
  if (baseToken) tokens.USDT = baseToken;
  const sbKey = Object.keys(flat).find((k) => /startblock|deployblock|blocknumber/i.test(k));
  const startBlock = sbKey ? BigInt(String(flat[sbKey])) : 0n;
  return { chainId, vault, venue, baseToken, tokens, startBlock, raw };
}

function intEnv(name: string, def: number): number {
  const v = process.env[name];
  const n = v ? Number(v) : NaN;
  return Number.isFinite(n) ? n : def;
}

function asKey(v: string | undefined): Hex | undefined {
  if (!v) return undefined;
  const k = v.trim();
  if (!k) return undefined;
  return (k.startsWith("0x") ? k : `0x${k}`) as Hex;
}

export function loadConfig() {
  const chainId = intEnv("CHAIN_ID", 31337);
  let chain: Chain;
  let rpcUrl = process.env.RPC_URL?.trim();
  if (chainId === 31337) {
    chain = foundry;
    if (!rpcUrl || !/127\.0\.0\.1|localhost/.test(rpcUrl)) rpcUrl = "http://127.0.0.1:8545";
  } else if (chainId === 133) {
    chain = hashkeyTestnet;
    rpcUrl ||= "https://testnet.hsk.xyz";
  } else if (chainId === 177) {
    chain = hashkeyMainnet;
    rpcUrl = process.env.MAINNET_RPC_URL?.trim() || rpcUrl || "https://mainnet.hsk.xyz";
    if (/testnet/.test(rpcUrl)) rpcUrl = "https://mainnet.hsk.xyz";
  } else throw new Error(`Unsupported CHAIN_ID ${chainId} (use 31337, 133 or 177)`);

  const depPath = path.join(DEPLOYMENTS_DIR, `${chainId}.json`);
  let deployment: Deployment | undefined;
  if (fs.existsSync(depPath)) {
    deployment = parseDeployment(JSON.parse(fs.readFileSync(depPath, "utf8")), chainId);
    if (chainId === 177) {
      deployment.baseToken ??= MAINNET_ADDRESSES.USDT;
      deployment.tokens = { ...MAINNET_ADDRESSES, ...deployment.tokens };
    }
  }
  const abiPath = path.join(DEPLOYMENTS_DIR, "abi", "StreamVault.json");

  return {
    chainId,
    chain,
    rpcUrl,
    deploymentPath: depPath,
    deployment,
    abiPath,
    agentKey: asKey(process.env.AGENT_KEY),
    deployerKey: asKey(process.env.DEPLOYER_KEY),
    anthropicKey: process.env.ANTHROPIC_API_KEY?.trim() || undefined,
    analystModel: process.env.ANALYST_MODEL || "claude-sonnet-5-5",
    chatModel: process.env.CHAT_MODEL || "claude-opus-5-5",
    port: intEnv("AGENT_API_PORT", 8787),
    schedulerMs: intEnv("SCHEDULER_MS", 5000),
    defaultIntervalSec: intEnv("DEFAULT_INTERVAL_SEC", 60),
    priceSyncSec: intEnv("PRICE_SYNC_SEC", 30),
    investMinBase: process.env.INVEST_MIN_BASE ?? "1", // human base units (e.g. 1 USDT)
    investMaxIdleSec: intEnv("INVEST_MAX_IDLE_SEC", 300),
    minTradeBase: process.env.MIN_TRADE_BASE ?? (chainId === 177 ? "0.05" : "0.5"),
    logChunk: BigInt(intEnv("LOG_CHUNK", 9000)),
  };
}

export type Config = ReturnType<typeof loadConfig>;
export const config: Config = loadConfig();
