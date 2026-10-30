import type { AnalystOutput, Position, Prefs, StreamState, TokenInfo, TradeProposal } from "../types.js";
import { bps } from "../math.js";

/** Snapshot of everything the deterministic stages need (pure, testable). */
export interface TickState {
  now: number; // unix seconds
  stream: StreamState;
  equity: bigint; // base units
  base: TokenInfo;
  positions: Position[];
  assets: Record<string, TokenInfo>; // WETH -> token
  prefs: Prefs;
  minTradeBase: bigint;
}

export const APPETITE_FRACTION = { low: 0.25, medium: 0.5, high: 1 } as const;

export function positionOf(st: TickState, token?: string): Position | undefined {
  if (!token) return undefined;
  return st.positions.find((p) => p.token.toLowerCase() === token.toLowerCase());
}

/** Turn the analyst's top view into a sized trade proposal (pre-risk). */
export function propose(st: TickState, analyst: AnalystOutput): TradeProposal {
  const hold = (reason: string): TradeProposal => ({ action: "hold", amountIn: 0n, valueBase: 0n, reason });
  const ranked = analyst.views
    .filter((v) => v.view !== "neutral" && v.conviction > 0.05 && st.assets[v.asset])
    .sort((a, b) => b.conviction - a.conviction);
  // Prefer the strongest view that is actually actionable.
  for (const v of ranked) {
    const tok = st.assets[v.asset];
    const budget = bps(st.equity, st.stream.risk.maxTradeBps);
    const scaled = BigInt(Math.floor(Number(budget) * APPETITE_FRACTION[st.prefs.riskAppetite] * v.conviction));
    let value = scaled < st.minTradeBase ? st.minTradeBase : scaled; // bump tiny-but-valid ideas to min size; risk may veto
    if (v.view === "bullish") {
      const baseBal = positionOf(st, st.base.address)?.amount ?? 0n;
      if (baseBal === 0n) continue;
      if (value > baseBal) value = baseBal;
      return {
        action: "buy",
        asset: v.asset,
        tokenIn: st.base.address,
        tokenOut: tok.address,
        amountIn: value,
        valueBase: value,
        reason: `${v.asset} bullish ${v.conviction.toFixed(2)}: ${v.rationale}`,
      };
    } else {
      const p = positionOf(st, tok.address);
      if (!p || p.amount === 0n || p.valueBase === 0n) continue;
      if (value > p.valueBase) value = p.valueBase;
      const amountIn = value === p.valueBase ? p.amount : (p.amount * value) / p.valueBase;
      return {
        action: "sell",
        asset: v.asset,
        tokenIn: tok.address,
        tokenOut: st.base.address,
        amountIn,
        valueBase: value,
        reason: `${v.asset} bearish ${v.conviction.toFixed(2)}: ${v.rationale}`,
      };
    }
  }
  if (ranked.length) return hold(`views not actionable (no balance to act on): ${analyst.summary}`);
  return hold(`no edge: ${analyst.summary}`);
}
