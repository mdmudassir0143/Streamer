import { describe, expect, it } from "vitest";
import { parseChatIntent } from "../src/chatRules.js";

const kinds = (m: string) => parseChatIntent(m).map((i) => i.kind);

describe("chat fallback parser", () => {
  it("pnl / positions", () => {
    expect(kinds("what's my pnl?")).toContain("pnl");
    expect(kinds("show positions")).toContain("positions");
  });
  it("pause / stop / resume / cancel", () => {
    expect(kinds("pause")).toEqual(["pause"]);
    expect(kinds("stop it now")).toContain("pause");
    expect(kinds("unpause please")).toEqual(["resume"]);
    expect(kinds("cancel the stream")).toEqual(["cancel"]);
  });
  it("slow down to N/hour", () => {
    expect(parseChatIntent("slow down to 5/hour")).toEqual([{ kind: "setRate", perHour: 5 }]);
    expect(parseChatIntent("set rate to 2 usdt per minute")).toEqual([{ kind: "setRate", perHour: 120 }]);
    expect(parseChatIntent("slow down to 48 per day")).toEqual([{ kind: "setRate", perHour: 2 }]);
  });
  it("risk appetite", () => {
    expect(parseChatIntent("risk low")).toEqual([{ kind: "prefs", patch: { riskAppetite: "low" } }]);
    expect(parseChatIntent("set risk to high")).toEqual([{ kind: "prefs", patch: { riskAppetite: "high" } }]);
    expect(parseChatIntent("go medium risk")).toEqual([{ kind: "prefs", patch: { riskAppetite: "medium" } }]);
  });
  it("only trade ETH", () => {
    expect(parseChatIntent("only trade ETH")).toEqual([{ kind: "prefs", patch: { assets: ["WETH"] } }]);
    expect(parseChatIntent("only trade btc and hsk")).toEqual([{ kind: "prefs", patch: { assets: ["WBTC", "WHSK"] } }]);
  });
  it("interval", () => {
    expect(parseChatIntent("decide every 5 min")).toEqual([{ kind: "prefs", patch: { intervalSec: 300 } }]);
  });
  it("unknown -> nothing", () => {
    expect(parseChatIntent("hello there")).toEqual([]);
  });
});
