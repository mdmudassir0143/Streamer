import type { Address, Hex } from "viem";

export type Engine = "llm" | "rules";
export type View = "bullish" | "bearish" | "neutral";

export interface Prefs {
  riskAppetite: "low" | "medium" | "high";
  assets: string[]; // WETH | WBTC | WHSK
  maxPositionPct: number; // 1..100, max % of equity in any one non-base asset
  intervalSec: number;
  enabled: boolean;
}

export interface Risk {
  maxSlippageBps: number;
  maxTradeBps: number;
  maxDrawdownBps: number;
  cooldownSec: number;
}

export interface StreamState {
  id: bigint;
  owner: Address;
  agent: Address;
  baseToken: Address;
  targetToken: Address;
  mode: number; // 0 AGENT, 1 INVEST
  ratePerSec: bigint;
  startTime: bigint;
  endTime: bigint;
  maxTotal: bigint;
  totalStreamed: bigint;
  lastAccrual: bigint;
  lastTradeAt: bigint;
  paused: boolean;
  halted: boolean;
  cancelled: boolean;
  highWaterMark: bigint;
  risk: Risk;
}

export interface TokenInfo {
  address: Address;
  symbol: string; // normalized: WETH | WBTC | WHSK | USDT | raw symbol
  rawSymbol: string;
  decimals: number;
}

export interface Position {
  token: Address;
  symbol: string;
  decimals: number;
  amount: bigint;
  valueBase: bigint;
}

export interface AssetView {
  asset: string;
  view: View;
  conviction: number; // 0..1
  rationale: string;
}

export interface AnalystOutput {
  engine: Engine;
  views: AssetView[];
  summary: string;
}

export interface TradeProposal {
  action: "buy" | "sell" | "hold";
  asset?: string;
  tokenIn?: Address;
  tokenOut?: Address;
  amountIn: bigint;
  valueBase: bigint; // value of amountIn in base units
  reason: string;
}

export interface RiskOutput {
  engine: Engine;
  verdict: "approve" | "resize" | "veto";
  reason: string;
  checks: { name: string; ok: boolean; detail: string }[];
  finalAmountIn: bigint;
}

/** Spec Decision shape (+ engine, chainId and a few extra fields). bigints serialized as decimal strings. */
export interface Decision {
  ts: number; // unix ms
  chainId: number;
  streamId: string;
  action: "buy" | "sell" | "hold";
  tokenIn: Address | null;
  tokenOut: Address | null;
  amountIn: string;
  minAmountOut?: string;
  amountOut?: string;
  reason: string;
  analyst: unknown;
  risk: unknown;
  txHash?: Hex;
  reasonHash: Hex;
  blocked?: boolean;
  error?: string;
  engine: Engine;
}
