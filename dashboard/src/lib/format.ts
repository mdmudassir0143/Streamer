import { formatUnits } from 'viem';

export function fmtUnits(v: bigint, decimals: number, maxFrac = 2, minFrac = maxFrac): string {
  const n = Number(formatUnits(v, decimals));
  return n.toLocaleString('en-US', { minimumFractionDigits: minFrac, maximumFractionDigits: maxFrac });
}
/*
 * Number formatting rules (one place, used everywhere):
 *  - USDT amounts: 2 decimals            fmtUsdt
 *  - live ticking headline: 4 decimals   fmtTick (only the worst-case headline)
 *  - P&L: sign + 2 decimals, "<0.01"     fmtPnl  (returns text + exact title)
 *  - percentages: 2 decimals             fmtPct
 *  - token amounts: ≤ 6 significant      fmtToken
 */
export const fmtUsdt = (v: bigint) => fmtUnits(v, 6, 2);
export const fmtTick = (v: bigint) => fmtUnits(v, 6, 4);

/** `dust` = rounds to 0.00; shown neutral ("0.00") with the exact signed value in the tooltip. */
export function fmtPnl(v: bigint): { text: string; title: string; dust: boolean } {
  const exact = `${v > 0n ? '+' : v < 0n ? '−' : ''}${fmtUnits(v < 0n ? -v : v, 6, 6, 2)} USDT`;
  const abs = v < 0n ? -v : v;
  if (abs < 5_000n) return { text: '0.00', title: exact, dust: true };
  return { text: `${v > 0n ? '+' : '−'}${fmtUnits(abs, 6, 2)}`, title: exact, dust: false };
}

export function fmtPct(n: number, signed = false): string {
  if (Math.abs(n) < 0.005) return '0.00%';
  const s = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${signed ? (n > 0 ? '+' : n < 0 ? '−' : '') : n < 0 ? '−' : ''}${s}%`;
}

export function fmtToken(v: bigint, decimals: number): string {
  const n = Number(formatUnits(v, decimals));
  if (n === 0) return '0';
  return n.toLocaleString('en-US', { maximumSignificantDigits: 6 });
}

export function ratePerHour(ratePerSec: bigint): string {
  return fmtUnits(ratePerSec * 3600n, 6, 2);
}
export function shortAddr(a?: string) {
  return a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '';
}
export function fmtDuration(sec: number): string {
  if (sec <= 0) return '0s';
  const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60), s = Math.floor(sec % 60);
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${s}s`;
  return `${s}s`;
}
export function timeAgo(ts: number): string {
  const ms = ts > 1e12 ? ts : ts * 1000;
  const s = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
/** Parses agent-API numbers which may be base-unit strings or decimals. */
export function toBaseUnits(v: unknown, decimals = 6): bigint | null {
  if (v == null) return null;
  if (typeof v === 'bigint') return v;
  // Convention: integer strings are base units; JS numbers / decimal strings are human units.
  if (typeof v === 'string' && /^-?\d+$/.test(v)) return BigInt(v);
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return BigInt(Math.round(n * 10 ** decimals));
}

/** Compact age: "45s", "12m", "3h", "2d". */
export function ageShort(ts: number): string {
  const ms = ts > 1e12 ? ts : ts * 1000;
  const s = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

/** Amount of any token: USDT-like (6 decimals) as 2-decimal money, others at ≤ 6 significant figures. */
export function fmtAmount(v: bigint, decimals: number): string {
  return decimals === 6 ? fmtUsdt(v) : fmtToken(v, decimals);
}
