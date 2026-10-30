import Anthropic from "@anthropic-ai/sdk";
import { encodeFunctionData, getAddress, isAddress, type Address, type Hex } from "viem";
import { streamVaultAbi } from "./abi.js";
import { config } from "./config.js";
import { allowedTokens, getStream, tokenInfo, vaultAddress } from "./chain.js";
import { parseChatIntent, type Intent } from "./chatRules.js";
import { anthropic, FALLBACK_BETAS, jsonReplacer, llmEnabled, noteLlmError } from "./llm.js";
import { parseUnitsSafe, toNum } from "./math.js";
import { getDecisions, getPrefs, normalizeAssetName, setPrefs } from "./store.js";
import { streamDetail } from "./summary.js";
import type { Prefs, Risk, StreamState } from "./types.js";

export interface UnsignedTx {
  description: string;
  to: Address;
  data: Hex;
  value: "0";
}

export interface ChatResponse {
  reply: string;
  prefsUpdated?: Prefs;
  txs?: UnsignedTx[];
  engine: "llm" | "rules";
}

export class ChatError extends Error {
  constructor(
    public status: number,
    msg: string,
  ) {
    super(msg);
  }
}

export type OnchainAction = "setRate" | "pause" | "resume" | "cancel" | "setRisk" | "setTarget" | "withdraw";
export interface OnchainArgs {
  ratePerHour?: number;
  maxSlippageBps?: number;
  maxTradeBps?: number;
  maxDrawdownBps?: number;
  cooldownSec?: number;
  target?: string;
  token?: string;
  amount?: string | number;
  to?: string;
}

async function resolveToken(st: StreamState, sym: string): Promise<{ address: Address; decimals: number; symbol: string }> {
  if (isAddress(sym)) {
    const t = await tokenInfo(getAddress(sym));
    return t;
  }
  if (/usd/i.test(sym)) return tokenInfo(st.baseToken);
  const norm = normalizeAssetName(sym);
  const t = (await allowedTokens()).find((x) => x.symbol === norm);
  if (!t) throw new Error(`unknown token ${sym}`);
  return t;
}

/** Owner-signed tx builder: the agent never signs these. */
export async function buildOnchainTx(st: StreamState, action: OnchainAction, args: OnchainArgs = {}): Promise<UnsignedTx> {
  const to = vaultAddress();
  const id = st.id;
  const base = await tokenInfo(st.baseToken);
  const mk = (description: string, data: Hex): UnsignedTx => ({ description, to, data, value: "0" });
  switch (action) {
    case "pause":
      return mk(`Pause stream #${id} (stops accrual; agent can't receive new funds)`, encodeFunctionData({ abi: streamVaultAbi, functionName: "pause", args: [id] }));
    case "resume":
      return mk(`Resume stream #${id} (also clears halted + resets high-water mark)`, encodeFunctionData({ abi: streamVaultAbi, functionName: "resume", args: [id] }));
    case "cancel":
      return mk(`Cancel stream #${id} and return every held token to you`, encodeFunctionData({ abi: streamVaultAbi, functionName: "cancel", args: [id] }));
    case "setRate": {
      const perHour = Number(args.ratePerHour);
      if (!(perHour >= 0)) throw new Error("ratePerHour required");
      const perHourUnits = parseUnitsSafe(perHour.toFixed(base.decimals), base.decimals);
      const rate = perHourUnits / 3600n;
      if (perHour > 0 && rate === 0n) throw new Error("rate too small");
      return mk(
        `Set stream #${id} rate to ${perHour} ${base.symbol}/hour (${rate} units/sec)`,
        encodeFunctionData({ abi: streamVaultAbi, functionName: "setRate", args: [id, rate] }),
      );
    }
    case "setRisk": {
      const r: Risk = {
        maxSlippageBps: args.maxSlippageBps ?? st.risk.maxSlippageBps,
        maxTradeBps: args.maxTradeBps ?? st.risk.maxTradeBps,
        maxDrawdownBps: args.maxDrawdownBps ?? st.risk.maxDrawdownBps,
        cooldownSec: args.cooldownSec ?? st.risk.cooldownSec,
      };
      for (const k of ["maxSlippageBps", "maxTradeBps", "maxDrawdownBps"] as const)
        if (!(r[k] >= 0 && r[k] <= 10_000)) throw new Error(`${k} must be 0..10000`);
      return mk(
        `Set stream #${id} risk: slippage ${r.maxSlippageBps}bps, max trade ${r.maxTradeBps}bps, drawdown ${r.maxDrawdownBps}bps, cooldown ${r.cooldownSec}s`,
        encodeFunctionData({ abi: streamVaultAbi, functionName: "setRisk", args: [id, r] }),
      );
    }
    case "setTarget": {
      const t = await resolveToken(st, String(args.target ?? args.token ?? ""));
      return mk(`Set stream #${id} target to ${t.symbol}`, encodeFunctionData({ abi: streamVaultAbi, functionName: "setTarget", args: [id, t.address] }));
    }
    case "withdraw": {
      const t = await resolveToken(st, String(args.token ?? base.symbol));
      const amount = parseUnitsSafe(String(args.amount ?? ""), t.decimals);
      const dest = args.to && isAddress(args.to) ? getAddress(args.to) : st.owner;
      return mk(
        `Withdraw ${args.amount} ${t.symbol} from stream #${id} to ${dest}`,
        encodeFunctionData({ abi: streamVaultAbi, functionName: "withdraw", args: [id, t.address, amount, dest] }),
      );
    }
  }
  throw new Error(`unknown action ${action}`);
}

// ---------- read helpers shared by LLM tools and rules ----------
async function positionsText(id: bigint) {
  const d = await streamDetail(id);
  const lines = d.positions
    .filter((p) => BigInt(p.amount) > 0n)
    .map((p) => `${p.symbol}: ${toNum(BigInt(p.amount), p.decimals).toPrecision(6)} (≈ ${toNum(BigInt(p.valueBase), d.baseDecimals).toFixed(2)} ${d.baseSymbol})`);
  return { d, text: lines.length ? lines.join("\n") : "No holdings yet." };
}

async function pnlText(id: bigint) {
  const d = await streamDetail(id);
  const f = (x: string) => toNum(BigInt(x), d.baseDecimals).toFixed(4);
  return {
    d,
    text: `Equity ${f(d.equity)} ${d.baseSymbol}, streamed ${f(d.totalStreamed)}, withdrawn ${f(d.withdrawnBase)} → PnL ${f(d.pnlBase)} ${d.baseSymbol} (${d.pnlPct.toFixed(2)}%).`,
  };
}

function decisionsBrief(id: bigint, limit = 5) {
  return getDecisions(id.toString(), limit).map((x) => ({
    ts: new Date(x.ts).toISOString(),
    action: x.action,
    amountIn: x.amountIn,
    blocked: x.blocked ?? false,
    txHash: x.txHash,
    reason: x.reason.slice(0, 300),
    engine: x.engine,
  }));
}

// ---------- rules fallback ----------
async function rulesChat(st: StreamState, message: string): Promise<ChatResponse> {
  const intents = parseChatIntent(message);
  const replies: string[] = [];
  const txs: UnsignedTx[] = [];
  let prefsUpdated: Prefs | undefined;
  const run = async (i: Intent) => {
    switch (i.kind) {
      case "pnl":
        replies.push((await pnlText(st.id)).text);
        break;
      case "positions":
        replies.push((await positionsText(st.id)).text);
        break;
      case "decisions": {
        const ds = decisionsBrief(st.id, 3);
        replies.push(ds.length ? ds.map((x) => `${x.ts} ${x.action}${x.blocked ? " (blocked)" : ""}: ${x.reason}`).join("\n") : "No decisions yet.");
        break;
      }
      case "pause":
      case "resume":
      case "cancel":
        txs.push(await buildOnchainTx(st, i.kind));
        replies.push(`Prepared a ${i.kind} transaction for you to sign.`);
        break;
      case "setRate":
        txs.push(await buildOnchainTx(st, "setRate", { ratePerHour: i.perHour }));
        replies.push(`Prepared setRate to ${i.perHour}/hour for you to sign.`);
        break;
      case "prefs":
        prefsUpdated = setPrefs(st.id.toString(), i.patch);
        replies.push(`Updated agent preferences: ${JSON.stringify(i.patch)}.`);
        break;
    }
  };
  for (const i of intents) await run(i);
  if (!replies.length)
    replies.push(
      'I can help with: "pnl", "positions", "pause"/"stop", "resume", "cancel", "slow down to N/hour", "risk low|medium|high", "only trade ETH", "every 5 min".',
    );
  return { reply: replies.join("\n"), engine: "rules", ...(prefsUpdated ? { prefsUpdated } : {}), ...(txs.length ? { txs } : {}) };
}

// ---------- LLM chat with tools ----------
const TOOLS: Anthropic.Beta.BetaTool[] = [
  { name: "get_positions", description: "Current token holdings of this stream with values in the base token.", input_schema: { type: "object", properties: {} } },
  { name: "get_pnl", description: "Equity, total streamed, withdrawn and PnL of this stream.", input_schema: { type: "object", properties: {} } },
  {
    name: "get_recent_decisions",
    description: "Most recent agent decisions (trades, holds, vetoes) with reasons.",
    input_schema: { type: "object", properties: { limit: { type: "integer", description: "1-20, default 5" } } },
  },
  {
    name: "update_prefs",
    description:
      "Update agent-side preferences, applied immediately (no signature needed). Only include fields the user wants to change.",
    input_schema: {
      type: "object",
      properties: {
        riskAppetite: { type: "string", enum: ["low", "medium", "high"] },
        assets: { type: "array", items: { type: "string", enum: ["WETH", "WBTC", "WHSK"] } },
        maxPositionPct: { type: "number", description: "max % of equity in one asset, 1-100" },
        intervalSec: { type: "integer", description: "seconds between agent decisions, >=10" },
        enabled: { type: "boolean", description: "whether the agent trades this stream" },
      },
    },
  },
  {
    name: "propose_onchain",
    description:
      "Prepare an unsigned on-chain transaction for the stream OWNER to sign in the dashboard (the agent never signs owner actions). " +
      "setRate needs ratePerHour (base token units per hour, human units e.g. 5 = 5 USDT/hour). setRisk takes any of maxSlippageBps/maxTradeBps/maxDrawdownBps/cooldownSec (others keep current values). " +
      "setTarget needs target (WETH/WBTC/WHSK). withdraw needs token and amount (human units), optional to.",
    input_schema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["setRate", "pause", "resume", "cancel", "setRisk", "setTarget", "withdraw"] },
        args: {
          type: "object",
          properties: {
            ratePerHour: { type: "number" },
            maxSlippageBps: { type: "integer" },
            maxTradeBps: { type: "integer" },
            maxDrawdownBps: { type: "integer" },
            cooldownSec: { type: "integer" },
            target: { type: "string" },
            token: { type: "string" },
            amount: { type: "string" },
            to: { type: "string" },
          },
        },
      },
      required: ["action"],
    },
  },
];

async function llmChat(st: StreamState, message: string): Promise<ChatResponse> {
  const client = anthropic!;
  const id = st.id;
  const txs: UnsignedTx[] = [];
  let prefsUpdated: Prefs | undefined;
  const base = await tokenInfo(st.baseToken);
  const context = {
    streamId: id.toString(),
    mode: st.mode === 0 ? "AGENT" : "INVEST",
    ratePerHour: toNum(st.ratePerSec * 3600n, base.decimals),
    baseSymbol: base.symbol,
    paused: st.paused,
    halted: st.halted,
    cancelled: st.cancelled,
    onchainRisk: st.risk,
    prefs: getPrefs(id.toString()),
    chainId: config.chainId,
  };
  const system = `You are StreamPilot, the AI trading agent operating a user's payment stream on HashKey Chain. The user streams ${base.symbol} to a vault at a fixed rate; you may only trade what has been streamed so far. Pausing/cancelling the stream is their kill switch.
Answer briefly and concretely. Use tools to read live data rather than guessing. Agent-side preferences (risk appetite, assets, frequency, position size, enabled) you change directly with update_prefs. On-chain changes (rate, pause, resume, cancel, on-chain risk limits, target, withdraw) must go through propose_onchain; tell the user they need to sign the prepared transaction in the dashboard. Never claim an on-chain change already happened.
Stream context: ${JSON.stringify(context, jsonReplacer)}`;

  const runTool = async (name: string, input: any): Promise<string> => {
    switch (name) {
      case "get_positions":
        return (await positionsText(id)).text;
      case "get_pnl":
        return (await pnlText(id)).text;
      case "get_recent_decisions":
        return JSON.stringify(decisionsBrief(id, Math.min(20, Math.max(1, Number(input?.limit) || 5))));
      case "update_prefs":
        prefsUpdated = setPrefs(id.toString(), input ?? {});
        return `prefs now ${JSON.stringify(prefsUpdated)}`;
      case "propose_onchain": {
        const tx = await buildOnchainTx(st, input.action, input.args ?? {});
        txs.push(tx);
        return `prepared unsigned tx: ${tx.description}`;
      }
    }
    throw new Error(`unknown tool ${name}`);
  };

  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: message }];
  let reply = "";
  for (let turn = 0; turn < 6; turn++) {
    const res = await client.beta.messages.create({
      model: config.chatModel,
      max_tokens: 4000,
      betas: FALLBACK_BETAS,
      fallbacks: "default",
      output_config: { effort: "low" },
      system,
      tools: TOOLS,
      messages,
    });
    if (res.stop_reason === "refusal") throw new Error("refusal");
    reply = res.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    if (res.stop_reason !== "tool_use") break;
    messages.push({ role: "assistant", content: res.content as Anthropic.Beta.BetaContentBlockParam[] });
    const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const b of res.content) {
      if (b.type !== "tool_use") continue;
      try {
        results.push({ type: "tool_result", tool_use_id: b.id, content: await runTool(b.name, b.input) });
      } catch (e) {
        results.push({ type: "tool_result", tool_use_id: b.id, content: `error: ${(e as Error).message}`, is_error: true });
      }
    }
    messages.push({ role: "user", content: results });
  }
  return { reply: reply || "Done.", engine: "llm", ...(prefsUpdated ? { prefsUpdated } : {}), ...(txs.length ? { txs } : {}) };
}

export async function handleChat(body: { streamId?: unknown; owner?: unknown; message?: unknown }): Promise<ChatResponse> {
  const message = String(body.message ?? "").slice(0, 4000);
  if (!message.trim()) throw new ChatError(400, "message required");
  let id: bigint;
  try {
    id = BigInt(String(body.streamId));
  } catch {
    throw new ChatError(400, "streamId required");
  }
  const owner = String(body.owner ?? "");
  const st = await getStream(id).catch(() => {
    throw new ChatError(404, `stream ${id} not found`);
  });
  // Demo-grade auth: the caller must claim to be the stream owner (no signature check).
  if (!isAddress(owner) || owner.toLowerCase() !== st.owner.toLowerCase()) throw new ChatError(403, "owner does not match stream owner");
  if (llmEnabled()) {
    try {
      return await llmChat(st, message);
    } catch (e) {
      noteLlmError(e);
    }
  }
  return rulesChat(st, message);
}
