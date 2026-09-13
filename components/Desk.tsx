'use client';

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ClosedTrade, HistoryPayload, Position, Snapshot, TapeEvent, WinLossStats } from '@/lib/types';
import {
  EMPTY_SNAPSHOT,
  EMPTY_STATS,
  historyFingerprint,
  normalizeHistory,
  normalizeSnapshot,
  snapshotFingerprint,
} from '@/lib/defaults';
import { clsPnL, fmtAbsMoney, fmtMoney, fmtNum, pct, shortDate, shortTs } from '@/lib/format';
import { Meter } from './Meter';

const REFRESH_MS = 8000;
const HISTORY_EVERY = 4;
const CLOSED_LIMIT = 40;
const TAPE_LIMIT = 60;

const CRYPTO_COLS = ['Product', 'Entry', 'Mark', 'Size', 'Notional', 'PnL $', 'PnL %', 'SL → TP', 'Opened'] as const;
const STOCK_COLS = ['Ticker', 'Entry', 'Mark', 'Notional', 'PnL', '%'] as const;
const CLOSED_COLS = ['Product', 'Entry', 'Exit', 'PnL', '%', 'Reason', 'Closed'] as const;

function dayLossUsed(realized = 0, unrealized = 0, cap = 3000) {
  const day = realized + unrealized;
  return { used: Math.max(0, -day), day, cap };
}

const SlTpBar = memo(function SlTpBar({
  progress,
  sl,
  tp,
}: {
  progress?: number;
  sl?: number;
  tp?: number;
}) {
  const prog = Math.min(1, Math.max(0, progress ?? 0.5));
  return (
    <div className="min-w-[110px]">
      <div className="relative h-2.5 overflow-hidden rounded-md border border-[#1c2736] bg-[#0a1018]">
        <div className="absolute inset-0 bg-gradient-to-r from-desk-red via-slate-600 to-desk-green opacity-35" />
        <div
          className="absolute top-[-2px] bottom-[-2px] w-[3px] -translate-x-1/2 rounded-sm bg-white shadow-[0_0_6px_rgba(255,255,255,0.5)]"
          style={{ left: `${(prog * 100).toFixed(1)}%` }}
        />
      </div>
      <div className="mt-0.5 flex justify-between font-sans text-[0.65rem] text-desk-muted">
        <span>SL {fmtNum(sl, 4)}</span>
        <span>TP {fmtNum(tp, 4)}</span>
      </div>
    </div>
  );
});

const Stat = memo(function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div>
      <div className="desk-label">{label}</div>
      <div className={`font-mono text-lg font-semibold ${tone || 'text-desk-text'}`}>{value}</div>
    </div>
  );
});

const Th = memo(function Th({ children }: { children: string }) {
  return (
    <th className="border-b border-desk-border px-2 py-1.5 text-left text-[0.7rem] font-semibold uppercase tracking-wide text-desk-muted">
      {children}
    </th>
  );
});

const CryptoRow = memo(function CryptoRow({ r }: { r: Position }) {
  return (
    <tr className="border-b border-[#1a2432] last:border-0">
      <td className="px-2 py-2 font-mono font-semibold">{r.product_id}</td>
      <td className="px-2 py-2 font-mono">{fmtNum(r.entry, 6)}</td>
      <td className="px-2 py-2 font-mono">
        {fmtNum(r.mark, 6)}
        {r.mark_stale ? (
          <span className="ml-1 rounded bg-desk-bg3 px-1.5 py-0.5 text-[0.72rem] text-desk-muted">stale</span>
        ) : null}
      </td>
      <td className="px-2 py-2 font-mono">{fmtNum(r.size, 6)}</td>
      <td className="px-2 py-2 font-mono">{fmtAbsMoney(r.notional, 2)}</td>
      <td className={`px-2 py-2 font-mono ${clsPnL(r.pnl)}`}>{fmtMoney(r.pnl)}</td>
      <td className={`px-2 py-2 font-mono ${clsPnL(r.pnl_pct)}`}>{fmtMoney(r.pnl_pct, 2)}%</td>
      <td className="px-2 py-2">
        <SlTpBar progress={r.progress_to_exit} sl={r.sl} tp={r.tp} />
      </td>
      <td className="px-2 py-2 font-mono text-desk-muted">{shortDate(r.opened_at)}</td>
    </tr>
  );
});

const StockRow = memo(function StockRow({ r }: { r: Position }) {
  return (
    <tr className="border-b border-[#1a2432] last:border-0">
      <td className="px-2 py-2 font-mono">{r.ticker || r.product_id}</td>
      <td className="px-2 py-2 font-mono">{fmtNum(r.entry)}</td>
      <td className="px-2 py-2 font-mono">{fmtNum(r.mark)}</td>
      <td className="px-2 py-2 font-mono">{fmtAbsMoney(r.notional, 2)}</td>
      <td className={`px-2 py-2 font-mono ${clsPnL(r.pnl)}`}>{fmtMoney(r.pnl)}</td>
      <td className={`px-2 py-2 font-mono ${clsPnL(r.pnl_pct)}`}>{fmtMoney(r.pnl_pct, 2)}%</td>
    </tr>
  );
});

const ClosedRow = memo(function ClosedRow({ t }: { t: ClosedTrade }) {
  return (
    <tr className="border-b border-[#1a2432] last:border-0">
      <td className="px-2 py-2 font-mono font-semibold">{t.product_id}</td>
      <td className="px-2 py-2 font-mono">{fmtNum(t.entry, 6)}</td>
      <td className="px-2 py-2 font-mono">{fmtNum(t.exit, 6)}</td>
      <td className={`px-2 py-2 font-mono ${clsPnL(t.pnl)}`}>{fmtMoney(t.pnl)}</td>
      <td className={`px-2 py-2 font-mono ${clsPnL(t.pnl_pct)}`}>{fmtMoney(t.pnl_pct, 2)}%</td>
      <td className="px-2 py-2 text-desk-muted">{t.reason || '—'}</td>
      <td className="px-2 py-2 font-mono text-desk-muted">{shortDate(t.closed_at)}</td>
    </tr>
  );
});

const TapeRow = memo(function TapeRow({ e }: { e: TapeEvent }) {
  return (
    <div className="grid grid-cols-[72px_1fr] gap-2 border-b border-[#1a2432] py-2 text-[0.8rem] last:border-0">
      <div className="font-mono text-[0.72rem] text-desk-muted">{shortTs(e.ts)}</div>
      <div className="leading-snug">
        <span className="mr-1.5 font-semibold text-desk-blue">{e.type}</span>
        <span className="font-mono text-desk-text">
          {e.product || ''}
          {e.notional != null ? ` · $${Number(e.notional).toFixed(0)}` : ''}
          {e.pnl != null ? ` · ${fmtMoney(e.pnl)}` : ''}
        </span>
        {e.reason ? <span className="mt-0.5 block text-[0.75rem] text-desk-muted">{e.reason}</span> : null}
      </div>
    </div>
  );
});

export type DeskProps = {
  initialSnapshot?: Snapshot;
  initialHistory?: HistoryPayload;
};

export function Desk({ initialSnapshot, initialHistory }: DeskProps) {
  const [snap, setSnap] = useState<Snapshot>(() => initialSnapshot ?? EMPTY_SNAPSHOT);
  const [historyStats, setHistoryStats] = useState<WinLossStats | null>(() => initialHistory?.stats ?? null);
  const [historyTrades, setHistoryTrades] = useState<ClosedTrade[]>(() => initialHistory?.closed_trades ?? []);
  const [err, setErr] = useState<string | null>(() => {
    const e = initialSnapshot?.error;
    return e && e !== 'no data yet' ? e : null;
  });

  const snapRef = useRef(snap);
  snapRef.current = snap;
  const snapFpRef = useRef(snapshotFingerprint(initialSnapshot ?? EMPTY_SNAPSHOT));
  const histFpRef = useRef(historyFingerprint(initialHistory ?? { closed_trades: [] }));
  const pollN = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const inFlight = useRef(false);

  const load = useCallback(async () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    if (inFlight.current) return;

    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    inFlight.current = true;
    pollN.current += 1;

    const needHistory =
      !(snapRef.current.closed_trades && snapRef.current.closed_trades.length) ||
      pollN.current % HISTORY_EVERY === 0;

    try {
      const snapReq = fetch('/api/snapshot', { cache: 'no-store', signal: ac.signal });
      const histReq = needHistory ? fetch('/api/history', { cache: 'no-store', signal: ac.signal }) : null;
      const [sRes, hRes] = await Promise.all([snapReq, histReq]);

      if (sRes.ok) {
        const next = normalizeSnapshot(await sRes.json());
        const fp = snapshotFingerprint(next);
        if (fp !== snapFpRef.current) {
          snapFpRef.current = fp;
          setSnap(next);
        }
        const nextErr = next.error && next.error !== 'no data yet' ? next.error : null;
        setErr((prev) => (prev === nextErr ? prev : nextErr));
      } else {
        setErr((prev) => prev ?? `Failed to refresh: HTTP ${sRes.status}`);
      }

      if (hRes?.ok) {
        const h = normalizeHistory(await hRes.json());
        const fp = historyFingerprint(h);
        if (fp !== histFpRef.current) {
          histFpRef.current = fp;
          setHistoryTrades(h.closed_trades);
          if (h.stats) setHistoryStats(h.stats);
        }
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      setErr(`Failed to refresh: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      if (abortRef.current === ac) inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    const hasSsr = Boolean(initialSnapshot?.generated_at);
    if (!hasSsr) void load();

    const id = window.setInterval(() => {
      void load();
    }, REFRESH_MS);

    const onVis = () => {
      if (document.visibilityState === 'visible') void load();
    };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
      abortRef.current?.abort();
    };
  }, [load, initialSnapshot?.generated_at]);

  const c = snap.crypto;
  const s = snap.stocks;
  const comb = snap.combined;
  const live = snap.live_trading;

  const closed = useMemo<ClosedTrade[]>(() => {
    if (snap.closed_trades && snap.closed_trades.length) return snap.closed_trades;
    return historyTrades;
  }, [snap.closed_trades, historyTrades]);

  const tape = useMemo<TapeEvent[]>(() => {
    if (snap.tape && snap.tape.length) return snap.tape;
    return snap.recent_events ?? [];
  }, [snap.tape, snap.recent_events]);

  const stats = useMemo<WinLossStats>(() => {
    if (snap.stats) return snap.stats;
    if (historyStats) return historyStats;
    return { ...EMPTY_STATS, total_closed: closed.length };
  }, [snap.stats, historyStats, closed.length]);

  const cDay = useMemo(
    () => dayLossUsed(c.realized, c.unrealized, c.day_loss_cap || 3000),
    [c.realized, c.unrealized, c.day_loss_cap]
  );
  const sDay = useMemo(
    () => dayLossUsed(s.realized, s.unrealized, s.day_loss_cap || 1500),
    [s.realized, s.unrealized, s.day_loss_cap]
  );

  const stale =
    snap.meta?.api_health?.marks_stale ||
    snap.meta?.api_health?.marks_error ||
    (!snap.generated_at && snap.error === 'no data yet');

  const closedVisible = useMemo(() => closed.slice(0, CLOSED_LIMIT), [closed]);
  const tapeVisible = useMemo(() => tape.slice(0, TAPE_LIMIT), [tape]);

  const profitFactor =
    stats.profit_factor == null ? (stats.wins ? '∞' : '—') : Number(stats.profit_factor).toFixed(2);

  return (
    <div className="mx-auto max-w-[1280px] px-5 pb-12 pt-5">
      {(err || stale) && (
        <div className="mb-3 rounded-lg border border-desk-amber/35 bg-desk-amber/10 px-3 py-2 text-[0.82rem] text-desk-amber">
          {err ||
            (snap.error === 'no data yet'
              ? 'Waiting for first ingest — POST a snapshot to /api/snapshot'
              : `Marks stale or partial — ${snap.meta?.api_health?.marks_error || 'showing last known values'}`)}
        </div>
      )}

      <header className="mb-[18px] flex flex-wrap items-center justify-between gap-4 rounded-[14px] border border-desk-border bg-gradient-to-b from-desk-bg2 to-desk-bg3 px-5 py-4 shadow-glow">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="m-0 text-[1.15rem] font-semibold tracking-wide">Trading Bot</h1>
            <div className="text-[0.78rem] text-desk-muted">Public read-only desk · real trades only</div>
          </div>
          <span
            className={`rounded-full border px-2.5 py-1 text-[0.72rem] font-bold uppercase tracking-[0.08em] ${
              live
                ? 'border-desk-green bg-desk-green/15 text-desk-green shadow-glow-green'
                : 'border-desk-amber bg-desk-amber/10 text-desk-amber'
            }`}
          >
            {live ? (
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-1.5 w-1.5 animate-pulseDot rounded-full bg-desk-green" />
                LIVE
              </span>
            ) : (
              'PAPER'
            )}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-7">
          <div className="font-mono text-[0.82rem] text-desk-muted">
            Refresh {shortDate(snap.generated_at) || '—'}
          </div>
          <div className="text-right">
            <div className="desk-label">Day PnL</div>
            <div className={`font-mono text-[1.85rem] font-bold leading-tight ${clsPnL(comb.day_pnl)}`}>
              {fmtMoney(comb.day_pnl)}
            </div>
          </div>
        </div>
      </header>

      <div className="desk-card mb-3.5 grid grid-cols-2 gap-3 px-4 py-3 sm:grid-cols-4 md:grid-cols-6">
        <Stat label="Wins" value={String(stats.wins ?? 0)} tone="pos" />
        <Stat label="Losses" value={String(stats.losses ?? 0)} tone="neg" />
        <Stat label="Win rate" value={pct(stats.win_rate ?? 0)} />
        <Stat label="Closed" value={String(stats.total_closed ?? closed.length)} />
        <Stat label="Net closed" value={fmtMoney(stats.net_pnl ?? 0)} tone={clsPnL(stats.net_pnl)} />
        <Stat label="Profit factor" value={profitFactor} />
      </div>

      <div className="mb-3.5 grid gap-3.5 md:grid-cols-3">
        <section className="desk-card p-4">
          <h2 className="desk-label mb-3">Crypto risk</h2>
          <div className="mb-2 flex flex-wrap gap-4 text-[0.8rem]">
            <span>
              Realized <b className={`font-mono font-semibold ${clsPnL(c.realized)}`}>{fmtMoney(c.realized)}</b>
            </span>
            <span>
              Unrealized <b className={`font-mono font-semibold ${clsPnL(c.unrealized)}`}>{fmtMoney(c.unrealized)}</b>
            </span>
            <span>
              Halt{' '}
              <b className={`font-mono font-semibold ${c.halted ? 'neg' : 'pos'}`}>
                {c.halted ? `HALTED${c.halt_reason ? `: ${c.halt_reason}` : ''}` : 'ok'}
              </b>
            </span>
          </div>
          <Meter
            label="Day loss used"
            used={cDay.used}
            cap={cDay.cap}
            text={`${fmtAbsMoney(cDay.used, 2)} / ${fmtAbsMoney(cDay.cap, 0)}`}
          />
          <Meter
            label="Open risk"
            used={c.open_risk || 0}
            cap={c.open_risk_cap || 20000}
            text={`${fmtAbsMoney(c.open_risk || 0, 0)} / ${fmtAbsMoney(c.open_risk_cap || 20000, 0)}`}
          />
          <Meter
            label="Hourly entries"
            used={c.hourly_entries || 0}
            cap={c.hourly_cap || 2}
            text={`${c.hourly_entries || 0} / ${c.hourly_cap || 2}`}
          />
        </section>

        <section className="desk-card p-4">
          <h2 className="desk-label mb-3">Stocks risk</h2>
          <div className="mb-2 flex flex-wrap gap-4 text-[0.8rem]">
            <span>
              Day PnL <b className={`font-mono font-semibold ${clsPnL(s.day_pnl)}`}>{fmtMoney(s.day_pnl)}</b>
            </span>
            <span>
              Status{' '}
              <b className={`font-mono font-semibold ${s.halted ? 'neg' : 'neu'}`}>
                {s.idle ? 'idle' : s.halted ? 'HALTED' : 'active'}
              </b>
            </span>
          </div>
          <Meter
            label="Day loss used"
            used={sDay.used}
            cap={sDay.cap}
            text={`${fmtAbsMoney(sDay.used, 2)} / ${fmtAbsMoney(sDay.cap, 0)}`}
          />
          <Meter
            label="Open risk"
            used={s.open_risk || 0}
            cap={s.open_risk_cap || 10000}
            text={`${fmtAbsMoney(s.open_risk || 0, 0)} / ${fmtAbsMoney(s.open_risk_cap || 10000, 0)}`}
          />
          <Meter
            label="Hourly entries"
            used={s.hourly_entries || 0}
            cap={s.hourly_cap || 2}
            text={`${s.hourly_entries || 0} / ${s.hourly_cap || 2}`}
          />
        </section>

        <section className="desk-card p-4">
          <h2 className="desk-label mb-3">Combined</h2>
          <div className="mb-2 flex flex-wrap gap-4 text-[0.8rem]">
            <span>
              Cash USDC <b className="font-mono font-semibold">{fmtAbsMoney(snap.cash?.USDC || 0, 2)}</b>
            </span>
            <span>
              USD <b className="font-mono font-semibold">{fmtAbsMoney(snap.cash?.USD || 0, 2)}</b>
            </span>
          </div>
          <Meter
            label="Open risk"
            used={comb.open_risk || 0}
            cap={comb.open_risk_cap || 25000}
            text={`${fmtAbsMoney(comb.open_risk || 0, 0)} / ${fmtAbsMoney(comb.open_risk_cap || 25000, 0)}`}
          />
          <Meter
            label="Day halt remaining"
            used={Math.max(0, (comb.day_loss_cap || 3000) - (comb.day_halt_remaining || 0))}
            cap={comb.day_loss_cap || 3000}
            text={fmtAbsMoney(comb.day_halt_remaining || 0, 2)}
          />
          <div className="mt-2 text-[0.8rem] text-desk-muted">
            SL / TP{' '}
            <b className="font-mono text-desk-text">
              {snap.limits?.crypto_sl_pct ?? -2}% / +{snap.limits?.crypto_tp_pct ?? 3}%
            </b>
          </div>
        </section>
      </div>

      <section className="desk-card mb-3.5 p-4">
        <h2 className="desk-label mb-3">Open crypto positions</h2>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[0.84rem]">
            <thead>
              <tr>
                {CRYPTO_COLS.map((h) => (
                  <Th key={h}>{h}</Th>
                ))}
              </tr>
            </thead>
            <tbody>
              {!c.positions.length ? (
                <tr>
                  <td colSpan={9} className="px-2 py-3 text-desk-muted">
                    No open crypto positions
                  </td>
                </tr>
              ) : (
                c.positions.map((r) => <CryptoRow key={`${r.product_id}-${r.opened_at}`} r={r} />)
              )}
            </tbody>
          </table>
        </div>
      </section>

      {s.positions.length > 0 && (
        <section className="desk-card mb-3.5 p-4">
          <h2 className="desk-label mb-3">Open stock positions</h2>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[0.84rem]">
              <thead>
                <tr>
                  {STOCK_COLS.map((h) => (
                    <Th key={h}>{h}</Th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {s.positions.map((r) => (
                  <StockRow key={`${r.product_id}-${r.opened_at}`} r={r} />
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <div className="mb-3.5 grid gap-3.5 lg:grid-cols-[1.4fr_1fr]">
        <section className="desk-card p-4">
          <h2 className="desk-label mb-3">Closed trades</h2>
          <div className="max-h-[420px] overflow-auto">
            <table className="w-full border-collapse text-[0.84rem]">
              <thead>
                <tr>
                  {CLOSED_COLS.map((h) => (
                    <th
                      key={h}
                      className="sticky top-0 border-b border-desk-border bg-desk-bg2 px-2 py-1.5 text-left text-[0.7rem] font-semibold uppercase tracking-wide text-desk-muted"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {!closedVisible.length ? (
                  <tr>
                    <td colSpan={7} className="px-2 py-3 text-desk-muted">
                      No closed trades yet
                    </td>
                  </tr>
                ) : (
                  closedVisible.map((t, i) => (
                    <ClosedRow key={t.id || `${t.product_id}-${t.closed_at}-${i}`} t={t} />
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="desk-card p-4">
          <h2 className="desk-label mb-3">Trade tape</h2>
          <div className="max-h-[420px] overflow-auto">
            {!tapeVisible.length ? (
              <div className="py-3 text-[0.85rem] text-desk-muted">No recent activity</div>
            ) : (
              tapeVisible.map((e, i) => <TapeRow key={`${e.ts}-${e.type}-${e.product}-${i}`} e={e} />)
            )}
          </div>
        </section>
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-desk-border bg-desk-bg2 px-4 py-3 text-[0.72rem] text-desk-muted">
        <div>
          State · positions {shortDate(snap.meta?.state_timestamps?.positions)} · risk{' '}
          {shortDate(snap.meta?.state_timestamps?.daily_risk)} · auto-refresh {REFRESH_MS / 1000}s
        </div>
        <div>
          API · marks{' '}
          {snap.meta?.api_health?.marks_ok
            ? 'ok'
            : snap.meta?.api_health?.marks_stale
              ? 'stale'
              : '—'}{' '}
          ({snap.meta?.api_health?.marks_count ?? 0}) · cash{' '}
          {snap.meta?.api_health?.cash_ok ? 'ok' : snap.meta?.api_health ? 'err' : '—'}
        </div>
      </footer>
    </div>
  );
}
