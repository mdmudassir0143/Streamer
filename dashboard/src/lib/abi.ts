import generated from '@/generated/StreamVault.abi.json';

const riskTuple = {
  type: 'tuple',
  name: 'risk',
  internalType: 'struct Risk',
  components: [
    { name: 'maxSlippageBps', type: 'uint16', internalType: 'uint16' },
    { name: 'maxTradeBps', type: 'uint16', internalType: 'uint16' },
    { name: 'maxDrawdownBps', type: 'uint16', internalType: 'uint16' },
    { name: 'cooldownSec', type: 'uint32', internalType: 'uint32' },
  ],
} as const;

const id = { name: 'id', type: 'uint256', internalType: 'uint256' } as const;

/** Hand-written from docs/SPEC.md. Replaced at runtime by deployments/abi/StreamVault.json when present. */
export const streamVaultAbiHand = [
  {
    type: 'function', name: 'createStream', stateMutability: 'nonpayable',
    inputs: [
      { name: 'agent', type: 'address', internalType: 'address' },
      { name: 'baseToken', type: 'address', internalType: 'address' },
      { name: 'targetToken', type: 'address', internalType: 'address' },
      { name: 'mode', type: 'uint8', internalType: 'uint8' },
      { name: 'ratePerSec', type: 'uint128', internalType: 'uint128' },
      { name: 'durationSec', type: 'uint64', internalType: 'uint64' },
      { name: 'maxTotal', type: 'uint128', internalType: 'uint128' },
      riskTuple,
    ],
    outputs: [{ name: 'id', type: 'uint256', internalType: 'uint256' }],
  },
  { type: 'function', name: 'pause', stateMutability: 'nonpayable', inputs: [id], outputs: [] },
  { type: 'function', name: 'resume', stateMutability: 'nonpayable', inputs: [id], outputs: [] },
  {
    type: 'function', name: 'setRate', stateMutability: 'nonpayable',
    inputs: [id, { name: 'ratePerSec', type: 'uint128', internalType: 'uint128' }], outputs: [],
  },
  {
    type: 'function', name: 'setAgent', stateMutability: 'nonpayable',
    inputs: [id, { name: 'agent', type: 'address', internalType: 'address' }], outputs: [],
  },
  { type: 'function', name: 'setRisk', stateMutability: 'nonpayable', inputs: [id, riskTuple], outputs: [] },
  {
    type: 'function', name: 'setTarget', stateMutability: 'nonpayable',
    inputs: [id, { name: 'targetToken', type: 'address', internalType: 'address' }], outputs: [],
  },
  {
    type: 'function', name: 'withdraw', stateMutability: 'nonpayable',
    inputs: [
      id,
      { name: 'token', type: 'address', internalType: 'address' },
      { name: 'amount', type: 'uint256', internalType: 'uint256' },
      { name: 'to', type: 'address', internalType: 'address' },
    ],
    outputs: [],
  },
  { type: 'function', name: 'cancel', stateMutability: 'nonpayable', inputs: [id], outputs: [] },
  {
    type: 'function', name: 'accrue', stateMutability: 'nonpayable', inputs: [id],
    outputs: [{ name: 'pulled', type: 'uint256', internalType: 'uint256' }],
  },
  {
    type: 'function', name: 'owed', stateMutability: 'view', inputs: [id],
    outputs: [{ name: '', type: 'uint256', internalType: 'uint256' }],
  },
  {
    type: 'function', name: 'trade', stateMutability: 'nonpayable',
    inputs: [
      id,
      { name: 'tokenIn', type: 'address', internalType: 'address' },
      { name: 'tokenOut', type: 'address', internalType: 'address' },
      { name: 'amountIn', type: 'uint256', internalType: 'uint256' },
      { name: 'minAmountOut', type: 'uint256', internalType: 'uint256' },
      { name: 'reasonHash', type: 'bytes32', internalType: 'bytes32' },
    ],
    outputs: [{ name: 'amountOut', type: 'uint256', internalType: 'uint256' }],
  },
  {
    type: 'function', name: 'invest', stateMutability: 'nonpayable', inputs: [id],
    outputs: [{ name: 'amountOut', type: 'uint256', internalType: 'uint256' }],
  },
  {
    type: 'function', name: 'getStream', stateMutability: 'view', inputs: [id],
    outputs: [
      {
        name: '', type: 'tuple', internalType: 'struct StreamView',
        components: [
          { name: 'id', type: 'uint256', internalType: 'uint256' },
          { name: 'owner', type: 'address', internalType: 'address' },
          { name: 'agent', type: 'address', internalType: 'address' },
          { name: 'baseToken', type: 'address', internalType: 'address' },
          { name: 'targetToken', type: 'address', internalType: 'address' },
          { name: 'mode', type: 'uint8', internalType: 'uint8' },
          { name: 'ratePerSec', type: 'uint128', internalType: 'uint128' },
          { name: 'startTime', type: 'uint64', internalType: 'uint64' },
          { name: 'endTime', type: 'uint64', internalType: 'uint64' },
          { name: 'maxTotal', type: 'uint128', internalType: 'uint128' },
          { name: 'totalStreamed', type: 'uint128', internalType: 'uint128' },
          { name: 'lastAccrual', type: 'uint64', internalType: 'uint64' },
          { name: 'lastTradeAt', type: 'uint64', internalType: 'uint64' },
          { name: 'paused', type: 'bool', internalType: 'bool' },
          { name: 'halted', type: 'bool', internalType: 'bool' },
          { name: 'cancelled', type: 'bool', internalType: 'bool' },
          { name: 'highWaterMark', type: 'uint256', internalType: 'uint256' },
          riskTuple,
        ],
      },
    ],
  },
  {
    type: 'function', name: 'streamsOf', stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address', internalType: 'address' }],
    outputs: [{ name: '', type: 'uint256[]', internalType: 'uint256[]' }],
  },
  {
    type: 'function', name: 'balanceOf', stateMutability: 'view',
    inputs: [id, { name: 'token', type: 'address', internalType: 'address' }],
    outputs: [{ name: '', type: 'uint256', internalType: 'uint256' }],
  },
  {
    type: 'function', name: 'equity', stateMutability: 'view', inputs: [id],
    outputs: [{ name: '', type: 'uint256', internalType: 'uint256' }],
  },
  {
    type: 'function', name: 'allowedTokens', stateMutability: 'view', inputs: [],
    outputs: [{ name: '', type: 'address[]', internalType: 'address[]' }],
  },
  {
    type: 'function', name: 'venue', stateMutability: 'view', inputs: [],
    outputs: [{ name: '', type: 'address', internalType: 'address' }],
  },
  {
    type: 'event', name: 'StreamCreated', anonymous: false,
    inputs: [
      { name: 'id', type: 'uint256', indexed: true, internalType: 'uint256' },
      { name: 'owner', type: 'address', indexed: true, internalType: 'address' },
      { name: 'agent', type: 'address', indexed: true, internalType: 'address' },
      { name: 'mode', type: 'uint8', indexed: false, internalType: 'uint8' },
      { name: 'baseToken', type: 'address', indexed: false, internalType: 'address' },
      { name: 'targetToken', type: 'address', indexed: false, internalType: 'address' },
      { name: 'ratePerSec', type: 'uint128', indexed: false, internalType: 'uint128' },
    ],
  },
  {
    type: 'event', name: 'Traded', anonymous: false,
    inputs: [
      { name: 'id', type: 'uint256', indexed: true, internalType: 'uint256' },
      { name: 'tokenIn', type: 'address', indexed: false, internalType: 'address' },
      { name: 'tokenOut', type: 'address', indexed: false, internalType: 'address' },
      { name: 'amountIn', type: 'uint256', indexed: false, internalType: 'uint256' },
      { name: 'amountOut', type: 'uint256', indexed: false, internalType: 'uint256' },
      { name: 'reasonHash', type: 'bytes32', indexed: false, internalType: 'bytes32' },
    ],
  },
  {
    type: 'event', name: 'Withdrawn', anonymous: false,
    inputs: [
      { name: 'id', type: 'uint256', indexed: true, internalType: 'uint256' },
      { name: 'token', type: 'address', indexed: false, internalType: 'address' },
      { name: 'amount', type: 'uint256', indexed: false, internalType: 'uint256' },
      { name: 'to', type: 'address', indexed: false, internalType: 'address' },
    ],
  },
  {
    type: 'event', name: 'Halted', anonymous: false,
    inputs: [
      { name: 'id', type: 'uint256', indexed: true, internalType: 'uint256' },
      { name: 'equity', type: 'uint256', indexed: false, internalType: 'uint256' },
      { name: 'highWaterMark', type: 'uint256', indexed: false, internalType: 'uint256' },
    ],
  },
  { type: 'error', name: 'NotAgent', inputs: [] },
  { type: 'error', name: 'NotOwner', inputs: [] },
  { type: 'error', name: 'WrongMode', inputs: [] },
  { type: 'error', name: 'StreamPaused', inputs: [] },
  { type: 'error', name: 'StreamHalted', inputs: [] },
  { type: 'error', name: 'StreamCancelled', inputs: [] },
  { type: 'error', name: 'TokenNotAllowed', inputs: [] },
  { type: 'error', name: 'Cooldown', inputs: [] },
  { type: 'error', name: 'TradeTooLarge', inputs: [] },
  { type: 'error', name: 'SlippageTooLoose', inputs: [] },
  { type: 'error', name: 'InsufficientBalance', inputs: [] },
  { type: 'error', name: 'NotAdmin', inputs: [] },
  { type: 'error', name: 'NoStream', inputs: [] },
  { type: 'error', name: 'InvalidParams', inputs: [] },
  { type: 'error', name: 'Reentrancy', inputs: [] },
  { type: 'error', name: 'ApproveFailed', inputs: [] },
  { type: 'error', name: 'TransferFailed', inputs: [] },
] as const;

/** Prefer the ABI generated by the contracts build; fall back to the hand-written one. */
const gen = generated as unknown;
export const streamVaultAbi = (
  Array.isArray(gen) && gen.length > 0 ? gen : streamVaultAbiHand
) as typeof streamVaultAbiHand;
export const usingGeneratedAbi = Array.isArray(gen) && gen.length > 0;

export const erc20Abi = [
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ name: 'a', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'allowance', stateMutability: 'view', inputs: [{ name: 'o', type: 'address' }, { name: 's', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'approve', stateMutability: 'nonpayable', inputs: [{ name: 's', type: 'address' }, { name: 'v', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }] },
  { type: 'function', name: 'decimals', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint8' }] },
  { type: 'function', name: 'symbol', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'string' }] },
  { type: 'function', name: 'faucet', stateMutability: 'nonpayable', inputs: [], outputs: [] },
  { type: 'error', name: 'FaucetCooldown', inputs: [] },
  { type: 'error', name: 'InsufficientAllowance', inputs: [] },
  { type: 'error', name: 'InsufficientBalance', inputs: [] },
  { type: 'error', name: 'NotOwner', inputs: [] },
] as const;

export const nextIdAbi = [
  { type: 'function', name: 'nextId', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
] as const;
