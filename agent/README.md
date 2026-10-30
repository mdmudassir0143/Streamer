# StreamPilot agent

This is the Node 22 + TypeScript runtime that runs the multi-agent trading pipeline, the INVEST keeper, the testnet price-sync keeper and the HTTP API the dashboard reads. The contract and API contract live in `../docs/SPEC.md`.

## Run

```bash
cd agent
npm install
npm start            # tsx src/index.ts   (npm run dev = watch mode)
npm run typecheck
npm test             # vitest: risk checks, minOut math, syncPrice encoding, chat fallback parser
```

Configuration comes from the root `../.env`. Variables already set in your shell take precedence. The agent reads:

- `CHAIN_ID` (31337 / 133 / 177)
- `RPC_URL` (`MAINNET_RPC_URL` on 177)
- `AGENT_KEY`
- `DEPLOYER_KEY` (only used as a fallback signer for `syncPrice`)
- `ANTHROPIC_API_KEY`
- `AGENT_API_PORT` (default 8787)

It loads the addresses from `../deployments/<CHAIN_ID>.json`. If `../deployments/abi/StreamVault.json` exists, that ABI is used instead of the hand-written one in `src/abi.ts`.

Local anvil:

```bash
CHAIN_ID=31337 RPC_URL=http://127.0.0.1:8545 npm start
```

Optional tuning variables:

| Variable | Default | Effect |
|---|---|---|
| `DEFAULT_INTERVAL_SEC` | 60 | Default tick interval per stream (overridable via prefs) |
| `PRICE_SYNC_SEC` | 30 | Interval of the price-sync keeper |
| `MIN_TRADE_BASE` | 0.5 (1 on mainnet) | Minimum trade size, so gas isn't wasted |
| `INVEST_MIN_BASE` | 1 | Base amount that triggers `invest` |
| `INVEST_MAX_IDLE_SEC` | 300 | Also triggers `invest` after this long with any balance |
| `ANALYST_MODEL` | claude-sonnet-5-5 | Model for the analyst and risk calls |
| `CHAT_MODEL` | claude-opus-5-5 | Model for chat |
| `AGENT_DATA_DIR` | `./data` | Where state files are written |

## What runs

- **Tick loop** (scheduler every 5s, each stream on its own `prefs.intervalSec`). It covers every AGENT-mode stream that meets all of these conditions:
  - `stream.agent` is this agent's address
  - the stream is not paused or cancelled
  - `prefs.enabled` is true

  Each tick runs these stages in order:
  1. **Analyst** (`agents/analyst.ts`): the LLM reads CEX prices, venue prices, 1m/5m/15m momentum, the venue-vs-CEX spread, positions and prefs, then returns a view per asset (bullish/bearish/neutral, conviction 0–1, rationale).
  2. **Proposer** (`agents/proposer.ts`): deterministic sizing.
  3. **Risk officer** (`agents/risk.ts`): the LLM can approve, resize down or veto. Deterministic hard checks then run on top, mirroring the on-chain `Risk` and the prefs:
     - status (paused / halted / cancelled / mode)
     - `maxTradeBps` = 0 or `maxSlippageBps` = 0 → veto
     - cooldown (against chain time)
     - `maxTradeBps` of equity
     - `prefs.maxPositionPct`
     - balance
     - minimum trade size
  4. **Executor** (`agents/executor.ts`): computes `minOut = floor(quote·(1e4−maxSlippageBps)/1e4)` from `venue.quote` and sets `reasonHash = keccak256(JSON decision)`. It then simulates, sends `trade` and waits for the receipt. On `SlippageTooLoose` it re-quotes once and retries.

  Every decision is appended to `data/decisions.json`, including holds, vetoes (`blocked: true`) and failed txs (`blocked: true`, `error`). Each one carries `engine: "llm" | "rules"`.
- **No API key, or the API fails** (billing, auth, refusal, timeout): the pipeline uses the deterministic momentum + spread rules and the hard checks, and labels decisions `engine: "rules"`. After an auth or billing error the LLM is switched off for 10 minutes. LLM calls use structured outputs (`messages.parse` + zod) at effort `low`, with server-side refusal fallback (`fallbacks: "default"`).
- **INVEST keeper**: calls `invest(id)` for INVEST streams once held + owed base reaches `INVEST_MIN_BASE`, or after `INVEST_MAX_IDLE_SEC` with any balance.
- **Price-sync keeper** (31337/133 only): calls `MockAMMVenue.syncPrice(asset, usdPrice·1e18)` when the venue is more than 0.1% away from the CEX price. It signs with `AGENT_KEY`, which is the venue keeper; it falls back to `DEPLOYER_KEY` if that key is the venue owner.
- **Price sources**:
  - Coinbase ETH-USD and BTC-USD
  - Gate HSK_USDT

  Rolling history is kept in `data/prices.json`.

## HTTP API (CORS on)

| Method | Path | Notes |
|---|---|---|
| GET | `/api/health` | |
| GET | `/api/prices` | |
| GET | `/api/streams?owner=0x..` | |
| GET | `/api/streams/:id` | Stream detail |
| GET | `/api/streams/:id/decisions?limit=100` | Newest first |
| GET / PUT | `/api/streams/:id/prefs` | |
| POST | `/api/chat` | Body: `{ streamId, owner, message }` |

The response conventions follow the spec:

- uint128/uint256 values are decimal strings in raw token units.
- Timestamps in decisions and prices are unix **ms**.
- Stream times are unix seconds, as stored on chain.

Field definitions:

- `pnlBase = equity − (totalStreamed − withdrawnValue)`. `withdrawnValue` comes from `Withdrawn` events: base at face value, other tokens at the current venue quote. Cancel sweeps emit `Withdrawn`, so they are included.
- `exposedBase = equity + owed-and-pullable-now`: what the agent can touch right now.
- `unstreamedBase = min(allowance, owner balance, remaining maxTotal) − pullable-now`: what is still in the owner's wallet.

**Chat**: the agent applies agent-side prefs directly. On-chain owner actions (setRate, pause, resume, cancel, setRisk, setTarget, withdraw) come back as unsigned `txs` (`to` = vault, `data` = calldata, `value: "0"`) for the owner to sign. The agent never signs them.

The rule-based fallback understands:

- "pnl", "positions"
- "pause" / "stop", "resume", "cancel"
- "slow down to N/hour" (also /min and /day)
- "risk low|medium|high"
- "only trade ETH"
- "every 5 min"

**Auth (demo only):** `/api/chat` only checks that the `owner` field in the request equals `stream.owner`. There is no signature check. `PUT /prefs` is unauthenticated. Put a real wallet-signature check in front of both before mainnet use.

## Data files (`data/`, gitignored)

- `decisions.json`: all chains; every decision has `chainId`
- `prefs.json`: keyed `chainId:streamId`
- `prices.json`: price history
- `index-<chainId>.json`: indexed `StreamCreated` / `Withdrawn` logs (read in chunks of 9k blocks from `startBlock`)
