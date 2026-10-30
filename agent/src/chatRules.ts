/** Pure rule-based chat intent parser (fallback when no ANTHROPIC_API_KEY). Unit-tested. */
import type { Prefs } from "./types.js";

export type Intent =
  | { kind: "pnl" }
  | { kind: "positions" }
  | { kind: "decisions" }
  | { kind: "pause" }
  | { kind: "resume" }
  | { kind: "cancel" }
  | { kind: "setRate"; perHour: number }
  | { kind: "prefs"; patch: Partial<Prefs> };

const ASSET_WORDS: [RegExp, string][] = [
  [/\b(w?eth|ether|ethereum)\b/i, "WETH"],
  [/\b(w?btc|bitcoin)\b/i, "WBTC"],
  [/\b(w?hsk|hashkey)\b/i, "WHSK"],
];

export function assetsIn(text: string): string[] {
  return ASSET_WORDS.filter(([re]) => re.test(text)).map(([, a]) => a);
}

export function parseChatIntent(message: string): Intent[] {
  const m = message.toLowerCase();
  const out: Intent[] = [];

  // rate: "slow down to 5/hour", "set rate to 10 usdt per hour", "2 per minute", "100/day"
  const rate = m.match(/(\d+(?:\.\d+)?)\s*(?:usdt|usd|\$)?\s*(?:\/|per|an?|each)\s*(s|sec|second|m|min|minute|h|hr|hour|d|day)s?\b/);
  if (rate && /(rate|slow|speed|stream|faster|down|up|set|change|make)/.test(m)) {
    const n = Number(rate[1]);
    const unit = rate[2];
    const perHour = /^s/.test(unit) ? n * 3600 : /^m/.test(unit) ? n * 60 : /^d/.test(unit) ? n / 24 : n;
    out.push({ kind: "setRate", perHour });
  }

  if (/\b(resume|unpause|restart|start again|continue)\b/.test(m)) out.push({ kind: "resume" });
  else if (/\b(cancel|close (the )?stream|shut ?down|terminate)\b/.test(m)) out.push({ kind: "cancel" });
  else if (/\b(pause|stop|halt|freeze|kill)\b/.test(m)) out.push({ kind: "pause" });

  const patch: Partial<Prefs> = {};
  const risk = m.match(/\brisk\b[^a-z]*(?:to|=|:|level|appetite)?\s*(low|medium|med|high)\b/) ?? m.match(/\b(low|medium|med|high)[- ]risk\b/);
  if (risk) patch.riskAppetite = risk[1] === "med" ? "medium" : (risk[1] as Prefs["riskAppetite"]);
  else if (/\b(conservative|safer|careful)\b/.test(m)) patch.riskAppetite = "low";
  else if (/\b(aggressive|degen|yolo)\b/.test(m)) patch.riskAppetite = "high";

  const only = m.match(/\bonly\s+(?:trade|buy|use|touch)?\s*(.+)$/);
  if (only) {
    const a = assetsIn(only[1]);
    if (a.length) patch.assets = a;
  } else if (/\b(trade|use)\b.*\b(all|every)\b.*\b(assets|tokens|coins)\b/.test(m)) patch.assets = ["WETH", "WBTC", "WHSK"];

  const pos = m.match(/(?:max(?:imum)?\s*position|position\s*(?:size|cap|limit))[^0-9]*(\d+(?:\.\d+)?)\s*%?/);
  if (pos) patch.maxPositionPct = Number(pos[1]);

  const every = m.match(/\bevery\s+(\d+)\s*(s|sec|second|m|min|minute|h|hr|hour)s?\b/);
  if (every) {
    const n = Number(every[1]);
    patch.intervalSec = /^s/.test(every[2]) ? n : /^m/.test(every[2]) ? n * 60 : n * 3600;
  }

  if (/\b(disable|turn off)\b.*\b(agent|trading|ai)\b|\bstop trading\b/.test(m)) patch.enabled = false;
  if (/\b(enable|turn on)\b.*\b(agent|trading|ai)\b|\bstart trading\b/.test(m)) patch.enabled = true;

  if (Object.keys(patch).length) out.push({ kind: "prefs", patch });

  if (/\b(pnl|p&l|p\/l|profit|loss|performance|how am i doing|returns?)\b/.test(m)) out.push({ kind: "pnl" });
  if (/\b(positions?|holdings?|portfolio|balances?|what do (i|you) (hold|own))\b/.test(m)) out.push({ kind: "positions" });
  if (/\b(decisions?|trades?|history|what did you do|why)\b/.test(m) && !out.length) out.push({ kind: "decisions" });

  return out;
}
