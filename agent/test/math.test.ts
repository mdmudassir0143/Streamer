import { describe, expect, it } from "vitest";
import { minAmountOut, onchainMinOutFloor, parseUnitsSafe, toE18 } from "../src/math.js";
import { priceE18For } from "../src/keeper.js";

describe("minAmountOut", () => {
  it("is always >= on-chain floor and <= quote", () => {
    for (const slip of [0, 1, 10, 30, 50, 100, 300, 1000]) {
      for (const q of [1n, 999n, 123456789n, 10n ** 24n + 7n]) {
        const m = minAmountOut(q, slip);
        expect(m).toBe(onchainMinOutFloor(q, slip));
        expect(m <= q).toBe(true);
      }
    }
  });
  it("equals the on-chain floor exactly", () => {
    expect(minAmountOut(1_000_000n, 100)).toBe(990_000n);
    expect(minAmountOut(999n, 30)).toBe(996n); // floor(999*9970/1e4)=996.003
    expect(minAmountOut(12345n, 0)).toBe(12345n);
  });
});

describe("units", () => {
  it("parses human amounts", () => {
    expect(parseUnitsSafe("1.5", 6)).toBe(1_500_000n);
    expect(parseUnitsSafe("0.0000001", 6)).toBe(0n);
    expect(parseUnitsSafe(2, 18)).toBe(2n * 10n ** 18n);
    expect(() => parseUnitsSafe("-1", 6)).toThrow();
  });
  it("syncPrice encodings", () => {
    expect(toE18(3000.5)).toBe(3000_500_000_000_000_000_000n);
    expect(priceE18For(3000, "human", 6, 18)).toBe(3000n * 10n ** 18n);
    // raw: base units per asset unit = 3000e6/1e18 → *1e18 = 3000e6
    expect(priceE18For(3000, "raw", 6, 18)).toBe(3000n * 10n ** 6n);
    expect(priceE18For(60000, "raw", 6, 8)).toBe(60000n * 10n ** 16n);
  });
});
