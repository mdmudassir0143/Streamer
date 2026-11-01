'use client';
import { useState } from 'react';
import { useAccount, useConfig, useSwitchChain } from 'wagmi';
import { waitForTransactionReceipt } from 'wagmi/actions';
import { useQueryClient } from '@tanstack/react-query';
import { BaseError, ContractFunctionRevertedError, UserRejectedRequestError, type Hash, type TransactionReceipt } from 'viem';
import { targetChain, explorerTx, networkName } from '@/lib/chains';
import { useToastControls } from './Toast';

/** Every contract error as a plain sentence with what to do next. */
const FRIENDLY: Record<string, string> = {
  NotOwner: 'Only the stream owner can do this. Switch to the wallet that created the stream.',
  NotAgent: 'Only the stream’s agent can trade. Check the agent address on the stream.',
  NotAdmin: 'Only the vault admin can change this setting.',
  NoStream: 'This stream doesn’t exist. Check the stream number and try again.',
  InvalidParams: 'The contract rejected these settings. Make sure the rate is above zero and the asset differs from USDT.',
  WrongMode: 'This action isn’t available for this kind of stream.',
  StreamPaused: 'The stream is paused. Resume it, then try again.',
  StreamHalted: 'The drawdown breaker halted this stream. Resume it to reset the breaker.',
  StreamCancelled: 'This stream is already cancelled. Start a new one to keep streaming.',
  TokenNotAllowed: 'The vault doesn’t accept that token. Pick WETH, WBTC or WHSK.',
  Cooldown: 'The trade cooldown hasn’t finished. Wait a moment and try again.',
  TradeTooLarge: 'The trade is bigger than the risk limit allows. Use a smaller amount.',
  SlippageTooLoose: 'The minimum output is below the slippage limit. Tighten it and try again.',
  InsufficientBalance: 'There isn’t enough balance for this. Top up your wallet and try again.',
  InsufficientAllowance: 'The USDT allowance is too low. Approve a higher cap, then try again.',
  Reentrancy: 'The vault blocked a nested call. Try again in a moment.',
  FaucetCooldown: 'The faucet gives each wallet test USDT once an hour. Try again later.',
  TransferFailed: 'A token transfer failed. Check your balance and allowance, then retry.',
  ApproveFailed: 'The token approval failed. Try approving again.',
};

export function errMsg(e: unknown): string {
  if (e instanceof BaseError) {
    const rev = e.walk((x) => x instanceof ContractFunctionRevertedError);
    if (rev instanceof ContractFunctionRevertedError) {
      const name = rev.data?.errorName;
      if (name && FRIENDLY[name]) return FRIENDLY[name];
      if (name) return `The contract reverted (${name}). Check the stream state and try again.`;
    }
    if (e.walk((x) => x instanceof UserRejectedRequestError)) return 'You declined the request in your wallet. Nothing was sent.';
    const m = e.shortMessage.split('\n')[0];
    if (/insufficient funds/i.test(m)) return 'Your wallet doesn’t have enough HSK for gas. Top it up and try again.';
    return `${m.replace(/\.$/, '')}. Try again in a moment.`;
  }
  const any = e as { message?: string };
  return `${(any?.message || 'The transaction failed').split('\n')[0].replace(/\.$/, '')}. Try again in a moment.`;
}

export type Phase = 'idle' | 'wallet' | 'confirming' | 'done' | 'error';
export interface TxState { phase: Phase; error?: string; hash?: string }

/** Wraps a wallet call: switches chain, tracks phases per label, waits for the receipt, toasts, refreshes reads. */
export function useTx() {
  const config = useConfig();
  const { chainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const qc = useQueryClient();
  const toasts = useToastControls();
  const [pending, setPending] = useState<string | null>(null);
  const [states, setStates] = useState<Record<string, TxState>>({});
  const set = (label: string, st: TxState) => setStates((s) => ({ ...s, [label]: st }));

  async function run(label: string, send: () => Promise<Hash>, doneLabel?: string, opts?: { onError?: (message: string) => void }): Promise<TransactionReceipt | null> {
    setPending(label);
    set(label, { phase: 'wallet' });
    // One popup per transaction, updated in place: sign → confirming → done (or failed).
    const id = toasts.push({ kind: 'pending', step: 1, title: `${label}: waiting for your signature`, msg: 'Approve it in your wallet. Nothing has been sent yet.' });
    let step: 1 | 2 = 1;
    try {
      if (chainId !== targetChain.id) await switchChainAsync({ chainId: targetChain.id });
      const hash = await send();
      step = 2;
      set(label, { phase: 'confirming', hash });
      const link = explorerTx(hash);
      const view = link ? <a href={link} target="_blank" rel="noreferrer">View transaction</a> : null;
      toasts.update(id, { step: 2, title: `${label}: confirming`, msg: <>Signed and sent. Waiting for {networkName()} to include it in a block. {view}</> });
      const receipt = await waitForTransactionReceipt(config, { hash, chainId: targetChain.id });
      if (receipt.status !== 'success') throw new Error(`${label} reverted on-chain`);
      set(label, { phase: 'done', hash });
      toasts.update(id, { kind: 'ok', step: 3, title: doneLabel ?? `${label} confirmed`, msg: <>Confirmed on {networkName()}. {view}</> });
      await qc.invalidateQueries();
      return receipt;
    } catch (e) {
      const m = errMsg(e);
      set(label, { phase: 'error', error: m });
      toasts.update(id, { kind: 'err', step, title: `${label} didn’t go through`, msg: m });
      opts?.onError?.(m);
      return null;
    } finally {
      setPending(null);
    }
  }
  const state = (label: string): TxState => states[label] ?? { phase: 'idle' };
  return { run, pending, state };
}
