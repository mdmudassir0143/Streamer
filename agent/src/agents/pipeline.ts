import { config } from "../config.js";
import { agentAccount, allowedTokens, equityOf, getStream, listStreams, owedOf, ownerFunding, positions, publicClient, tokenInfo } from "../chain.js";
import { minBig, parseUnitsSafe, toNum } from "../math.js";
import { getPrices, momentum } from "../prices.js";
import { getPrefs, recordDecision } from "../store.js";
import type { Decision, TokenInfo } from "../types.js";
import { runAnalyst, type MarketContext } from "./analyst.js";
import { execute, reasonHashOf } from "./executor.js";
import { propose, type TickState } from "./proposer.js";
import { runRisk } from "./risk.js";

const lastTick = new Map<string, number>();
const lastHaltNote = new Map<string, number>();
const running = new Set<string>();

export async function buildTickState(id: bigint): Promise<TickState> {
  const stream = await getStream(id);
  const [equity0, pos, base, allowed, owed, funding, block] = await Promise.all([
    equityOf(id),
    positions(stream),
    tokenInfo(stream.baseToken),
    allowedTokens(),
    owedOf(id),
    ownerFunding(stream),
    publicClient.getBlock(),
  ]);
  // trade() accrues first, so base that is owed-and-pullable right now is spendable this tick.
  const pullable = minBig(owed, funding.allowance, funding.balance);
  const equity = equity0 + pullable;
  const basePos = pos.find((p) => p.token.toLowerCase() === stream.baseToken.toLowerCase());
  if (basePos) {
    basePos.amount += pullable;
    basePos.valueBase += pullable;
  }
  const assets: Record<string, TokenInfo> = {};
  for (const t of allowed) if (["WETH", "WBTC", "WHSK"].includes(t.symbol)) assets[t.symbol] = t;
  const prefs = getPrefs(id.toString());
  for (const k of Object.keys(assets)) if (!prefs.assets.includes(k)) delete assets[k];
  return {
    now: Number(block.timestamp), // chain time (cooldown is enforced against block.timestamp)
    stream,
    equity,
    base,
    positions: pos,
    assets,
    prefs,
    minTradeBase: parseUnitsSafe(config.minTradeBase, base.decimals),
  };
}

export async function marketContext(st: TickState): Promise<MarketContext> {
  const px = await getPrices();
  const target = await tokenInfo(st.stream.targetToken).catch(() => undefined);
  return {
    streamId: st.stream.id.toString(),
    prices: px.prices,
    venue: px.venue,
    momentum: Object.fromEntries(st.prefs.assets.map((a) => [a, momentum(a)])),
    positions: st.positions.map((p) => ({
      symbol: p.symbol,
      amount: toNum(p.amount, p.decimals),
      valueBase: toNum(p.valueBase, st.base.decimals),
    })),
    equityBase: toNum(st.equity, st.base.decimals),
    baseSymbol: st.base.symbol,
    defaultTarget: target?.symbol,
    prefs: st.prefs,
  };
}

/** Full Analyst -> Proposer -> Risk -> Executor pass for one stream. */
export async function tickStream(id: bigint): Promise<Decision | null> {
  const key = id.toString();
  if (running.has(key)) return null;
  running.add(key);
  try {
    const st = await buildTickState(id);
    if (st.stream.halted) {
      if (Date.now() - (lastHaltNote.get(key) ?? 0) < 10 * 60_000) return null;
      lastHaltNote.set(key, Date.now());
      const base = {
        ts: Date.now(),
        chainId: config.chainId,
        streamId: key,
        action: "hold" as const,
        tokenIn: null,
        tokenOut: null,
        amountIn: "0",
        reason: "stream halted by on-chain drawdown breaker; owner must resume",
        analyst: null,
        risk: { verdict: "veto", reason: "halted" },
        blocked: true,
        engine: "rules" as const,
      };
      const d = { ...base, reasonHash: reasonHashOf(base) };
      recordDecision(d);
      return d;
    }
    const ctx = await marketContext(st);
    const analyst = await runAnalyst(ctx);
    const proposal = propose(st, analyst);
    const risk = await runRisk(st, proposal, analyst);
    return await execute(st, proposal, analyst, risk);
  } finally {
    running.delete(key);
  }
}

/** Streams this agent operates: AGENT mode, agent == us, not cancelled/paused, prefs.enabled, interval elapsed. */
export async function tickDue(force = false): Promise<Decision[]> {
  if (!agentAccount) return [];
  const me = agentAccount.address.toLowerCase();
  const out: Decision[] = [];
  for (const s of await listStreams()) {
    const key = s.id.toString();
    if (s.mode !== 0) continue;
    const prefs = getPrefs(key);
    if (!prefs.enabled) continue;
    if (!force && Date.now() - (lastTick.get(key) ?? 0) < prefs.intervalSec * 1000) continue;
    try {
      const live = await getStream(s.id); // agent may have been changed via setAgent
      if (live.agent.toLowerCase() !== me || live.cancelled || live.paused) continue;
      lastTick.set(key, Date.now());
      const d = await tickStream(s.id);
      if (d) out.push(d);
    } catch (e) {
      lastTick.set(key, Date.now());
      console.warn(`[tick] stream ${key} failed:`, (e as Error).message);
    }
  }
  return out;
}
