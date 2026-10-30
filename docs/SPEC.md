# StreamPilot — shared spec (source of truth for contracts, agent, dashboard)

**Pitch:** An AI trading agent on HashKey Chain that can only ever touch the capital you have *streamed* to it so far.
Exposure = rate × elapsed time, not your whole deposit. Pause/cancel the stream (or revoke the USDT allowance) = kill switch.
Second mode, **Invest**: the stream is converted into a chosen asset second-by-second (per-second DCA), no AI involved.

Track: HSK Chain Horizon Hackathon (Mumbai) — Track 1, AI Agent Trading. Testnet first (chain 133), then mainnet (177).

## Repo layout
```
contracts/    Foundry project (Solidity ^0.8.24)
agent/        Node 22 + TypeScript agent runtime + HTTP API (port from AGENT_API_PORT, default 8787)
dashboard/    Next.js (App Router) + wagmi/viem frontend
deployments/  <chainId>.json written by the deploy script, read by agent + dashboard
.env          root env file (never commit): CHAIN_ID, RPC_URL, MAINNET_RPC_URL, DEPLOYER_KEY, AGENT_KEY, ANTHROPIC_API_KEY, AGENT_API_PORT
```

## Networks
| | Testnet | Mainnet |
|---|---|---|
| chainId | 133 | 177 |
| RPC | https://testnet.hsk.xyz | https://mainnet.hsk.xyz |
| Explorer | https://testnet-explorer.hsk.xyz | https://hsk.blockscout.com |
| Gas | ~1 gwei | ~500 gwei, 2s blocks |
| Base token | MockUSDT (6 dec, we deploy) | USDT `0xF1B50eD67A9e2CC94Ad3c477779E2d4cBfFf9029` (6 dec) |
| Assets | MockWETH(18), MockWBTC(8), MockWHSK(18) | WETH `0xefd4bC9afD210517803f293ABABd701CaeeCdfd0`, WBTC `0x6119CA49a79f5825C8B345F8d7aC36B272565b14`, WHSK `0xB210D2120d57b758EE163cFfb43e73728c471Cf1` |
| Venue | `MockAMMVenue` (we deploy) | `UniV3Venue` over HSKSwap (Uniswap v3 fork) factory `0x972cA9D1662F5e029cD18327D29026532E84c742`, fee 3000 |

Mainnet pools (fee 3000): WHSK/USDT `0x4ff515761864e7838B0AdB8b5b2B8B7A068905dC` (obs cardinality 16), WBTC/USDT `0xd9EA2cE468957Ba49cCC38C4758Ed6ecD561449A` (cardinality 1 → no TWAP), WETH/USDT `0xb92b79ed6b370D5cFee2E14B1D0983C258304C16` (cardinality 16).
HSKSwap SwapRouter address: not yet confirmed — discover from on-chain swap txs.

## Contract interfaces (exact — agent and dashboard code against these)

```solidity
interface IVenue {
    /// Swap exact `amountIn` of tokenIn held by msg.sender (pulled via transferFrom) for tokenOut sent to `to`.
    function swapExactIn(address tokenIn, address tokenOut, uint256 amountIn, uint256 minAmountOut, address to)
        external returns (uint256 amountOut);
    /// Manipulation-resistant fair output for amountIn (mainnet: pool TWAP over 60s when available, else slot0; mock: spot).
    function quote(address tokenIn, address tokenOut, uint256 amountIn) external view returns (uint256 amountOut);
}
```

### StreamVault
One contract holds many streams. Funds NOT yet streamed stay in the owner's wallet: the vault pulls `owed` via `transferFrom`
(owner approves base token to the vault). If allowance/balance is short, it pulls what it can (stream starves, never reverts).

```solidity
enum Mode { AGENT, INVEST }   // uint8 0 / 1

struct Risk {
    uint16 maxSlippageBps;   // minAmountOut must be >= venue.quote * (1 - maxSlippageBps/1e4)
    uint16 maxTradeBps;      // amountIn value (in base) <= equity * maxTradeBps / 1e4
    uint16 maxDrawdownBps;   // equity < highWaterMark*(1 - dd) => halted = true (circuit breaker)
    uint32 cooldownSec;      // min seconds between agent trades
}

struct StreamView {
    uint256 id;
    address owner;
    address agent;
    address baseToken;
    address targetToken;     // INVEST: asset bought; AGENT: informational default
    uint8   mode;
    uint128 ratePerSec;      // base token units per second
    uint64  startTime;
    uint64  endTime;         // 0 = open-ended
    uint128 maxTotal;        // hard cap on total ever pulled (0 = none)
    uint128 totalStreamed;   // total pulled from owner so far
    uint64  lastAccrual;
    uint64  lastTradeAt;
    bool    paused;
    bool    halted;          // drawdown breaker tripped
    bool    cancelled;
    uint256 highWaterMark;   // equity HWM in base units
    Risk    risk;
}

// lifecycle (owner)
function createStream(address agent, address baseToken, address targetToken, uint8 mode,
    uint128 ratePerSec, uint64 durationSec /*0=open*/, uint128 maxTotal, Risk calldata risk) external returns (uint256 id);
function pause(uint256 id) external;          // stops accrual (time while paused never accrues)
function resume(uint256 id) external;         // also clears `halted` and resets highWaterMark to current equity
function setRate(uint256 id, uint128 ratePerSec) external;   // accrues first
function setAgent(uint256 id, address agent) external;
function setRisk(uint256 id, Risk calldata risk) external;
function setTarget(uint256 id, address targetToken) external;  // must be allowed token
function withdraw(uint256 id, address token, uint256 amount, address to) external;
function cancel(uint256 id) external;         // accrue, mark cancelled, send every held token to owner

// streaming
function accrue(uint256 id) external returns (uint256 pulled);  // anyone
function owed(uint256 id) external view returns (uint256);      // pullable right now (ignoring allowance)

// AGENT mode (only stream.agent)
function trade(uint256 id, address tokenIn, address tokenOut, uint256 amountIn, uint256 minAmountOut, bytes32 reasonHash)
    external returns (uint256 amountOut);
// INVEST mode (anyone; swaps all held base -> targetToken with minOut = quote*(1-maxSlippage))
function invest(uint256 id) external returns (uint256 amountOut);

// views
function getStream(uint256 id) external view returns (StreamView memory);
function streamsOf(address owner) external view returns (uint256[] memory);
function balanceOf(uint256 id, address token) external view returns (uint256);
function equity(uint256 id) external view returns (uint256);   // base-denominated, via venue.quote for each allowed token held
function allowedTokens() external view returns (address[] memory);
function venue() external view returns (address);

// admin (deployer)
function setAllowedToken(address token, bool allowed) external;

// events
event StreamCreated(uint256 indexed id, address indexed owner, address indexed agent, uint8 mode, address baseToken, address targetToken, uint128 ratePerSec);
event Accrued(uint256 indexed id, uint256 pulled, uint256 totalStreamed);
event Traded(uint256 indexed id, address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut, bytes32 reasonHash);
event Invested(uint256 indexed id, address tokenOut, uint256 amountIn, uint256 amountOut);
event Paused(uint256 indexed id);
event Resumed(uint256 indexed id);
event Halted(uint256 indexed id, uint256 equity, uint256 highWaterMark);
event RateChanged(uint256 indexed id, uint128 ratePerSec);
event Withdrawn(uint256 indexed id, address token, uint256 amount, address to);
event Cancelled(uint256 indexed id);
```

Trade rules (revert with custom errors): NotAgent, NotOwner, WrongMode, StreamPaused, StreamHalted, StreamCancelled,
TokenNotAllowed, Cooldown, TradeTooLarge, SlippageTooLoose, InsufficientBalance. `trade` and `invest` call `accrue` first.
After every trade: update HWM if equity higher; if equity < HWM*(1-maxDrawdownBps/1e4) set halted + emit Halted.
Token-to-token trades via base are fine (venue may route tokenIn->base->tokenOut).

### Testnet mocks
- `MockERC20(name, symbol, decimals)` with public `faucet()` (mints 10,000 units to caller, once per hour) and owner `mint`.
- `MockAMMVenue is IVenue`: constant-product pools per (base, asset) pair, 0.3% fee; `quote` = spot without fee; owner
  `seedPool(asset, baseAmt, assetAmt)` and `syncPrice(asset, priceE18)` (rebalances reserves to a target base-per-asset price,
  used by the price-sync keeper to mirror real CEX prices). Multi-hop asset->asset routes through base.

## Agent HTTP API (agent/ — dashboard consumes)
Base URL `http://localhost:${AGENT_API_PORT}`; JSON; CORS enabled.
- `GET /api/health` → `{ ok, chainId, agentAddress, vault }`
- `GET /api/prices` → `{ ts, prices: { WETH: n, WBTC: n, WHSK: n }, venue: {...same keys}, source: {...} }` (USD; CEX = Coinbase BTC/ETH, Gate HSK_USDT)
- `GET /api/streams?owner=0x..` → `StreamSummary[]`
- `GET /api/streams/:id` → `StreamSummary & { positions: {token, symbol, amount, valueBase}[], pnlBase, pnlPct, exposedBase, unstreamedBase }`
- `GET /api/streams/:id/decisions` → `Decision[]` newest first: `{ ts, streamId, action: 'buy'|'sell'|'hold', tokenIn, tokenOut, amountIn, reason, analyst, risk, txHash?, reasonHash, blocked? }`
- `GET /api/streams/:id/prefs` / `PUT` → `{ riskAppetite: 'low'|'medium'|'high', assets: string[], maxPositionPct: number, intervalSec: number, enabled: boolean }`
- `POST /api/chat` `{ streamId, owner, message }` → `{ reply, prefsUpdated?: Prefs, txs?: { description, to, data, value: '0' }[] }`
  Agent-side prefs (risk appetite, assets, frequency, size) are applied directly. On-chain changes (rate, pause, cancel, risk)
  are returned as unsigned `txs` for the owner to sign in the dashboard — the agent is never the owner.

Decision pipeline per tick (multi-agent): **Analyst** (LLM: market read from CEX + venue prices, momentum) → **Risk officer**
(LLM + deterministic hard checks mirroring on-chain Risk) → **Executor** (deterministic: build minOut from venue.quote, send `trade`,
`reasonHash = keccak256(JSON decision)`, store full decision JSON in agent/data). Keeper loop also calls `invest(id)` for INVEST streams
and (testnet only) `syncPrice` on the mock venue to mirror CEX prices.
