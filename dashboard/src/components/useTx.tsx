'use client';
import { useState } from 'react';
import { useAccount, useConfig, useSwitchChain } from 'wagmi';
import { waitForTransactionReceipt } from 'wagmi/actions';
import { useQueryClient } from '@tanstack/react-query';
import { BaseError, ContractFunctionRevertedError, UserRejectedRequestError, type Hash, type TransactionReceipt } from 'viem';
import { targetChain, explorerTx } from '@/lib/chains';
import { useToast } from './Toast';

const FRIENDLY: Record<string, string> = {
  NotOwner: 'Only the stream owner can do that. Switch to the owner wallet.',
  NotAgent: 'Only the stream agent can trade.',
  NotAdmin: 'Only the vault admin can do that.',
  NoStream: 'That stream does not exist.',
  InvalidParams: 'The contract rejected these settings. Check the rate, agent and risk limits (they must be above zero).',
  WrongMode: 'This action is not available in this stream mode.',
  StreamPaused: 'The stream is paused. Resume it first.',
  StreamHalted: 'The drawdown breaker has halted this stream. Resume to reset it.',
  StreamCancelled: 'This stream is already cancelled.',
  TokenNotAllowed: 'That token is not allowed by the vault.',
  Cooldown: 'The trade cooldown has not elapsed yet.',
  TradeTooLarge: 'The trade is larger than the risk limit allows.',
  SlippageTooLoose: 'The minimum output breaks the slippage limit.',
  InsufficientBalance: 'Not enough balance for this.',
  InsufficientAllowance: 'The USDT allowance is too low. Approve a higher cap.',
  Reentrancy: 'Blocked by the reentrancy guard.',
  FaucetCooldown: 'The faucet works once per hour per wallet. Try again later.',
  TransferFailed: 'A token transfer failed.',
  ApproveFailed: 'A token approval failed.',
};

function errMsg(e: unknown): string {
  if (e instanceof BaseError) {
    const rev = e.walk((x) => x instanceof ContractFunctionRevertedError);
    if (rev instanceof ContractFunctionRevertedError) {
      const name = rev.data?.errorName;
      if (name && FRIENDLY[name]) return FRIENDLY[name];
      if (name) return `Reverted with ${name}`;
    }
    if (e.walk((x) => x instanceof UserRejectedRequestError)) return 'You rejected the request in your wallet.';
    return e.shortMessage.split('\n')[0];
  }
  const any = e as { message?: string };
  return (any?.message || 'Transaction failed').split('\n')[0];
}

/** Wraps a wallet call: ensures the right chain, waits for the receipt, toasts, refreshes reads. */
export function useTx() {
  const config = useConfig();
  const { chainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const qc = useQueryClient();
  const toast = useToast();
  const [pending, setPending] = useState<string | null>(null);

  async function run(label: string, send: () => Promise<Hash>, doneLabel?: string): Promise<TransactionReceipt | null> {
    setPending(label);
    try {
      if (chainId !== targetChain.id) await switchChainAsync({ chainId: targetChain.id });
      const hash = await send();
      toast('info', <>{label}: submitted. Waiting for confirmation…</>);
      const receipt = await waitForTransactionReceipt(config, { hash, chainId: targetChain.id });
      const link = explorerTx(hash);
      if (receipt.status !== 'success') throw new Error(`${label} reverted`);
      toast('ok', <>{doneLabel ?? `${label}: confirmed`}{link ? <>. <a href={link} target="_blank" rel="noreferrer">view tx</a></> : null}</>);
      await qc.invalidateQueries();
      return receipt;
    } catch (e) {
      toast('err', <>{label}: {errMsg(e)}</>);
      return null;
    } finally {
      setPending(null);
    }
  }
  return { run, pending };
}
