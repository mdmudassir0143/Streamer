/** Pure helpers (unit-tested). */

/**
 * minOut = floor(quote * (1e4 - maxSlippageBps) / 1e4) — exactly the vault's floor (it passes iff
 * minAmountOut >= that). Using the floor itself leaves the most room for the venue's 0.3% fee + impact.
 */
export function minAmountOut(quoteOut: bigint, maxSlippageBps: number): bigint {
  return (quoteOut * (10_000n - BigInt(maxSlippageBps))) / 10_000n;
}

/** On-chain floor, for checks/tests. */
export function onchainMinOutFloor(quoteOut: bigint, maxSlippageBps: number): bigint {
  return (quoteOut * (10_000n - BigInt(maxSlippageBps))) / 10_000n;
}

export const bps = (x: bigint, b: number | bigint) => (x * BigInt(b)) / 10_000n;

export function parseUnitsSafe(human: string | number, decimals: number): bigint {
  const s = String(human).trim();
  if (!/^\d*\.?\d*$/.test(s) || s === "" || s === ".") throw new Error(`bad amount: ${human}`);
  const [i, f = ""] = s.split(".");
  const frac = (f + "0".repeat(decimals)).slice(0, decimals);
  return BigInt(i || "0") * 10n ** BigInt(decimals) + BigInt(frac || "0");
}

export function toNum(x: bigint, decimals: number): number {
  return Number(x) / 10 ** decimals;
}

/** priceUsd * 1e18 as bigint, without float blowup. */
export function toE18(price: number): bigint {
  return BigInt(Math.round(price * 1e9)) * 10n ** 9n;
}

export const minBig = (...xs: bigint[]) => xs.reduce((a, b) => (b < a ? b : a));
export const maxBig = (...xs: bigint[]) => xs.reduce((a, b) => (b > a ? b : a));
