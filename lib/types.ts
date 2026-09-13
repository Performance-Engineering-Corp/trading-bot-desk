/** Public sanitized trading desk snapshot (no order ids / API keys). */

export type Position = {
  product_id: string;
  ticker?: string;
  entry: number;
  size: number;
  notional: number;
  mark: number | null;
  mark_stale?: boolean;
  pnl: number;
  pnl_pct: number;
  sl?: number;
  tp?: number;
  sl_pct?: number;
  tp_pct?: number;
  opened_at?: string;
  progress_to_exit?: number;
  sleeve?: string;
  asset_class?: string;
};

export type ClosedTrade = {
  id?: string;
  product_id: string;
  ticker?: string;
  side?: string;
  entry: number;
  exit: number;
  size: number;
  notional?: number;
  pnl: number;
  pnl_pct: number;
  opened_at?: string;
  closed_at: string;
  reason?: string;
  asset_class?: string;
};

export type TapeEvent = {
  type: string;
  product?: string;
  reason?: string;
  ts: string;
  notional?: number | null;
  side?: string | null;
  pnl?: number | null;
};

export type RiskSleeve = {
  realized: number;
  unrealized: number;
  day_pnl: number;
  halted?: boolean;
  halt_reason?: string;
  day?: string;
  open_risk: number;
  open_risk_cap: number;
  day_loss_cap: number;
  hourly_entries?: number;
  hourly_cap?: number;
  hourly_bucket?: string;
  positions: Position[];
  updated_at?: string;
  idle?: boolean;
};

export type WinLossStats = {
  wins: number;
  losses: number;
  scratch?: number;
  win_rate: number;
  avg_win?: number;
  avg_loss?: number;
  profit_factor?: number | null;
  total_closed?: number;
  net_pnl?: number;
};

export type Snapshot = {
  generated_at: string;
  live_trading: boolean;
  crypto: RiskSleeve;
  stocks: RiskSleeve;
  combined: {
    day_pnl: number;
    open_risk: number;
    open_risk_cap: number;
    day_loss_cap: number;
    day_halt_remaining: number;
  };
  closed_trades?: ClosedTrade[];
  recent_events?: TapeEvent[];
  tape?: TapeEvent[];
  stats?: WinLossStats;
  cash?: { USDC?: number; USD?: number };
  limits?: {
    crypto_sl_pct?: number;
    crypto_tp_pct?: number;
    crypto_trade_cap?: number;
    stock_trade_cap?: number;
  };
  meta?: {
    state_timestamps?: Record<string, string | null | undefined>;
    api_health?: {
      marks_ok?: boolean;
      marks_stale?: boolean;
      marks_error?: string | null;
      cash_ok?: boolean;
      cash_error?: string | null;
      marks_count?: number;
    };
  };
  error?: string;
};

export type HistoryPayload = {
  updated_at: string;
  closed_trades: ClosedTrade[];
  stats?: WinLossStats;
};
