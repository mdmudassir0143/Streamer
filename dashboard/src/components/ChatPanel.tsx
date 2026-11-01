'use client';
import { useEffect, useRef, useState } from 'react';
import { useAccount, useSendTransaction } from 'wagmi';
import { agentApi, useAgentOnline, type ChatResponse } from '@/lib/agentApi';
import { explorerTx, networkName, targetChain } from '@/lib/chains';
import { useToast } from './Toast';
import { useTx } from './useTx';
import { Badge, Spinner } from './ui';

const PROMPTS = ["What's my P&L?", 'Slow the stream to 2 USDT/hour', 'Only trade ETH, low risk', 'Pause everything'];

interface Msg { who: 'me' | 'agent' | 'err'; text: string; txs?: ChatResponse['txs']; retry?: string; link?: string }

/** What the agent says once a transaction it proposed is confirmed. Matches agent/src/chat.ts buildOnchainTx descriptions. */
function confirmedReply(description: string): string {
  const id = description.match(/#(\d+)/)?.[1];
  const s = id ? `Stream #${id}` : 'Your stream';
  if (/^Pause/i.test(description)) return `Done. ${s} is paused. Nothing new streams in, and I can't receive new funds until you resume it.`;
  if (/^Resume/i.test(description)) return `Done. ${s} is flowing again, and the drawdown breaker is reset.`;
  if (/^Cancel/i.test(description)) return `Done. ${s} is cancelled. Every token it held is back in your wallet.`;
  const rate = description.match(/rate to ([\d.]+) (\w+)\/hour/);
  if (rate) return `Done. ${s} now streams ${rate[1]} ${rate[2]} an hour.`;
  if (/risk:/i.test(description)) return `Done. The new risk limits are live on ${id ? `stream #${id}` : 'your stream'}.`;
  return `Done. That's confirmed on ${networkName()}.`;
}

export function ChatPanel({ streamId, owner }: { streamId: string; owner: string }) {
  const { online } = useAgentOnline();
  const { address } = useAccount();
  const [log, setLog] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const { sendTransactionAsync } = useSendTransaction();
  const { run, pending } = useTx();
  const [signed, setSigned] = useState<Record<string, string>>({}); // `${msg}-${tx}` -> tx hash
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' });
  }, [log, busy]);

  async function send(message: string, isRetry = false) {
    if (!message.trim() || busy) return;
    setLog((l) => (isRetry ? l.filter((m) => m.retry !== message) : [...l, { who: 'me', text: message }]));
    setInput('');
    setBusy(true);
    try {
      const r = await agentApi.chat({ streamId, owner: address ?? owner, message });
      setLog((l) => [...l, { who: 'agent', text: r.reply, txs: r.txs }]);
      if (r.prefsUpdated) {
        const p = r.prefsUpdated;
        toast('ok', 'Agent preferences updated', `${p.riskAppetite} risk${p.assets?.length ? `, ${p.assets.join(', ')} only` : ''}${p.enabled === false ? ', trading paused' : ''}.`);
      }
    } catch (e) {
      const why = (e as Error).name === 'AbortError' ? 'The agent took too long to answer.' : 'The agent didn’t answer.';
      setLog((l) => [...l, { who: 'err', text: `${why} Your on-chain controls still work.`, retry: message }]);
    } finally {
      setBusy(false);
    }
  }

  async function signTx(i: number, j: number, t: NonNullable<ChatResponse['txs']>[number]) {
    const label = t.description || 'Agent-proposed transaction';
    const receipt = await run(label, () => sendTransactionAsync({ to: t.to, data: t.data, value: BigInt(t.value || '0'), chainId: targetChain.id }), undefined, {
      onError: (m) => setLog((l) => [...l, { who: 'err', text: `That didn't go through, so nothing changed. ${m}` }]),
    });
    if (!receipt) return;
    setSigned((s) => ({ ...s, [`${i}-${j}`]: receipt.transactionHash }));
    setLog((l) => [...l, { who: 'agent', text: confirmedReply(label), link: explorerTx(receipt.transactionHash) ?? undefined }]);
  }

  const empty = log.length === 0;

  return (
    <section className="chat" aria-label="Agent chat">
      <div className="chat-head">
        <h2 className="h4">Ask your agent</h2>
        {!online && <Badge dot>Offline</Badge>}
      </div>
      <div className="chat-log" ref={scroller} aria-live="polite">
        {empty && (
          <div className="chat-intro">
            <p>{online ? 'Ask how the stream is doing, or tell the agent how to trade. Anything that changes the contract comes back as a transaction for you to sign.' : 'Chat needs the agent, which is offline. The kill switch works without it.'}</p>
            <div className="prompt-list">
              {PROMPTS.map((p) => <button key={p} className="prompt-full" disabled={busy || !online} onClick={() => send(p)}>{p}</button>)}
            </div>
          </div>
        )}
        {log.map((m, i) => (
          <div key={i} className={`msg msg-${m.who}`}>
            {m.text}
            {m.link && <> <a className="msg-link" href={m.link} target="_blank" rel="noreferrer">View transaction</a></>}
            {m.retry && <div><button className="btn btn-sm" disabled={busy || !online} onClick={() => send(m.retry!, true)}>Retry</button></div>}
            {m.txs?.map((t, j) => (
              <div key={j} className="msg-tx">
                <span>{t.description}</span>
                {signed[`${i}-${j}`] ? (
                  <a className="msg-tx-done" href={explorerTx(signed[`${i}-${j}`]) ?? '#'} target="_blank" rel="noreferrer">✓ Confirmed</a>
                ) : (
                  <button className="btn btn-primary btn-sm" disabled={!!pending} onClick={() => signTx(i, j, t)}>
                    {pending === (t.description || 'Agent-proposed transaction') ? <><Spinner />Signing</> : 'Sign'}
                  </button>
                )}
              </div>
            ))}
          </div>
        ))}
        {busy && <div className="msg msg-agent" aria-label="Agent is typing"><span className="typing"><span /><span /><span /></span></div>}
      </div>
      <div className="chat-foot">
        {!empty && (
          <div className="prompts">
            {PROMPTS.map((p) => <button key={p} className="prompt" disabled={busy || !online} onClick={() => send(p)}>{p}</button>)}
          </div>
        )}
        <form className="chat-form" onSubmit={(e) => { e.preventDefault(); void send(input); }}>
          <input className="input" value={input} onChange={(e) => setInput(e.target.value)} placeholder={online ? 'Message your agent' : 'Agent offline'} disabled={!online} aria-label="Message" />
          <button className="btn btn-primary" style={{ height: 44 }} disabled={busy || !online || !input.trim()}>{busy ? <><Spinner />Sending</> : 'Send'}</button>
        </form>
      </div>
    </section>
  );
}
