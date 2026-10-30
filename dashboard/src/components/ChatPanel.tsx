'use client';
import { useEffect, useRef, useState } from 'react';
import { useAccount, useSendTransaction } from 'wagmi';
import { agentApi, useAgentOnline, type ChatResponse } from '@/lib/agentApi';
import { targetChain } from '@/lib/chains';
import { useToast } from './Toast';
import { useTx } from './useTx';
import { Badge, Spinner } from './ui';

const PROMPTS = ["What's my P&L?", 'Slow the stream to 2 USDT/hour', 'Only trade ETH, low risk', 'Pause everything'];

interface Msg { who: 'me' | 'agent' | 'err'; text: string; txs?: ChatResponse['txs']; retry?: string }

export function ChatPanel({ streamId, owner }: { streamId: string; owner: string }) {
  const { online } = useAgentOnline();
  const { address } = useAccount();
  const [log, setLog] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const { sendTransactionAsync } = useSendTransaction();
  const { run, pending } = useTx();
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
            {m.retry && <div><button className="btn btn-sm" disabled={busy || !online} onClick={() => send(m.retry!, true)}>Retry</button></div>}
            {m.txs?.map((t, j) => (
              <div key={j} className="msg-tx">
                <span>{t.description}</span>
                <button className="btn btn-primary btn-sm" disabled={!!pending}
                  onClick={() => run(t.description || 'Agent-proposed transaction', () => sendTransactionAsync({ to: t.to, data: t.data, value: BigInt(t.value || '0'), chainId: targetChain.id }))}>
                  {pending === (t.description || 'Agent-proposed transaction') ? <><Spinner />Signing</> : 'Sign'}
                </button>
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
