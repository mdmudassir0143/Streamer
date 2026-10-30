# StreamPilot

**Your AI trader can only touch what you've streamed.**

StreamPilot is an autonomous AI trading agent on [HashKey Chain](https://hsk.xyz) that never holds your whole deposit.
You stream USDT to it by the second, and it can only trade what has already streamed in. Your worst case is
`rate × time elapsed`, not your balance. Pausing the stream, cancelling it, or revoking the USDT allowance is the kill switch.

Built for the **HSK Chain Horizon Hackathon · Mumbai**, Track 1: **AI Agent Trading**.

---

## The problem

Every AI trading bot asks for the same thing: deposit your capital into a vault and trust the bot. Risk limits help, but
from the first second your entire deposit is exposed to a model you can't audit, running a strategy you can't see,
on a venue that might get manipulated.

## The idea: capital on demand

| | Vault bots | StreamPilot |
|---|---|---|
| Capital at risk on day 1 | Your whole deposit | Only what has streamed in so far |
| Where unstreamed funds sit | In the bot's vault | **In your own wallet** (pulled per second via allowance) |
| Worst-case loss | Deposit × drawdown limit | `rate × hours`, bounded and visible live |
| Kill switch | Withdraw and hope it's not mid-trade | Pause or cancel, or just revoke the USDT allowance from any wallet UI |
| Agent can withdraw? | Depends on the vault | **Never.** It can only swap inside the vault, between allowed tokens |

## Two modes, one primitive

**AI Agent mode**: a three-role agent pipeline trades the streamed balance on HSKSwap:

1. **Analyst** (LLM): reads CEX prices (Coinbase, Gate), on-chain venue prices, momentum and the venue-vs-CEX spread, and forms a view per asset.
2. **Risk officer** (LLM plus deterministic checks that mirror the on-chain limits): approves, resizes or vetoes the trade.
3. **Executor** (deterministic): builds `minAmountOut` from the venue's TWAP quote and calls `trade()` with
   `reasonHash = keccak256(decision JSON)`, so every trade is tied to its rationale on-chain.

You talk to it in natural language ("What's my P&L?", "Only trade ETH, low risk", "Slow the stream to 2 USDT/hour").
Strategy preferences are applied directly. On-chain changes come back as unsigned transactions for **you** to sign, because
the agent is never the owner.

**Invest mode**: per-second DCA. The stream is converted into ETH, BTC or HSK as it arrives, with no AI involved.
Anyone can trigger `invest()`, and every swap is guarded against the TWAP.

## On-chain safety (enforced by `StreamVault`, not by the agent)

- **Slippage vs TWAP**: `minAmountOut ≥ quote × (1 − maxSlippageBps)`, where quote is the pool's 60s TWAP (Uniswap v3 `observe`).
- **Max trade size**: each trade is capped at a % of stream equity.
- **Drawdown circuit breaker**: if equity falls below the high-water mark × (1 − maxDrawdownBps), the stream halts until the owner resumes it. Deposits and withdrawals adjust the high-water mark, so new money can't hide a loss.
- **Cooldown** between agent trades.
- **Token allowlist**: the agent can only swap between allowed assets, and output always lands back in the vault.
- **Starvation-safe streaming**: if your allowance or balance runs short, the stream pulls what it can and never reverts.

## Architecture

```
┌──────────── Owner wallet ────────────┐
│  USDT (unstreamed: stays here)       │──approve──┐
└──────────────────────────────────────┘           │ pulls ratePerSec × Δt
                                                   ▼
┌─────────────────────── StreamVault (HSK Chain) ───────────────────────┐
│ streams · per-stream balances · Risk limits · HWM breaker · events    │
│ trade() ← agent only      invest() ← anyone       pause/cancel ← owner│
└───────────────┬───────────────────────────────────────────────────────┘
                │ IVenue
     ┌──────────┴───────────┐
     │ UniV3Venue (mainnet) │ → HSKSwap SwapRouter02 + pool TWAP
     │ MockAMMVenue (test)  │ → constant-product pools, synced to CEX prices
     └──────────────────────┘

agent/      Node + TypeScript: Analyst → Risk → Executor loop, Invest keeper, chat (Claude), REST API
dashboard/  Next.js + wagmi: landing page, live stream meter, kill switch, decision feed, chat
```

## Repository

| Path | What |
|---|---|
| [`contracts/`](contracts) | Foundry. `StreamVault.sol`, `venues/UniV3Venue.sol` (HSKSwap), `venues/MockAMMVenue.sol`, tests incl. mainnet-fork tests |
| [`agent/`](agent) | Agent runtime: `agents/{analyst,risk,executor}.ts`, `keeper.ts`, `chat.ts`, Hono API |
| [`dashboard/`](dashboard) | Next.js app: landing + `/app` |
| [`deployments/`](deployments) | Addresses per chain + ABIs (consumed by agent and dashboard) |
| [`docs/SPEC.md`](docs/SPEC.md) | Interface spec shared by all three parts |

## Deployments

### HashKey Chain Testnet (chainId 133)

| Contract | Address |
|---|---|
| StreamVault | [`0xe9F69870DC2299f3Da98Abe4ecD00505fF1BA40d`](https://testnet-explorer.hsk.xyz/address/0xe9F69870DC2299f3Da98Abe4ecD00505fF1BA40d) |
| MockAMMVenue | [`0x9188f021E4FbBd00c018D7C1EEC1120eC91b0Ed5`](https://testnet-explorer.hsk.xyz/address/0x9188f021E4FbBd00c018D7C1EEC1120eC91b0Ed5) |
| USDT (mock, faucet) | `0x610070Ee46461FEd78FD4be520D894Ef07866a56` |
| WETH / WBTC / WHSK (mock) | `0x51f10B56585d45396ff277280B47640B2247E5a8` / `0x7c0c7A59468d1f86b50da8944bdcA00174b49e60` / `0xfFd234D2f61A41711b025f7e00cAaa1E354433eF` |

Example agent trade: [`0x2f87457a…`](https://testnet-explorer.hsk.xyz/tx/0x2f87457a6ff5e5bbb5f14d9447006ed52a2cede1d7dd3d923e8cc21c7eac12f2) ·
example Invest swap: [`0x6c1838c3…`](https://testnet-explorer.hsk.xyz/tx/0x6c1838c338365eef96a61493e117c21eb3da52a0009947444b5aed8f7089a8bb)

HSKSwap has no testnet deployment, so testnet uses `MockAMMVenue`, whose prices a keeper syncs to Coinbase and Gate every ~30s.

### HashKey Chain Mainnet (chainId 177)

_Deployment pending._ Targets: HSKSwap SwapRouter02 `0x2c16f75b95Cf1390c328aB70e2CEE7f4b80bD8F3`, USDT pools
WHSK/USDT `0x4ff5…5dC`, WETH/USDT `0xb92b…C16`, WBTC/USDT `0xd9EA…449A` (fee 0.3%).

## Run it locally

Requirements: Node 22+, [Foundry](https://book.getfoundry.sh/).

```bash
git clone --recurse-submodules https://github.com/mdmudassir0143/Streamer.git && cd Streamer
cp .env.example .env            # fill in keys (see below)
```

**Contracts**
```bash
cd contracts
forge test                                                             # unit tests (offline)
forge test --match-path 'test/fork/*' --fork-url https://mainnet.hsk.xyz   # real HSKSwap pools
set -a; source ../.env; set +a
forge script script/DeployTestnet.s.sol --rpc-url https://testnet.hsk.xyz --broadcast --slow
```

**Agent**
```bash
cd agent && npm install
npm test && npm run typecheck
npm start                       # API on :8787, trading loop, invest keeper, testnet price sync
```
Without `ANTHROPIC_API_KEY`, the agent falls back to a deterministic rules engine (decisions are labelled `engine: "rules"`).

**Dashboard**
```bash
cd dashboard && npm install
NEXT_PUBLIC_CHAIN_ID=133 npm run dev     # http://localhost:3000
```
Add HashKey Chain Testnet to MetaMask (RPC `https://testnet.hsk.xyz`, chain ID `133`, symbol `HSK`,
explorer `https://testnet-explorer.hsk.xyz`). Then use the in-app **Faucet** to get test USDT.

### Environment

| Var | Used by | Notes |
|---|---|---|
| `CHAIN_ID` | agent | 133 testnet · 177 mainnet · 31337 anvil |
| `RPC_URL` | agent, scripts | |
| `DEPLOYER_KEY` | scripts | deploys contracts; owns the mock venue |
| `AGENT_KEY` | agent | the agent's trading wallet (needs a little HSK for gas) |
| `ANTHROPIC_API_KEY` | agent | optional; enables the LLM analyst, risk officer and chat |
| `NEXT_PUBLIC_CHAIN_ID`, `NEXT_PUBLIC_AGENT_API` | dashboard | |

## Notes and limits (honest)

- HSKSwap prices track CEXs to within ~0.1% and pools charge 0.3%, so there is **no arbitrage edge**. StreamPilot's
  value is bounded, inspectable risk, not promised returns.
- Mainnet liquidity on HSK is concentrated in three USDT pools (~$1M TVL), and USDC on HSK is nearly empty, so StreamPilot streams **USDT**.
- Chat and preference endpoints authenticate only by the `owner` field. This is fine for a demo; wallet-signature auth is on the roadmap.
- Contracts are unaudited hackathon code.

## Roadmap

- Wallet-signed auth for agent prefs and chat
- Streams funded via HSP reusable mandates (HashKey Settlement Protocol)
- Agent marketplace: third-party strategies plugged into the same `trade()` permission
- More venues as HSK liquidity grows

## License

MIT
