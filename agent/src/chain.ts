import fs from "node:fs";
import {
  BaseError,
  ContractFunctionRevertedError,
  createPublicClient,
  createWalletClient,
  getAddress,
  http,
  type Abi,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { erc20Abi, streamVaultAbi, venueAbi } from "./abi.js";
import { config } from "./config.js";
import { readJson, writeJson, normalizeAssetName } from "./store.js";
import type { Position, StreamState, TokenInfo } from "./types.js";

export const publicClient = createPublicClient({ chain: config.chain, transport: http(config.rpcUrl, { retryCount: 2 }) });

export const agentAccount: PrivateKeyAccount | undefined = config.agentKey ? privateKeyToAccount(config.agentKey) : undefined;
export const deployerAccount: PrivateKeyAccount | undefined = config.deployerKey
  ? privateKeyToAccount(config.deployerKey)
  : undefined;

const walletFor = (account: PrivateKeyAccount) =>
  createWalletClient({ account, chain: config.chain, transport: http(config.rpcUrl) });

/** Prefer the generated ABI JSON (forge artifact or bare array) when present; typed as the hand ABI. */
function loadVaultAbi(): typeof streamVaultAbi {
  try {
    if (fs.existsSync(config.abiPath)) {
      const j = JSON.parse(fs.readFileSync(config.abiPath, "utf8"));
      const abi = (Array.isArray(j) ? j : j.abi) as Abi | undefined;
      if (Array.isArray(abi) && abi.length) {
        // Keep our custom error defs so reverts still decode if the artifact lacks them.
        const sig = (x: any) => `${x.type}:${x.name ?? ""}`;
        const names = new Set(abi.map(sig));
        const extra = streamVaultAbi.filter((x) => !names.has(sig(x)));
        return [...abi, ...extra] as unknown as typeof streamVaultAbi;
      }
    }
  } catch (e) {
    console.warn("[chain] failed to load generated ABI, using hand-written:", (e as Error).message);
  }
  return streamVaultAbi;
}
export const vaultAbi = loadVaultAbi();

export function vaultAddress(): Address {
  const v = config.deployment?.vault;
  if (!v) throw new Error(`No deployment found at ${config.deploymentPath}`);
  return v;
}

// ---------- tx serialization (one nonce stream per key) ----------
const locks = new Map<string, Promise<unknown>>();
function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(key) ?? Promise.resolve();
  const next = prev.catch(() => undefined).then(fn);
  locks.set(key, next.catch(() => undefined));
  return next;
}

export function decodeError(e: unknown): string {
  if (e instanceof BaseError) {
    const rev = e.walk((x) => x instanceof ContractFunctionRevertedError) as ContractFunctionRevertedError | null;
    if (rev?.data?.errorName) return `${rev.data.errorName}${rev.data.args?.length ? `(${rev.data.args.join(",")})` : ""}`;
    return e.shortMessage || e.message;
  }
  return (e as Error)?.message ?? String(e);
}

type WriteArgs = { address: Address; abi: Abi; functionName: string; args: readonly unknown[] };

/** simulate (for decoded revert reasons) -> send -> wait receipt. */
export async function sendTx(account: PrivateKeyAccount, req: WriteArgs): Promise<{ hash: Hex; result: unknown; status: string }> {
  return withLock(account.address, async () => {
    // HSK testnet RPC intermittently answers -32602 "Missing or invalid parameters" (load-balanced nodes
    // disagreeing on nonce/fees); retry with a fresh simulate + nonce before giving up. Reverts are not retried.
    for (let attempt = 0; ; attempt++) {
      try {
        const { request, result } = await publicClient.simulateContract({ ...(req as any), account });
        const nonce = await publicClient.getTransactionCount({ address: account.address, blockTag: "pending" });
        const hash = await walletFor(account).writeContract({ ...(request as any), nonce });
        const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 120_000 });
        if (receipt.status !== "success") throw new Error(`tx ${hash} reverted`);
        return { hash, result, status: receipt.status };
      } catch (e) {
        const transient = e instanceof BaseError && !e.walk((x) => x instanceof ContractFunctionRevertedError) &&
          /invalid parameters|nonce|underpriced|timeout|fetch failed/i.test(e.shortMessage + e.message);
        if (!transient || attempt >= 2) throw e;
        await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
      }
    }
  });
}

// ---------- tokens ----------
const tokenCache = new Map<string, TokenInfo>();
export async function tokenInfo(address: Address): Promise<TokenInfo> {
  const key = address.toLowerCase();
  const hit = tokenCache.get(key);
  if (hit) return hit;
  const [rawSymbol, decimals] = await Promise.all([
    publicClient.readContract({ address, abi: erc20Abi, functionName: "symbol" }).catch(() => "?"),
    publicClient.readContract({ address, abi: erc20Abi, functionName: "decimals" }).catch(() => 18),
  ]);
  const symbol = /USD/i.test(rawSymbol) ? "USDT" : (normalizeAssetName(rawSymbol) ?? rawSymbol);
  const info: TokenInfo = { address: getAddress(address), symbol, rawSymbol, decimals: Number(decimals) };
  tokenCache.set(key, info);
  return info;
}

let allowedCache: { at: number; tokens: TokenInfo[] } | undefined;
export async function allowedTokens(): Promise<TokenInfo[]> {
  if (allowedCache && Date.now() - allowedCache.at < 60_000) return allowedCache.tokens;
  const list = (await publicClient.readContract({
    address: vaultAddress(),
    abi: vaultAbi,
    functionName: "allowedTokens",
  })) as readonly Address[];
  const tokens = await Promise.all(list.map(tokenInfo));
  allowedCache = { at: Date.now(), tokens };
  return tokens;
}

/** Map normalized symbol (WETH...) -> allowed token. */
export async function assetBySymbol(sym: string): Promise<TokenInfo | undefined> {
  return (await allowedTokens()).find((t) => t.symbol === sym);
}

let venueCache: Address | undefined;
export async function venueAddress(): Promise<Address> {
  venueCache ??= (await publicClient.readContract({ address: vaultAddress(), abi: vaultAbi, functionName: "venue" })) as Address;
  return venueCache;
}

export async function baseTokenAddress(): Promise<Address | undefined> {
  if (config.deployment?.baseToken) return config.deployment.baseToken;
  try {
    return (await publicClient.readContract({ address: await venueAddress(), abi: venueAbi, functionName: "baseToken" })) as Address;
  } catch {
    const s = (await listStreams())[0];
    return s?.baseToken;
  }
}

export async function quote(tokenIn: Address, tokenOut: Address, amountIn: bigint): Promise<bigint> {
  if (amountIn === 0n) return 0n;
  if (tokenIn.toLowerCase() === tokenOut.toLowerCase()) return amountIn;
  return (await publicClient.readContract({
    address: await venueAddress(),
    abi: venueAbi,
    functionName: "quote",
    args: [tokenIn, tokenOut, amountIn],
  })) as bigint;
}

// ---------- streams ----------
export async function getStream(id: bigint): Promise<StreamState> {
  const s = (await publicClient.readContract({
    address: vaultAddress(),
    abi: vaultAbi,
    functionName: "getStream",
    args: [id],
  })) as any;
  return {
    id: BigInt(s.id),
    owner: s.owner,
    agent: s.agent,
    baseToken: s.baseToken,
    targetToken: s.targetToken,
    mode: Number(s.mode),
    ratePerSec: BigInt(s.ratePerSec),
    startTime: BigInt(s.startTime),
    endTime: BigInt(s.endTime),
    maxTotal: BigInt(s.maxTotal),
    totalStreamed: BigInt(s.totalStreamed),
    lastAccrual: BigInt(s.lastAccrual),
    lastTradeAt: BigInt(s.lastTradeAt),
    paused: s.paused,
    halted: s.halted,
    cancelled: s.cancelled,
    highWaterMark: BigInt(s.highWaterMark),
    risk: {
      maxSlippageBps: Number(s.risk.maxSlippageBps),
      maxTradeBps: Number(s.risk.maxTradeBps),
      maxDrawdownBps: Number(s.risk.maxDrawdownBps),
      cooldownSec: Number(s.risk.cooldownSec),
    },
  };
}

const read = <T>(functionName: "equity" | "owed", id: bigint) =>
  publicClient.readContract({ address: vaultAddress(), abi: vaultAbi, functionName, args: [id] }) as Promise<T>;
export const equityOf = (id: bigint) => read<bigint>("equity", id);
export const owedOf = (id: bigint) => read<bigint>("owed", id);
export const vaultBalance = (id: bigint, token: Address) =>
  publicClient.readContract({ address: vaultAddress(), abi: vaultAbi, functionName: "balanceOf", args: [id, token] }) as Promise<bigint>;

/** Holdings of every allowed token + base, valued in base via venue.quote. */
export async function positions(s: StreamState): Promise<Position[]> {
  const base = await tokenInfo(s.baseToken);
  const toks = await allowedTokens();
  const all = [base, ...toks.filter((t) => t.address.toLowerCase() !== base.address.toLowerCase())];
  return Promise.all(
    all.map(async (t) => {
      const amount = await vaultBalance(s.id, t.address);
      let valueBase = 0n;
      if (t === base) valueBase = amount;
      else if (amount > 0n) valueBase = await quote(t.address, base.address, amount).catch(() => 0n);
      return { token: t.address, symbol: t.symbol, decimals: t.decimals, amount, valueBase };
    }),
  );
}

// ---------- log indexing (StreamCreated + Withdrawn), chunked ----------
interface IndexState {
  chainId: number;
  vault: string;
  lastBlock: string;
  streams: { id: string; owner: Address; agent: Address; mode: number; baseToken: Address; targetToken: Address }[];
  withdrawals: { id: string; token: Address; amount: string; block: string }[];
}
const indexFile = () => `index-${config.chainId}.json`;
let index: IndexState | undefined;
let indexing: Promise<void> | undefined;
let lastIndexAt = 0;

function freshIndex(): IndexState {
  return {
    chainId: config.chainId,
    vault: vaultAddress(),
    lastBlock: (config.deployment!.startBlock - 1n).toString(),
    streams: [],
    withdrawals: [],
  };
}

async function runIndex() {
  if (!index) {
    index = readJson<IndexState | undefined>(indexFile(), undefined);
    if (!index || index.vault.toLowerCase() !== vaultAddress().toLowerCase()) index = freshIndex();
  }
  const head = await publicClient.getBlockNumber();
  let from = BigInt(index.lastBlock) + 1n;
  if (from < 0n) from = 0n;
  if (head < BigInt(index.lastBlock)) index = freshIndex(); // anvil restarted
  const created = vaultAbi.find((x) => x.type === "event" && x.name === "StreamCreated")!;
  const withdrawn = vaultAbi.find((x) => x.type === "event" && x.name === "Withdrawn")!;
  while (from <= head) {
    const to = from + config.logChunk - 1n > head ? head : from + config.logChunk - 1n;
    const logs = await publicClient.getLogs({
      address: vaultAddress(),
      events: [created, withdrawn] as any,
      fromBlock: from,
      toBlock: to,
    });
    for (const l of logs as any[]) {
      if (l.eventName === "StreamCreated") {
        const a = l.args;
        const id = a.id.toString();
        if (!index.streams.some((s) => s.id === id))
          index.streams.push({ id, owner: a.owner, agent: a.agent, mode: Number(a.mode), baseToken: a.baseToken, targetToken: a.targetToken });
      } else if (l.eventName === "Withdrawn") {
        index.withdrawals.push({ id: l.args.id.toString(), token: l.args.token, amount: l.args.amount.toString(), block: l.blockNumber.toString() });
      }
    }
    index.lastBlock = to.toString();
    from = to + 1n;
  }
  writeJson(indexFile(), index);
  lastIndexAt = Date.now();
}

export async function syncIndex(force = false) {
  if (!force && index && Date.now() - lastIndexAt < 4000) return;
  indexing ??= runIndex().finally(() => (indexing = undefined));
  await indexing;
}

export async function listStreams() {
  await syncIndex();
  return index!.streams.map((s) => ({ ...s, id: BigInt(s.id) }));
}

export async function withdrawalsOf(id: bigint) {
  await syncIndex();
  return index!.withdrawals.filter((w) => w.id === id.toString()).map((w) => ({ token: w.token, amount: BigInt(w.amount) }));
}

// ---------- owner-side reads ----------
export async function ownerFunding(s: StreamState) {
  const [allowance, balance] = await Promise.all([
    publicClient.readContract({ address: s.baseToken, abi: erc20Abi, functionName: "allowance", args: [s.owner, vaultAddress()] }),
    publicClient.readContract({ address: s.baseToken, abi: erc20Abi, functionName: "balanceOf", args: [s.owner] }),
  ]);
  return { allowance: allowance as bigint, balance: balance as bigint };
}

// ---------- agent txs ----------
function requireAgent(): PrivateKeyAccount {
  if (!agentAccount) throw new Error("AGENT_KEY not set");
  return agentAccount;
}

export function sendTrade(id: bigint, tokenIn: Address, tokenOut: Address, amountIn: bigint, minOut: bigint, reasonHash: Hex) {
  return sendTx(requireAgent(), {
    address: vaultAddress(),
    abi: vaultAbi as Abi,
    functionName: "trade",
    args: [id, tokenIn, tokenOut, amountIn, minOut, reasonHash],
  });
}

export function sendInvest(id: bigint) {
  return sendTx(requireAgent(), { address: vaultAddress(), abi: vaultAbi as Abi, functionName: "invest", args: [id] });
}

export function sendAccrue(id: bigint) {
  return sendTx(requireAgent(), { address: vaultAddress(), abi: vaultAbi as Abi, functionName: "accrue", args: [id] });
}
