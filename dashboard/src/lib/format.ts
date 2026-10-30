import { formatUnits } from 'viem';

export function fmtUnits(v: bigint, decimals: number, maxFrac = 2, minFrac = maxFrac): string {
  const n = Number(formatUnits(v, decimals));
  return n.toLocaleString('en-US', { minimumFractionDigits: minFrac, maximumFractionDigits: maxFrac });
}
export const fmtUsdt = (v: bigint, frac = 2) => fmtUnits(v, 6, frac);
/** P&L: show 4 decimals for sub-dollar amounts so small moves are visible. */
export const fmtPnl = (v: bigint) => fmtUnits(v, 6, (v < 0n ? -v : v) < 1_000_000n ? 4 : 2);
/** Precise ticker string for the live meter (4 decimals so per-second motion is visible). */
export const fmtTick = (v: bigint) => fmtUnits(v, 6, 4);

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
