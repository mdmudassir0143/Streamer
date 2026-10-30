import type { Status } from '@/lib/stream';
import { Badge, type Tone } from './ui';

const MAP: Record<Status, { label: string; tone: Tone }> = {
  live: { label: 'Live', tone: 'accent' },
  paused: { label: 'Paused', tone: 'neutral' },
  halted: { label: 'Halted by drawdown breaker', tone: 'neg' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
  ended: { label: 'Ended', tone: 'neutral' },
  starved: { label: 'Starved: no allowance or balance', tone: 'warn' },
};
export function StatusChip({ status }: { status: Status }) {
  const m = MAP[status];
  return <Badge tone={m.tone} dot live={status === 'live'}>{m.label}</Badge>;
}
export function ModeChip({ mode, target }: { mode: number; target?: string }) {
  return <Badge>{mode === 0 ? 'AI agent' : `Invest into ${target ?? ''}`}</Badge>;
}
