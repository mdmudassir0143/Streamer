'use client';
import { Fragment, useMemo, useState } from 'react';
import { useDecisions, type Decision } from '@/lib/agentApi';
import { explorerTx } from '@/lib/chains';
import { decimalsOf, symbolOf } from '@/lib/deployments';
import { ageShort, fmtUnits } from '@/lib/format';
import { Badge, ExternalIcon, Tabs, type Tone } from './ui';

type Kind = 'trade' | 'veto' | 'hold' | 'failed';
type Filter = 'all' | 'trade' | 'veto' | 'hold';
const PAGE = 25;

interface AssetView { asset: string; view: string; conviction?: number; rationale?: string }
interface RiskCheck { name: string; ok: boolean; detail?: string }
interface RiskOut { verdict?: string; reason?: string; checks?: RiskCheck[]; engine?: string }
interface AnalystOut { summary?: string; views?: AssetView[]; engine?: string }

const tsOf = (d: Decision) => (typeof d.ts === 'string' ? Date.parse(d.ts) : d.ts);
const riskOf = (d: Decision) => (d.risk && typeof d.risk === 'object' ? (d.risk as RiskOut) : null);
const analystOf = (d: Decision) => (d.analyst && typeof d.analyst === 'object' ? (d.analyst as AnalystOut) : null);

function kindOf(d: Decision): Kind {
  if (d.blocked || riskOf(d)?.verdict === 'veto') return 'veto';
  if (d.action === 'hold') return 'hold';
  if (d.error && !d.txHash) return 'failed';
  return 'trade';
}

/** Short, groupable reason: the first clause, without numbers in brackets. */
function shortReason(d: Decision, kind: Kind): string {
  const raw = kind === 'veto' ? riskOf(d)?.reason || d.reason || '' : kind === 'failed' ? d.error || '' : d.reason || '';
  let s = raw.replace(/^VETO:\s*/i, '');
  if (kind === 'hold') s = s.split(':')[0];
  s = s.split(/[(;|]/)[0].trim();
  return s || (kind === 'hold' ? 'no edge' : '');
}

function pairOf(d: Decision): string {
  if (!d.tokenIn || !d.tokenOut) return '—';
  const s = String(d.amountIn ?? '');
  const amt = /^\d+$/.test(s) ? fmtUnits(BigInt(s), decimalsOf(d.tokenIn), 2, 0) : s;
  return `${amt} ${symbolOf(d.tokenIn)} → ${symbolOf(d.tokenOut)}`;
}

interface Group { key: string; kind: Kind; reason: string; items: Decision[] }

function group(list: Decision[]): Group[] {
  const out: Group[] = [];
  for (const d of list) {
    const kind = kindOf(d);
    const reason = shortReason(d, kind);
    const last = out[out.length - 1];
    if (last && kind !== 'trade' && last.kind === kind && last.reason === reason) last.items.push(d);
    else out.push({ key: `${tsOf(d)}-${out.length}`, kind, reason, items: [d] });
  }
  return out;
}

function actionBadge(g: Group) {
  const n = g.items.length > 1 ? ` ×${g.items.length}` : '';
  const d = g.items[0];
  const map: Record<Kind, [string, Tone]> = {
    trade: [d.action === 'sell' ? 'Sell' : 'Buy', 'accent'],
    veto: ['Vetoed', 'neg'],
    hold: ['Hold', 'neutral'],
    failed: ['Failed', 'warn'],
  };
  const [label, tone] = map[g.kind];
  return <Badge tone={tone}>{label}{n}</Badge>;
}

function Detail({ g }: { g: Group }) {
  const d = g.items[0];
  const a = analystOf(d);
  const r = riskOf(d);
  const link = d.txHash ? explorerTx(d.txHash) : null;
  return (
    <div className="feed-detail">
      {g.items.length > 1 && <p className="faint">{g.items.length} identical decisions in a row. Showing the latest.</p>}
      <div>
        <h5>Analyst</h5>
        <p>{a?.summary ?? (typeof d.analyst === 'string' ? d.analyst : d.reason)}</p>
        {a?.views?.length ? (
          <div className="feed-views" style={{ marginTop: 6 }}>
            {a.views.map((v) => (
              <div key={v.asset} className="small">
                <span className="mono">{v.asset}</span>
                <span>{v.view}{v.conviction ? ` ${Math.round(v.conviction * 100)}%` : ''}</span>
                <span className="faint" style={{ overflowWrap: 'anywhere' }}>{v.rationale}</span>
              </div>
            ))}
          </div>
        ) : null}
      </div>
      <div>
        <h5>Risk officer</h5>
        <p>
          <span className={r?.verdict === 'veto' ? 'neg' : undefined}>{r?.verdict ? `${r.verdict[0].toUpperCase()}${r.verdict.slice(1)}` : '—'}</span>
          {r?.reason ? `: ${r.reason}` : ''}
        </p>
        {r?.checks?.length ? (
          <div className="checks" style={{ marginTop: 6 }}>
            {r.checks.map((c) => <Badge key={c.name} tone={c.ok ? 'neutral' : 'neg'} title={c.detail}>{c.ok ? '' : 'Failed: '}{c.name}</Badge>)}
          </div>
        ) : null}
      </div>
      {d.error && <div><h5>Error</h5><p className="warn">{d.error}</p></div>}
      <div className="spread">
        <div>
          <h5>Decision hash committed on-chain</h5>
          <div className="hash">{d.reasonHash ?? '—'}</div>
        </div>
        <div className="row">
          <Badge>{(d.engine ?? a?.engine ?? 'rules') === 'llm' ? 'LLM' : 'Rules'} engine</Badge>
          {link && <a className="link small" href={link} target="_blank" rel="noreferrer">View transaction</a>}
        </div>
      </div>
    </div>
  );
}

export function DecisionsFeed({ id }: { id: string }) {
  const { data, isLoading, isError, isSuccess } = useDecisions(id);
  const [filter, setFilter] = useState<Filter>('all');
  const [shown, setShown] = useState(PAGE);
  const [open, setOpen] = useState<string | null>(null);

  const counts = useMemo(() => {
    const c = { all: 0, trade: 0, veto: 0, hold: 0 };
    for (const d of data ?? []) {
      c.all++;
      const k = kindOf(d);
      if (k === 'trade') c.trade++;
      else if (k === 'veto') c.veto++;
      else if (k === 'hold') c.hold++;
    }
    return c;
  }, [data]);

  const groups = useMemo(() => {
    const list = (data ?? []).filter((d) => filter === 'all' || kindOf(d) === filter);
    return group(list);
  }, [data, filter]);

  return (
    <section className="card feed-card" aria-label="Agent decisions">
      <div className="card-head">
        <h2 className="h4">Agent decisions</h2>
        {isSuccess ? <Badge dot live>Live</Badge> : isError ? <Badge tone="warn" dot>Agent offline</Badge> : null}
      </div>
      <div className="feed-tools">
        <Tabs
          label="Filter decisions"
          value={filter}
          onChange={(v) => { setFilter(v); setShown(PAGE); setOpen(null); }}
          tabs={[
            { id: 'all', label: 'All', count: counts.all },
            { id: 'trade', label: 'Trades', count: counts.trade },
            { id: 'veto', label: 'Vetoes', count: counts.veto },
            { id: 'hold', label: 'Holds', count: counts.hold },
          ]}
        />
        <span className="small faint">{groups.length} rows</span>
      </div>
      <div className="feed-scroll">
        {isLoading && <p className="muted" style={{ padding: 16, margin: 0 }}>Loading decisions…</p>}
        {(isError || (!isLoading && !data)) && (
          <p className="muted" style={{ padding: 16, margin: 0 }}>Decisions appear when the agent API is reachable. On-chain controls keep working.</p>
        )}
        {data && groups.length === 0 && <p className="muted" style={{ padding: 16, margin: 0 }}>Nothing here yet. The agent reviews the market every tick once funds have streamed in.</p>}
        {groups.slice(0, shown).map((g) => {
          const newest = tsOf(g.items[0]);
          const oldest = tsOf(g.items[g.items.length - 1]);
          const time = g.items.length > 1 ? `${ageShort(newest)}–${ageShort(oldest)}` : ageShort(newest);
          const tx = g.items[0].txHash ? explorerTx(g.items[0].txHash) : null;
          const isOpen = open === g.key;
          return (
            <Fragment key={g.key}>
              <div className="feed-row" role="button" tabIndex={0} aria-expanded={isOpen}
                onClick={() => setOpen(isOpen ? null : g.key)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(isOpen ? null : g.key); } }}>
                <span className="feed-time" title={new Date(newest).toLocaleString()}>{time}</span>
                <span>{actionBadge(g)}</span>
                <span className="feed-pair">{g.kind === 'hold' ? '—' : pairOf(g.items[0])}</span>
                <span className="feed-reason" title={g.reason}>{g.reason}</span>
                {tx ? (
                  <a className="icon-btn" href={tx} target="_blank" rel="noreferrer" aria-label="View transaction" onClick={(e) => e.stopPropagation()}><ExternalIcon /></a>
                ) : <span />}
              </div>
              {isOpen && <Detail g={g} />}
            </Fragment>
          );
        })}
        {groups.length > shown && (
          <div className="feed-more"><button className="btn btn-sm" onClick={() => setShown((n) => n + PAGE)}>Load {Math.min(PAGE, groups.length - shown)} more</button></div>
        )}
      </div>
    </section>
  );
}
