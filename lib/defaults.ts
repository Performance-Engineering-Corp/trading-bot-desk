import type { HistoryPayload, RiskSleeve, Snapshot, WinLossStats } from './types';

export const EMPTY_STATS: WinLossStats = {
  wins: 0,
  losses: 0,
  win_rate: 0,
  total_closed: 0,
  net_pnl: 0,
};

const EMPTY_CRYPTO: RiskSleeve = {
  realized: 0,
  unrealized: 0,
  day_pnl: 0,
  open_risk: 0,
  open_risk_cap: 20000,
  day_loss_cap: 3000,
  positions: [],
};

const EMPTY_STOCKS: RiskSleeve = {
  realized: 0,
  unrealized: 0,
  day_pnl: 0,
  open_risk: 0,
  open_risk_cap: 10000,
  day_loss_cap: 1500,
  positions: [],
  idle: true,
};

export const EMPTY_SNAPSHOT: Snapshot = {
  generated_at: '',
  live_trading: false,
  crypto: EMPTY_CRYPTO,
  stocks: EMPTY_STOCKS,
  combined: {
    day_pnl: 0,
    open_risk: 0,
    open_risk_cap: 25000,
    day_loss_cap: 3000,
    day_halt_remaining: 3000,
  },
  closed_trades: [],
  recent_events: [],
  tape: [],
  stats: EMPTY_STATS,
  error: 'no data yet',
};

export const EMPTY_HISTORY: HistoryPayload = {
  updated_at: '',
  closed_trades: [],
  stats: EMPTY_STATS,
  error: 'no data yet',
};

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function asSleeve(raw: unknown, fallback: RiskSleeve): RiskSleeve {
  if (!isPlainObject(raw)) return { ...fallback, positions: [] };
  const positions = Array.isArray(raw.positions) ? raw.positions : [];
  return { ...fallback, ...(raw as Partial<RiskSleeve>), positions };
}

/** Fill missing sleeves/arrays so a partial ingest cannot crash the desk. */
export function normalizeSnapshot(raw: unknown): Snapshot {
  if (!isPlainObject(raw)) {
    return {
      ...EMPTY_SNAPSHOT,
      crypto: { ...EMPTY_CRYPTO, positions: [] },
      stocks: { ...EMPTY_STOCKS, positions: [] },
    };
  }
  const s = raw as Partial<Snapshot> & Record<string, unknown>;
  const generated_at = typeof s.generated_at === 'string' ? s.generated_at : '';
  return {
    generated_at,
    live_trading: !!s.live_trading,
    crypto: asSleeve(s.crypto, EMPTY_CRYPTO),
    stocks: asSleeve(s.stocks, EMPTY_STOCKS),
    combined: {
      ...EMPTY_SNAPSHOT.combined,
      ...(isPlainObject(s.combined) ? (s.combined as Snapshot['combined']) : {}),
    },
    closed_trades: Array.isArray(s.closed_trades) ? s.closed_trades : [],
    recent_events: Array.isArray(s.recent_events) ? s.recent_events : [],
    tape: Array.isArray(s.tape) ? s.tape : undefined,
    stats: isPlainObject(s.stats) ? (s.stats as WinLossStats) : undefined,
    cash: isPlainObject(s.cash) ? (s.cash as Snapshot['cash']) : undefined,
    limits: isPlainObject(s.limits) ? (s.limits as Snapshot['limits']) : undefined,
    meta: isPlainObject(s.meta) ? (s.meta as Snapshot['meta']) : undefined,
    error: typeof s.error === 'string' ? s.error : undefined,
  };
}

export function normalizeHistory(raw: unknown): HistoryPayload {
  if (!isPlainObject(raw)) return EMPTY_HISTORY;
  return {
    updated_at: typeof raw.updated_at === 'string' ? raw.updated_at : '',
    closed_trades: Array.isArray(raw.closed_trades) ? raw.closed_trades : [],
    stats: isPlainObject(raw.stats) ? (raw.stats as WinLossStats) : EMPTY_STATS,
    error: typeof raw.error === 'string' ? raw.error : undefined,
  };
}

export function snapshotFingerprint(s: Snapshot): string {
  const health = s.meta?.api_health;
  return [
    s.generated_at,
    s.error ?? '',
    s.live_trading ? 1 : 0,
    s.combined.day_pnl,
    s.crypto.unrealized,
    s.crypto.positions.length,
    s.crypto.positions[0]?.mark ?? '',
    s.crypto.positions[0]?.pnl ?? '',
    s.stocks.positions.length,
    s.closed_trades?.length ?? 0,
    health?.marks_stale ? 1 : 0,
    health?.marks_error ?? '',
    health?.marks_count ?? 0,
    health?.cash_ok ? 1 : 0,
  ].join('|');
}

export function historyFingerprint(h: HistoryPayload): string {
  return `${h.updated_at ?? ''}|${h.closed_trades.length}|${h.stats?.total_closed ?? 0}|${h.stats?.net_pnl ?? 0}`;
}
