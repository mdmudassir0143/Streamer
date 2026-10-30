import { z } from "zod";
import { structuredCall, jsonReplacer } from "../llm.js";
import type { AnalystOutput, AssetView, Prefs } from "../types.js";
import type { Momentum } from "../prices.js";

export interface MarketContext {
  streamId: string;
  prices: Record<string, number>; // CEX USD
  venue: Record<string, number>; // venue base per asset
  momentum: Record<string, Momentum>;
  positions: { symbol: string; amount: number; valueBase: number }[];
  equityBase: number;
  baseSymbol: string;
  defaultTarget?: string;
  prefs: Prefs;
}

export const spreadPct = (ctx: MarketContext, a: string) =>
  ctx.prices[a] && ctx.venue[a] ? ((ctx.venue[a] - ctx.prices[a]) / ctx.prices[a]) * 100 : null;

const THRESH = { low: 0.6, medium: 0.3, high: 0.15 } as const;

/** Deterministic momentum + venue-vs-CEX spread rules. */
export function rulesAnalyst(ctx: MarketContext): AnalystOutput {
  const thr = THRESH[ctx.prefs.riskAppetite];
  const baseVal = ctx.positions.find((p) => p.symbol === ctx.baseSymbol)?.valueBase ?? 0;
  const idle = ctx.equityBase > 0 && baseVal / ctx.equityBase > 0.9;
  const views: AssetView[] = ctx.prefs.assets.map((asset) => {
    const m = ctx.momentum[asset] ?? { r1m: null, r5m: null, r15m: null, samples: 0 };
    const sp = spreadPct(ctx, asset);
    const score = 0.5 * (m.r1m ?? 0) + 0.3 * (m.r5m ?? 0) + 0.2 * (m.r15m ?? 0) - 0.5 * Math.max(-3, Math.min(3, sp ?? 0));
    const parts = [
      `1m ${fmt(m.r1m)}, 5m ${fmt(m.r5m)}, 15m ${fmt(m.r15m)}`,
      sp === null ? "no venue price" : `venue ${sp >= 0 ? "+" : ""}${sp.toFixed(2)}% vs CEX`,
      `score ${score.toFixed(3)} (thr ±${thr})`,
    ];
    if (!ctx.prices[asset]) return { asset, view: "neutral", conviction: 0, rationale: "no CEX price" };
    if (score > thr) return { asset, view: "bullish", conviction: clamp(score / (thr * 4)), rationale: parts.join("; ") };
    if (score < -thr) return { asset, view: "bearish", conviction: clamp(-score / (thr * 4)), rationale: parts.join("; ") };
    // Idle-capital deploy: mostly in base and nothing bearish -> small DCA-style entry on default target.
    const tgt = ctx.prefs.assets.includes(ctx.defaultTarget ?? "") ? ctx.defaultTarget : ctx.prefs.assets[0];
    if (idle && ctx.prefs.riskAppetite !== "low" && asset === tgt && score > -thr / 2)
      return { asset, view: "bullish", conviction: 0.25, rationale: parts.join("; ") + "; >90% idle in base, deploy small slice" };
    return { asset, view: "neutral", conviction: 0, rationale: parts.join("; ") };
  });
  const top = [...views].sort((a, b) => b.conviction - a.conviction)[0];
  return {
    engine: "rules",
    views,
    summary: top && top.view !== "neutral" ? `${top.asset} ${top.view} (${top.conviction.toFixed(2)})` : "no edge; neutral",
  };
}

const fmt = (x: number | null) => (x === null ? "n/a" : `${x >= 0 ? "+" : ""}${x.toFixed(2)}%`);
const clamp = (x: number) => Math.max(0, Math.min(1, x));

const AnalystSchema = z.object({
  views: z.array(
    z.object({
      asset: z.enum(["WETH", "WBTC", "WHSK"]),
      view: z.enum(["bullish", "bearish", "neutral"]),
      conviction: z.number(),
      rationale: z.string(),
    }),
  ),
  summary: z.string(),
});

const SYSTEM = `You are the Analyst in a multi-agent crypto trading desk on HashKey Chain. The desk trades only capital a user has streamed to it, through an on-chain venue quoted in USDT.
Given CEX prices (USD), venue prices (USDT per asset), momentum returns (percent over 1m/5m/15m; null means not enough history), current positions, and user preferences, give a short-horizon view per allowed asset.
- conviction is 0..1. Use 0 with "neutral" when there is no clear edge; most ticks should be neutral or low conviction.
- A venue price below the CEX price is a buy edge on the venue; above is a sell edge. Spreads under ~0.3% are noise.
- Respect riskAppetite: low = require strong, consistent signals; high = act on weaker momentum.
- Only include assets listed in prefs.assets. Keep each rationale to one or two sentences citing the numbers.`;

export async function runAnalyst(ctx: MarketContext): Promise<AnalystOutput> {
  const rules = rulesAnalyst(ctx);
  const out = await structuredCall({
    schema: AnalystSchema,
    system: SYSTEM,
    user: `Market context (JSON):\n${JSON.stringify(ctx, jsonReplacer, 2)}\n\nDeterministic baseline for reference:\n${JSON.stringify(rules.views)}`,
  });
  if (!out) return rules;
  const views = out.views
    .filter((v) => ctx.prefs.assets.includes(v.asset))
    .map((v) => ({ ...v, conviction: clamp(Number(v.conviction) || 0) }));
  return { engine: "llm", views, summary: out.summary };
}
