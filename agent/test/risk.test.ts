import { describe, expect, it } from "vitest";
import type { Address } from "viem";
import { hardChecks } from "../src/agents/risk.js";
import { propose, type TickState } from "../src/agents/proposer.js";
import { rulesAnalyst, type MarketContext } from "../src/agents/analyst.js";
import type { StreamState, TradeProposal } from "../src/types.js";

const USDT = "0x00000000000000000000000000000000000000a1" as Address;
const WETH = "0x00000000000000000000000000000000000000b2" as Address;

function state(over: Partial<StreamState> = {}, baseBal = 100_000_000n, wethBal = 0n, wethVal = 0n): TickState {
  const stream: StreamState = {
    id: 1n, owner: USDT, agent: USDT, baseToken: USDT, targetToken: WETH, mode: 0,
    ratePerSec: 1000n, startTime: 0n, endTime: 0n, maxTotal: 0n, totalStreamed: 100_000_000n,
    lastAccrual: 0n, lastTradeAt: 0n, paused: false, halted: false, cancelled: false, highWaterMark: 0n,
    risk: { maxSlippageBps: 100, maxTradeBps: 2000, maxDrawdownBps: 2000, cooldownSec: 60 },
    ...over,
  };
  return {
    now: 1_000_000, stream, equity: baseBal + wethVal,
    base: { address: USDT, symbol: "USDT", rawSymbol: "USDT", decimals: 6 },
    positions: [
      { token: USDT, symbol: "USDT", decimals: 6, amount: baseBal, valueBase: baseBal },
      { token: WETH, symbol: "WETH", decimals: 18, amount: wethBal, valueBase: wethVal },
    ],
    assets: { WETH: { address: WETH, symbol: "WETH", rawSymbol: "WETH", decimals: 18 } },
    prefs: { riskAppetite: "medium", assets: ["WETH"], maxPositionPct: 50, intervalSec: 60, enabled: true },
    minTradeBase: 500_000n,
  };
}
const buy = (v: bigint): TradeProposal => ({ action: "buy", asset: "WETH", tokenIn: USDT, tokenOut: WETH, amountIn: v, valueBase: v, reason: "t" });

describe("hardChecks", () => {
  it("approves a trade within limits", () => {
    const r = hardChecks(state(), buy(10_000_000n));
    expect(r.verdict).toBe("approve");
    expect(r.finalAmountIn).toBe(10_000_000n);
  });
  it("vetoes paused / halted / cancelled / invest-mode", () => {
    for (const o of [{ paused: true }, { halted: true }, { cancelled: true }, { mode: 1 }])
      expect(hardChecks(state(o), buy(1_000_000n)).verdict).toBe("veto");
  });
  it("vetoes during cooldown and allows after", () => {
    expect(hardChecks(state({ lastTradeAt: 1_000_000n - 30n }), buy(1_000_000n)).verdict).toBe("veto");
    expect(hardChecks(state({ lastTradeAt: 1_000_000n - 61n }), buy(1_000_000n)).verdict).toBe("approve");
  });
  it("resizes to maxTradeBps of equity (with 2% headroom)", () => {
    const r = hardChecks(state(), buy(50_000_000n));
    expect(r.verdict).toBe("resize");
    expect(r.finalAmountIn).toBe(19_600_000n); // 20% of 100 USDT * 0.98
  });
  it("respects prefs.maxPositionPct", () => {
    // equity 100, already 45 in WETH, cap 50% -> room 5
    const st = state({}, 55_000_000n, 10n ** 16n, 45_000_000n);
    const r = hardChecks(st, buy(15_000_000n));
    expect(r.finalAmountIn).toBe(5_000_000n);
  });
  it("vetoes below min trade size", () => {
    expect(hardChecks(state(), buy(100_000n)).verdict).toBe("veto");
  });
  it("llm factor only shrinks", () => {
    expect(hardChecks(state(), buy(10_000_000n), 0.5).finalAmountIn).toBe(5_000_000n);
    expect(hardChecks(state(), buy(10_000_000n), 0).verdict).toBe("veto");
  });
  it("vetoes when maxTradeBps or maxSlippageBps is 0", () => {
    const r0 = { maxSlippageBps: 100, maxTradeBps: 0, maxDrawdownBps: 0, cooldownSec: 0 };
    expect(hardChecks(state({ risk: r0 }), buy(1_000_000n)).verdict).toBe("veto");
    expect(hardChecks(state({ risk: { ...r0, maxTradeBps: 2000, maxSlippageBps: 0 } }), buy(1_000_000n)).verdict).toBe("veto");
  });
  it("vetoes when prefs disabled", () => {
    const st = state();
    st.prefs.enabled = false;
    expect(hardChecks(st, buy(1_000_000n)).verdict).toBe("veto");
  });
});

describe("rules analyst + proposer", () => {
  const ctx = (r: number, venueSpread = 0): MarketContext => ({
    streamId: "1", prices: { WETH: 3000 }, venue: { WETH: 3000 * (1 + venueSpread / 100) },
    momentum: { WETH: { r1m: r, r5m: r, r15m: r, samples: 10 } },
    positions: [{ symbol: "USDT", amount: 50, valueBase: 50 }, { symbol: "WETH", amount: 0.0167, valueBase: 50 }],
    equityBase: 100, baseSymbol: "USDT", defaultTarget: "WETH",
    prefs: { riskAppetite: "medium", assets: ["WETH"], maxPositionPct: 50, intervalSec: 60, enabled: true },
  });
  it("bullish momentum -> buy", () => {
    const a = rulesAnalyst(ctx(1));
    expect(a.views[0].view).toBe("bullish");
    const p = propose(state(), a);
    expect(p.action).toBe("buy");
    expect(p.amountIn > 0n).toBe(true);
  });
  it("bearish with no position -> hold; with position -> sell", () => {
    const a = rulesAnalyst(ctx(-1));
    expect(a.views[0].view).toBe("bearish");
    expect(propose(state(), a).action).toBe("hold");
    const p = propose(state({}, 50_000_000n, 10n ** 16n, 50_000_000n), a);
    expect(p.action).toBe("sell");
    expect(p.tokenIn).toBe(WETH);
  });
  it("flat market -> neutral hold", () => {
    expect(propose(state(), rulesAnalyst(ctx(0))).action).toBe("hold");
  });
  it("venue cheaper than CEX is a buy edge", () => {
    expect(rulesAnalyst(ctx(0, -2)).views[0].view).toBe("bullish");
  });
});
