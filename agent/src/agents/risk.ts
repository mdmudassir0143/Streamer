import { z } from "zod";
import { structuredCall, jsonReplacer } from "../llm.js";
import { bps } from "../math.js";
import type { AnalystOutput, Engine, RiskOutput, TradeProposal } from "../types.js";
import { positionOf, type TickState } from "./proposer.js";

type Check = RiskOutput["checks"][number];

/**
 * Deterministic hard checks mirroring on-chain Risk + agent prefs. The LLM may only shrink or veto,
 * never enlarge: `llmFactor` in [0,1] is applied first, then every cap.
 */
export function hardChecks(st: TickState, p: TradeProposal, llmFactor = 1, engine: Engine = "rules"): RiskOutput {
  const checks: Check[] = [];
  const s = st.stream;
  const veto = (reason: string): RiskOutput => ({ engine, verdict: "veto", reason, checks, finalAmountIn: 0n });

  if (p.action === "hold") return { engine, verdict: "approve", reason: "hold: nothing to check", checks, finalAmountIn: 0n };

  const status = s.cancelled ? "cancelled" : s.halted ? "halted (drawdown breaker)" : s.paused ? "paused" : s.mode !== 0 ? "not AGENT mode" : null;
  checks.push({ name: "status", ok: !status, detail: status ?? "active" });
  if (status) return veto(`stream ${status}`);

  if (!st.prefs.enabled) {
    checks.push({ name: "prefs.enabled", ok: false, detail: "agent disabled by owner prefs" });
    return veto("agent disabled in prefs");
  }

  // maxTradeBps=0 or maxSlippageBps=0 block trading on-chain (0 slippage can never cover the venue fee).
  const limitsOk = s.risk.maxTradeBps > 0 && s.risk.maxSlippageBps > 0;
  checks.push({ name: "riskLimits", ok: limitsOk, detail: `maxTradeBps ${s.risk.maxTradeBps}, maxSlippageBps ${s.risk.maxSlippageBps}` });
  if (!limitsOk) return veto("on-chain risk blocks trading (maxTradeBps or maxSlippageBps is 0)");

  const readyAt = Number(s.lastTradeAt) + s.risk.cooldownSec;
  const cdOk = s.lastTradeAt === 0n || st.now >= readyAt;
  checks.push({ name: "cooldown", ok: cdOk, detail: cdOk ? `ok (${s.risk.cooldownSec}s)` : `${readyAt - st.now}s left` });
  if (!cdOk) return veto(`cooldown: ${readyAt - st.now}s remaining`);

  let value = p.valueBase;
  let amountIn = p.amountIn;
  const scaleTo = (v: bigint) => {
    if (v >= value) return;
    amountIn = value === 0n ? 0n : (amountIn * v) / value;
    value = v;
  };
  const notes: string[] = [];

  if (llmFactor < 1) {
    const f = Math.max(0, llmFactor);
    scaleTo(BigInt(Math.floor(Number(value) * f)));
    notes.push(`risk officer sized to ${(f * 100).toFixed(0)}%`);
  }

  // on-chain: amountIn value <= equity * maxTradeBps/1e4  (2% headroom for equity drift)
  const tradeCap = (bps(st.equity, s.risk.maxTradeBps) * 98n) / 100n;
  const capOk = value <= tradeCap;
  checks.push({ name: "maxTradeBps", ok: capOk, detail: `value ${value} vs cap ${tradeCap} (${s.risk.maxTradeBps}bps of equity ${st.equity})` });
  if (!capOk) {
    scaleTo(tradeCap);
    notes.push("clipped to maxTradeBps");
  }

  // prefs.maxPositionPct for buys: post-trade asset value <= equity * pct
  if (p.action === "buy") {
    const cur = positionOf(st, p.tokenOut)?.valueBase ?? 0n;
    const capPos = (st.equity * BigInt(Math.round(st.prefs.maxPositionPct * 100))) / 10_000n;
    const room = capPos > cur ? capPos - cur : 0n;
    const ok = value <= room;
    checks.push({ name: "maxPositionPct", ok, detail: `position ${cur} + ${value} vs cap ${capPos} (${st.prefs.maxPositionPct}%)` });
    if (!ok) {
      scaleTo(room);
      notes.push("clipped to maxPositionPct");
    }
  }

  const bal = positionOf(st, p.tokenIn)?.amount ?? 0n;
  const balOk = amountIn <= bal;
  checks.push({ name: "balance", ok: balOk, detail: `amountIn ${amountIn} vs held ${bal}` });
  if (!balOk) {
    const v = bal === 0n ? 0n : (value * bal) / (amountIn || 1n);
    amountIn = bal;
    value = v;
    notes.push("clipped to balance");
  }

  const sizeOk = value >= st.minTradeBase && amountIn > 0n;
  checks.push({ name: "minTradeSize", ok: sizeOk, detail: `value ${value} vs min ${st.minTradeBase}` });
  if (!sizeOk) return veto(`trade too small after caps (${value} < min ${st.minTradeBase}); not worth gas`);

  const slipOk = s.risk.maxSlippageBps >= 40;
  checks.push({
    name: "slippageBudget",
    ok: slipOk,
    detail: slipOk ? `${s.risk.maxSlippageBps}bps` : `${s.risk.maxSlippageBps}bps may be below venue fee (30bps) + impact; trade may revert`,
  });

  const resized = amountIn !== p.amountIn;
  return {
    engine,
    verdict: resized ? "resize" : "approve",
    reason: resized ? notes.join("; ") : "all hard checks passed",
    checks,
    finalAmountIn: amountIn,
  };
}

const RiskSchema = z.object({
  verdict: z.enum(["approve", "resize", "veto"]),
  sizeFactor: z.number(),
  reason: z.string(),
});

const SYSTEM = `You are the Risk Officer of a crypto trading desk. You review one proposed trade before execution.
You can approve it, resize it (sizeFactor between 0 and 1, applied to the proposed amount), or veto it.
You can never enlarge a trade. Deterministic on-chain-mirroring checks (cooldown, max trade size, position cap, balance, minimum size) run after you, so focus on judgement: is the analyst's rationale coherent with the numbers, is conviction justified, is the user's risk appetite respected, is concentration or drawdown risk too high? Use sizeFactor 1 for approve and 0 for veto. Give a one-sentence reason.`;

export async function runRisk(st: TickState, p: TradeProposal, analyst: AnalystOutput): Promise<RiskOutput> {
  if (p.action === "hold") return hardChecks(st, p);
  // Run hard checks first; if they already veto, skip the LLM (saves cost + latency).
  const pre = hardChecks(st, p);
  if (pre.verdict === "veto") return pre;
  const out = await structuredCall({
    schema: RiskSchema,
    system: SYSTEM,
    user: JSON.stringify(
      {
        proposal: p,
        analyst,
        prefs: st.prefs,
        onchainRisk: st.stream.risk,
        equityBase: st.equity,
        highWaterMark: st.stream.highWaterMark,
        positions: st.positions,
        baseDecimals: st.base.decimals,
        hardChecks: pre.checks,
      },
      jsonReplacer,
      2,
    ),
  });
  if (!out) return pre;
  if (out.verdict === "veto")
    return { engine: "llm", verdict: "veto", reason: `risk officer: ${out.reason}`, checks: pre.checks, finalAmountIn: 0n };
  const factor = out.verdict === "approve" ? 1 : Math.max(0, Math.min(1, Number(out.sizeFactor) || 0));
  const r = hardChecks(st, p, factor, "llm");
  return { ...r, reason: `risk officer: ${out.reason}${r.reason ? ` | ${r.reason}` : ""}` };
}
