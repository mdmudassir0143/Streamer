import fs from "node:fs";
import path from "node:path";
import { DATA_DIR, config } from "./config.js";
import type { Decision, Prefs } from "./types.js";

export function readJson<T>(file: string, def: T): T {
  try {
    return JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), "utf8")) as T;
  } catch {
    return def;
  }
}

export function writeJson(file: string, value: unknown) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const p = path.join(DATA_DIR, file);
  const tmp = `${p}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2));
  fs.renameSync(tmp, p);
}

// ---------- decisions ----------
const MAX_DECISIONS = 5000;
let decisions: Decision[] | undefined;
const decisionsFile = () => "decisions.json";

function loadDecisions(): Decision[] {
  decisions ??= readJson<Decision[]>(decisionsFile(), []);
  return decisions;
}

export function recordDecision(d: Decision) {
  const all = loadDecisions();
  all.push(d);
  if (all.length > MAX_DECISIONS) all.splice(0, all.length - MAX_DECISIONS);
  writeJson(decisionsFile(), all);
}

export function getDecisions(streamId: string, limit = 100): Decision[] {
  return loadDecisions()
    .filter((d) => d.streamId === streamId && (d.chainId ?? config.chainId) === config.chainId)
    .slice(-limit)
    .reverse();
}

// ---------- prefs ----------
export const DEFAULT_PREFS: Prefs = {
  riskAppetite: "medium",
  assets: ["WETH", "WBTC", "WHSK"],
  maxPositionPct: 50,
  intervalSec: config.defaultIntervalSec,
  enabled: true,
};

let prefs: Record<string, Prefs> | undefined;
const prefsFile = () => "prefs.json";
const prefsKey = (id: string) => `${config.chainId}:${id}`;

export function getPrefs(streamId: string): Prefs {
  prefs ??= readJson<Record<string, Prefs>>(prefsFile(), {});
  return { ...DEFAULT_PREFS, ...(prefs[prefsKey(streamId)] ?? {}) };
}

export const ASSETS = ["WETH", "WBTC", "WHSK"] as const;

export function sanitizePrefs(patch: Partial<Prefs>, base: Prefs): Prefs {
  const out = { ...base };
  if (patch.riskAppetite && ["low", "medium", "high"].includes(patch.riskAppetite)) out.riskAppetite = patch.riskAppetite;
  if (Array.isArray(patch.assets)) {
    const a = patch.assets
      .map((s) => normalizeAssetName(String(s)))
      .filter((s): s is string => !!s);
    if (a.length) out.assets = [...new Set(a)];
  }
  if (patch.maxPositionPct !== undefined && Number.isFinite(Number(patch.maxPositionPct)))
    out.maxPositionPct = Math.min(100, Math.max(1, Number(patch.maxPositionPct)));
  if (patch.intervalSec !== undefined && Number.isFinite(Number(patch.intervalSec)))
    out.intervalSec = Math.min(86400, Math.max(10, Math.round(Number(patch.intervalSec))));
  if (typeof patch.enabled === "boolean") out.enabled = patch.enabled;
  return out;
}

export function normalizeAssetName(s: string): string | undefined {
  const u = s.toUpperCase();
  if (/BTC/.test(u)) return "WBTC";
  if (/ETH/.test(u)) return "WETH";
  if (/HSK/.test(u)) return "WHSK";
  return undefined;
}

export function setPrefs(streamId: string, patch: Partial<Prefs>): Prefs {
  const next = sanitizePrefs(patch, getPrefs(streamId));
  prefs ??= {};
  prefs[prefsKey(streamId)] = next;
  writeJson(prefsFile(), prefs);
  return next;
}
