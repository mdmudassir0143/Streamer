'use client';
import { useEffect, useRef, useState } from 'react';
import { useAccount, useSendTransaction } from 'wagmi';
import { agentApi, useAgentOnline, type ChatResponse } from '@/lib/agentApi';
import { targetChain } from '@/lib/chains';
import { useToast } from './Toast';
import { useTx } from './useTx';
import { Badge } from './ui';

const PROMPTS = ["What's my P&L?", 'Slow the stream to 2 USDT/hour', 'Only trade ETH, low risk', 'Pause everything'];

interface Msg { who: 'me' | 'agent' | 'err'; text: string; txs?: ChatResponse['txs'] }

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

  async function send(message: string) {
    if (!message.trim() || busy) return;
    setLog((l) => [...l, { who: 'me', text: message }]);
    setInput('');
    setBusy(true);
    try {
      const r = await agentApi.chat({ streamId, owner: address ?? owner, message });
      setLog((l) => [...l, { who: 'agent', text: r.reply, txs: r.txs }]);
      if (r.prefsUpdated) {
        const p = r.prefsUpdated;
        toast('ok', <>Agent preferences updated: {p.riskAppetite} risk{p.assets?.length ? `, ${p.assets.join('/')}` : ''}{p.enabled === false ? ', trading off' : ''}</>);
      }
    } catch (e) {
      setLog((l) => [...l, { who: 'err', text: `The agent didn't answer (${(e as Error).message || 'offline'}). On-chain controls still work.` }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card chat-card" aria-label="Agent chat">
      <div className="card-head">
        <h2 className="h4">Ask your agent</h2>
        <Badge tone={online ? 'neutral' : 'warn'} dot>{online ? 'Online' : 'Offline'}</Badge>
      </div>
      <div className="chat-log" ref={scroller} aria-live="polite">
        {log.length === 0 && (
          <p className="small muted" style={{ margin: 0 }}>
            {online ? 'Ask about performance or change how it trades. Anything that touches the contract comes back as a transaction for you to sign.' : 'Chat needs the agent API. The kill switch works without it.'}
          </p>
        )}
        {log.map((m, i) => (
          <div key={i} className={`msg msg-${m.who}`}>
            {m.text}
            {m.txs?.map((t, j) => (
              <div key={j} className="msg-tx">
                <span>{t.description}</span>
                <button className="btn btn-primary btn-sm" disabled={!!pending}
                  onClick={() => run(t.description || 'Agent-proposed transaction', () => sendTransactionAsync({ to: t.to, data: t.data, value: BigInt(t.value || '0'), chainId: targetChain.id }))}>
                  Sign
                </button>
              </div>
            ))}
          </div>
        ))}
        {busy && <div className="msg msg-agent faint">Thinking…</div>}
      </div>
      <div className="chat-foot">
        <div className="prompts">
          {PROMPTS.map((p) => <button key={p} className="prompt" disabled={busy || !online} onClick={() => send(p)}>{p}</button>)}
        </div>
        <form className="input-row" onSubmit={(e) => { e.preventDefault(); void send(input); }}>
          <input className="input" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Message your agent" disabled={!online} aria-label="Message" />
          <button className="btn btn-primary" style={{ height: 40 }} disabled={busy || !online || !input.trim()}>Send</button>
        </form>
      </div>
    </section>
  );
}
