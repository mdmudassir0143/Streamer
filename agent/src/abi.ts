// Hand-written viem ABIs from docs/SPEC.md. At runtime, chain.ts prefers the
// generated ../deployments/abi/StreamVault.json (if present) but keeps these types.
import { parseAbi } from "viem";

const riskTuple = "(uint16 maxSlippageBps, uint16 maxTradeBps, uint16 maxDrawdownBps, uint32 cooldownSec)";
const streamViewTuple =
  "(uint256 id, address owner, address agent, address baseToken, address targetToken, uint8 mode, uint128 ratePerSec, uint64 startTime, uint64 endTime, uint128 maxTotal, uint128 totalStreamed, uint64 lastAccrual, uint64 lastTradeAt, bool paused, bool halted, bool cancelled, uint256 highWaterMark, " +
  riskTuple +
  " risk)";

export const streamVaultAbi = parseAbi([
  `function createStream(address agent, address baseToken, address targetToken, uint8 mode, uint128 ratePerSec, uint64 durationSec, uint128 maxTotal, ${riskTuple} risk) returns (uint256 id)`,
  "function pause(uint256 id)",
  "function resume(uint256 id)",
  "function setRate(uint256 id, uint128 ratePerSec)",
  "function setAgent(uint256 id, address agent)",
  `function setRisk(uint256 id, ${riskTuple} risk)`,
  "function setTarget(uint256 id, address targetToken)",
  "function withdraw(uint256 id, address token, uint256 amount, address to)",
  "function cancel(uint256 id)",
  "function accrue(uint256 id) returns (uint256 pulled)",
  "function owed(uint256 id) view returns (uint256)",
  "function trade(uint256 id, address tokenIn, address tokenOut, uint256 amountIn, uint256 minAmountOut, bytes32 reasonHash) returns (uint256 amountOut)",
  "function invest(uint256 id) returns (uint256 amountOut)",
  `function getStream(uint256 id) view returns (${streamViewTuple})`,
  "function streamsOf(address owner) view returns (uint256[])",
  "function balanceOf(uint256 id, address token) view returns (uint256)",
  "function equity(uint256 id) view returns (uint256)",
  "function allowedTokens() view returns (address[])",
  "function venue() view returns (address)",
  "function setAllowedToken(address token, bool allowed)",
  "event StreamCreated(uint256 indexed id, address indexed owner, address indexed agent, uint8 mode, address baseToken, address targetToken, uint128 ratePerSec)",
  "event Accrued(uint256 indexed id, uint256 pulled, uint256 totalStreamed)",
  "event Traded(uint256 indexed id, address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut, bytes32 reasonHash)",
  "event Invested(uint256 indexed id, address tokenOut, uint256 amountIn, uint256 amountOut)",
  "event Paused(uint256 indexed id)",
  "event Resumed(uint256 indexed id)",
  "event Halted(uint256 indexed id, uint256 equity, uint256 highWaterMark)",
  "event RateChanged(uint256 indexed id, uint128 ratePerSec)",
  "event Withdrawn(uint256 indexed id, address token, uint256 amount, address to)",
  "event Cancelled(uint256 indexed id)",
  "error NotAgent()",
  "error NotOwner()",
  "error WrongMode()",
  "error StreamPaused()",
  "error StreamHalted()",
  "error StreamCancelled()",
  "error TokenNotAllowed()",
  "error Cooldown()",
  "error TradeTooLarge()",
  "error SlippageTooLoose()",
  "error InsufficientBalance()",
  "error NotAdmin()",
  "error NoStream()",
  "error InvalidParams()",
  "error Reentrancy()",
  "function admin() view returns (address)",
  "function nextId() view returns (uint256)",
  "function isAllowed(address) view returns (bool)",
]);

export const venueAbi = parseAbi([
  "function swapExactIn(address tokenIn, address tokenOut, uint256 amountIn, uint256 minAmountOut, address to) returns (uint256 amountOut)",
  "function quote(address tokenIn, address tokenOut, uint256 amountIn) view returns (uint256 amountOut)",
  "function syncPrice(address asset, uint256 priceE18)",
  "function seedPool(address asset, uint256 baseAmt, uint256 assetAmt)",
  "function owner() view returns (address)",
  "function baseToken() view returns (address)",
  "function keeper() view returns (address)",
]);

export const erc20Abi = parseAbi([
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function faucet()",
  "function mint(address to, uint256 amount)",
]);

export type StreamVaultAbi = typeof streamVaultAbi;
