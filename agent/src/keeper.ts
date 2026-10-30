import type { Abi, Address } from "viem";
import type { PrivateKeyAccount } from "viem/accounts";
import { venueAbi } from "./abi.js";
import { config } from "./config.js";
import {
  agentAccount,
  allowedTokens,
  baseTokenAddress,
  decodeError,
  deployerAccount,
  getStream,
  listStreams,
  owedOf,
  publicClient,
  sendInvest,
  sendTx,
  tokenInfo,
  vaultBalance,
  venueAddress,
} from "./chain.js";
import { parseUnitsSafe, toE18 } from "./math.js";
import { getPrices, fetchVenuePrices, ASSET_TO_CEX } from "./prices.js";

// ---------- INVEST keeper ----------
const lastInvest = new Map<string, number>();

export async function investDue(): Promise<void> {
  if (!agentAccount) return;
  for (const s of await listStreams()) {
    if (s.mode !== 1) continue;
    const key = s.id.toString();
    try {
      const st = await getStream(s.id);
      if (st.paused || st.cancelled || st.halted) continue;
      const base = await tokenInfo(st.baseToken);
      const [held, owed] = await Promise.all([vaultBalance(s.id, st.baseToken), owedOf(s.id)]);
      const pending = held + owed;
      const threshold = parseUnitsSafe(config.investMinBase, base.decimals);
      const idleFor = Date.now() - (lastInvest.get(key) ?? 0);
      const due = pending >= threshold || (pending > 0n && idleFor > config.investMaxIdleSec * 1000);
      if (!due || pending === 0n) continue;
      lastInvest.set(key, Date.now());
      const { hash } = await sendInvest(s.id);
      console.log(`[keeper] invest(${key}) pending=${pending} tx=${hash}`);
    } catch (e) {
      lastInvest.set(key, Date.now());
      console.warn(`[keeper] invest(${key}) failed: ${decodeError(e)}`);
    }
  }
}

// ---------- price-sync keeper (31337 / 133 only, MockAMMVenue) ----------
// MockAMMVenue.syncPrice(asset, priceE18): priceE18 = whole base per whole asset, 1e18-scaled
// (contract converts decimals itself). Callable by venue owner or keeper; the testnet deploy
// script sets keeper = agent address, so we prefer AGENT_KEY and fall back to DEPLOYER_KEY (owner).
let syncMode: "human" | "raw" = (process.env.SYNC_PRICE_MODE as "human" | "raw") || "human";
let syncDisabled = false;
let syncer: PrivateKeyAccount | undefined;

export function priceE18For(usd: number, mode: "human" | "raw", baseDec: number, assetDec: number): bigint {
  const h = toE18(usd);
  if (mode === "human") return h;
  const diff = baseDec - assetDec;
  return diff >= 0 ? h * 10n ** BigInt(diff) : h / 10n ** BigInt(-diff);
}

async function pickSyncer(venue: Address): Promise<PrivateKeyAccount | undefined> {
  const rd = (fn: "owner" | "keeper") =>
    publicClient.readContract({ address: venue, abi: venueAbi, functionName: fn }).then((a) => (a as Address).toLowerCase()).catch(() => "");
  const [owner, keeper] = await Promise.all([rd("owner"), rd("keeper")]);
  for (const acc of [agentAccount, deployerAccount]) {
    if (acc && [owner, keeper].includes(acc.address.toLowerCase())) return acc;
  }
  console.warn(`[sync] neither AGENT_KEY nor DEPLOYER_KEY is venue owner (${owner}) or keeper (${keeper}); price sync disabled`);
  return undefined;
}

export async function syncPrices(): Promise<void> {
  if (syncDisabled || ![31337, 133].includes(config.chainId)) return;
  const venue = await venueAddress();
  syncer ??= await pickSyncer(venue);
  if (!syncer) {
    syncDisabled = true;
    return;
  }
  const baseAddr = await baseTokenAddress();
  if (!baseAddr) return;
  const base = await tokenInfo(baseAddr);
  const px = await getPrices(10_000);
  for (const t of await allowedTokens()) {
    if (!ASSET_TO_CEX[t.symbol]) continue;
    const usd = px.prices[t.symbol];
    if (!usd) continue;
    const v = px.venue[t.symbol];
    if (v && Math.abs(v - usd) / usd < 0.001) continue; // within 0.1%
    try {
      const { hash } = await sendTx(syncer, {
        address: venue,
        abi: venueAbi as Abi,
        functionName: "syncPrice",
        args: [t.address, priceE18For(usd, syncMode, base.decimals, t.decimals)],
      });
      const after = (await fetchVenuePrices())[t.symbol];
      if (after && (after / usd > 5 || usd / after > 5) && !process.env.SYNC_PRICE_MODE) {
        syncMode = syncMode === "human" ? "raw" : "human";
        console.warn(`[sync] ${t.symbol} venue=${after} vs cex=${usd}; switching syncPrice mode to ${syncMode}`);
      } else console.log(`[sync] ${t.symbol} -> ${usd} (venue now ${after?.toFixed(4)}) tx=${hash}`);
    } catch (e) {
      console.warn(`[sync] ${t.symbol} failed: ${decodeError(e)}`);
    }
  }
}
