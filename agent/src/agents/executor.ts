import { keccak256, stringToHex, type Hex } from "viem";
import { config } from "../config.js";
import { decodeError, quote, sendTrade } from "../chain.js";
import { jsonReplacer } from "../llm.js";
import { minAmountOut } from "../math.js";
import { recordDecision } from "../store.js";
import type { AnalystOutput, Decision, RiskOutput, TradeProposal } from "../types.js";
import type { TickState } from "./proposer.js";

export function reasonHashOf(d: Omit<Decision, "reasonHash" | "txHash">): Hex {
  return keccak256(stringToHex(JSON.stringify(d, jsonReplacer)));
}

/** Deterministic executor: build minOut from venue.quote, send `trade`, record the decision. */
export async function execute(st: TickState, p: TradeProposal, analyst: AnalystOutput, risk: RiskOutput): Promise<Decision> {
  const engine = analyst.engine === "llm" || risk.engine === "llm" ? "llm" : "rules";
  const blocked = p.action !== "hold" && risk.verdict === "veto";
  const trade = p.action !== "hold" && !blocked && risk.finalAmountIn > 0n;
  const base: Omit<Decision, "reasonHash" | "txHash"> = {
    ts: Date.now(),
    chainId: config.chainId,
    streamId: st.stream.id.toString(),
    action: p.action,
    tokenIn: p.tokenIn ?? null,
    tokenOut: p.tokenOut ?? null,
    amountIn: (trade ? risk.finalAmountIn : p.amountIn).toString(),
    reason: blocked ? `VETO: ${risk.reason} | proposed: ${p.reason}` : p.reason,
    analyst,
    risk: { ...risk, finalAmountIn: risk.finalAmountIn.toString() },
    engine,
    ...(blocked ? { blocked: true } : {}),
  };

  if (!trade) {
    const d: Decision = { ...base, reasonHash: reasonHashOf(base) };
    recordDecision(d);
    return d;
  }

  try {
    // minOut is exactly the vault floor from a fresh quote; if the venue price moved between our read and
    // execution (e.g. a price-sync landed), the simulate reverts SlippageTooLoose — re-quote once and retry.
    let lastErr: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      const q = await quote(p.tokenIn!, p.tokenOut!, risk.finalAmountIn);
      const minOut = minAmountOut(q, st.stream.risk.maxSlippageBps);
      const withMin = { ...base, minAmountOut: minOut.toString() };
      const reasonHash = reasonHashOf(withMin);
      try {
        const { hash, result } = await sendTrade(st.stream.id, p.tokenIn!, p.tokenOut!, risk.finalAmountIn, minOut, reasonHash);
        const d: Decision = { ...withMin, reasonHash, txHash: hash, amountOut: String(result ?? "") };
        recordDecision(d);
        console.log(`[exec] stream ${d.streamId} ${d.action} ${d.amountIn} -> tx ${hash}`);
        return d;
      } catch (e) {
        lastErr = e;
        if (!/SlippageTooLoose/.test(decodeError(e))) break;
      }
    }
    throw lastErr;
  } catch (e) {
    const err = decodeError(e);
    const failed = { ...base, blocked: true, error: err, reason: `TX FAILED (${err}) | ${base.reason}` };
    const d: Decision = { ...failed, reasonHash: reasonHashOf(failed) };
    recordDecision(d);
    console.warn(`[exec] stream ${d.streamId} trade failed: ${err}`);
    return d;
  }
}
