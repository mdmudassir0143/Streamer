import { agentAccount, equityOf, getStream, listStreams, owedOf, ownerFunding, positions, quote, tokenInfo, withdrawalsOf } from "./chain.js";
import { maxBig, minBig, toNum } from "./math.js";
import { getPrefs } from "./store.js";
import type { StreamState } from "./types.js";

const s = (x: bigint) => x.toString();

export async function streamSummary(st: StreamState) {
  const [base, target, equity, owed] = await Promise.all([
    tokenInfo(st.baseToken),
    tokenInfo(st.targetToken).catch(() => undefined),
    equityOf(st.id),
    owedOf(st.id),
  ]);
  return {
    id: s(st.id),
    owner: st.owner,
    agent: st.agent,
    baseToken: st.baseToken,
    targetToken: st.targetToken,
    baseSymbol: base.symbol,
    baseDecimals: base.decimals,
    targetSymbol: target?.symbol ?? null,
    mode: st.mode,
    modeName: st.mode === 0 ? "AGENT" : "INVEST",
    ratePerSec: s(st.ratePerSec),
    ratePerHour: toNum(st.ratePerSec * 3600n, base.decimals),
    startTime: Number(st.startTime),
    endTime: Number(st.endTime),
    maxTotal: s(st.maxTotal),
    totalStreamed: s(st.totalStreamed),
    lastAccrual: Number(st.lastAccrual),
    lastTradeAt: Number(st.lastTradeAt),
    paused: st.paused,
    halted: st.halted,
    cancelled: st.cancelled,
    highWaterMark: s(st.highWaterMark),
    risk: st.risk,
    equity: s(equity),
    owed: s(owed),
    managedByUs: !!agentAccount && st.agent.toLowerCase() === agentAccount.address.toLowerCase(),
    prefs: getPrefs(s(st.id)),
  };
}

export async function listSummaries(owner?: string) {
  const all = await listStreams();
  const ids = all.filter((x) => !owner || x.owner.toLowerCase() === owner.toLowerCase()).map((x) => x.id);
  const states = await Promise.all(ids.map((id) => getStream(id)));
  return Promise.all(states.map(streamSummary));
}

export async function streamDetail(id: bigint) {
  const st = await getStream(id);
  const [summary, pos, w, funding] = await Promise.all([streamSummary(st), positions(st), withdrawalsOf(id), ownerFunding(st)]);
  const equity = BigInt(summary.equity);
  const owed = BigInt(summary.owed);
  // withdrawn value in base: base withdrawals at face, other tokens at current venue quote
  let withdrawnBase = 0n;
  for (const x of w) {
    if (x.token.toLowerCase() === st.baseToken.toLowerCase()) withdrawnBase += x.amount;
    else withdrawnBase += await quote(x.token, st.baseToken, x.amount).catch(() => 0n);
  }
  const netContributed = st.totalStreamed - withdrawnBase; // spec: pnl = equity - (totalStreamed - withdrawn)
  const pnlBase = equity - netContributed;
  const pnlPct = st.totalStreamed > 0n ? (Number(pnlBase) / Number(st.totalStreamed)) * 100 : 0;
  const pullableNow = minBig(owed, funding.allowance, funding.balance);
  const remainingCap = st.maxTotal > 0n ? maxBig(0n, st.maxTotal - st.totalStreamed) : funding.balance;
  const unstreamed = st.cancelled ? 0n : maxBig(0n, minBig(funding.allowance, funding.balance, remainingCap) - pullableNow);
  return {
    ...summary,
    positions: pos.map((p) => ({ token: p.token, symbol: p.symbol, decimals: p.decimals, amount: s(p.amount), valueBase: s(p.valueBase) })),
    pnlBase: s(pnlBase),
    pnlPct,
    exposedBase: s(equity + pullableNow), // what the agent can touch right now (held + accrued-but-unpulled)
    unstreamedBase: s(unstreamed), // still in owner's wallet, reachable later via allowance
    withdrawnBase: s(withdrawnBase),
    ownerAllowance: s(funding.allowance),
    ownerBalance: s(funding.balance),
  };
}
