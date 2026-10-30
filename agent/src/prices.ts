import { readJson, writeJson } from "./store.js";
import { allowedTokens, baseTokenAddress, quote, tokenInfo } from "./chain.js";
import { toNum } from "./math.js";

export const ASSET_TO_CEX: Record<string, string> = { WETH: "ETH", WBTC: "BTC", WHSK: "HSK" };

export interface PriceSnapshot {
  ts: number;
  prices: Record<string, number>; // CEX USD
  venue: Record<string, number>; // venue USDT per asset
  source: Record<string, string>;
}

interface Sample {
  ts: number;
  p: Record<string, number>;
}

const HISTORY_FILE = "prices.json";
const MAX_AGE_MS = 6 * 60 * 60 * 1000;
let history: Sample[] = readJson<Sample[]>(HISTORY_FILE, []);
let latest: PriceSnapshot | undefined;
let lastPersist = 0;

async function getJson(url: string): Promise<any> {
  const res = await fetch(url, { signal: AbortSignal.timeout(8000), headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return res.json();
}

export async function fetchCex(): Promise<{ prices: Record<string, number>; source: Record<string, string> }> {
  const prices: Record<string, number> = {};
  const source: Record<string, string> = {};
  const jobs = [
    ["WETH", "https://api.coinbase.com/v2/prices/ETH-USD/spot", "coinbase:ETH-USD", (j: any) => Number(j.data.amount)],
    ["WBTC", "https://api.coinbase.com/v2/prices/BTC-USD/spot", "coinbase:BTC-USD", (j: any) => Number(j.data.amount)],
    [
      "WHSK",
      "https://api.gateio.ws/api/v4/spot/tickers?currency_pair=HSK_USDT",
      "gate:HSK_USDT",
      (j: any) => Number((Array.isArray(j) ? j[0] : j).last),
    ],
  ] as const;
  await Promise.all(
    jobs.map(async ([asset, url, src, pick]) => {
      try {
        const v = pick(await getJson(url));
        if (Number.isFinite(v) && v > 0) {
          prices[asset] = v;
          source[asset] = src;
        }
      } catch (e) {
        // fall back to last known
        const last = latest?.prices[asset];
        if (last) {
          prices[asset] = last;
          source[asset] = `${src} (stale: ${(e as Error).message})`;
        }
      }
    }),
  );
  return { prices, source };
}

export async function fetchVenuePrices(): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  try {
    const baseAddr = await baseTokenAddress();
    if (!baseAddr) return out;
    const base = await tokenInfo(baseAddr);
    for (const t of await allowedTokens()) {
      if (t.address.toLowerCase() === baseAddr.toLowerCase() || !ASSET_TO_CEX[t.symbol]) continue;
      try {
        const q = await quote(t.address, baseAddr, 10n ** BigInt(t.decimals));
        out[t.symbol] = toNum(q, base.decimals);
      } catch {
        /* pool may not exist */
      }
    }
  } catch {
    /* no deployment */
  }
  return out;
}

export async function refreshPrices(): Promise<PriceSnapshot> {
  const [{ prices, source }, venue] = await Promise.all([fetchCex(), fetchVenuePrices()]);
  latest = { ts: Date.now(), prices, venue, source };
  if (Object.keys(prices).length) {
    history.push({ ts: latest.ts, p: prices });
    history = history.filter((s) => latest!.ts - s.ts < MAX_AGE_MS);
    if (Date.now() - lastPersist > 30_000) {
      writeJson(HISTORY_FILE, history);
      lastPersist = Date.now();
    }
  }
  return latest;
}

export async function getPrices(maxAgeMs = 15_000): Promise<PriceSnapshot> {
  if (latest && Date.now() - latest.ts < maxAgeMs) return latest;
  return refreshPrices();
}

export interface Momentum {
  r1m: number | null;
  r5m: number | null;
  r15m: number | null;
  samples: number;
}

/** % returns vs nearest sample at-or-before t-window (null if not enough history). */
export function momentumFrom(samples: Sample[], asset: string, now = Date.now()): Momentum {
  const pts = samples.filter((s) => s.p[asset] > 0);
  const cur = pts.at(-1)?.p[asset];
  const ret = (winMs: number) => {
    if (!cur) return null;
    let ref: Sample | undefined;
    for (const s of pts) if (s.ts <= now - winMs) ref = s;
    // accept slightly short windows (>=70% of target) when history is young
    if (!ref) {
      const first = pts[0];
      if (first && now - first.ts >= winMs * 0.7) ref = first;
    }
    return ref ? ((cur - ref.p[asset]) / ref.p[asset]) * 100 : null;
  };
  return { r1m: ret(60_000), r5m: ret(300_000), r15m: ret(900_000), samples: pts.length };
}

export function momentum(asset: string): Momentum {
  return momentumFrom(history, asset);
}
