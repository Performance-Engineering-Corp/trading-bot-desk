'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ClosedTrade, Snapshot, TapeEvent, WinLossStats } from '@/lib/types';
import { clsPnL, fmtMoney, fmtNum, pct, shortDate, shortTs } from '@/lib/format';
import { Meter } from './Meter';

const REFRESH_MS = 8000;

const EMPTY: Snapshot = {
  generated_at: '',
  live_trading: false,
  crypto: {
    realized: 0,
    unrealized: 0,
    day_pnl: 0,
    open_risk: 0,
    open_risk_cap: 20000,
    day_loss_cap: 3000,
    positions: [],
  },
  stocks: {
    realized: 0,
    unrealized: 0,
    day_pnl: 0,
    open_risk: 0,
    open_risk_cap: 10000,
    day_loss_cap: 1500,
    positions: [],
    idle: true,
  },
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
  stats: { wins: 0, losses: 0, win_rate: 0, total_closed: 0, net_pnl: 0 },
};

function dayLossUsed(realized = 0, unrealized = 0, cap = 3000) {
  const day = realized + unrealized;
  return { used: Math.max(0, -day), day, cap };
}

function SlTpBar({ progress, sl, tp }: { progress?: number; sl?: number; tp?: number }) {
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
}

export function Desk() {
  const [snap, setSnap] = useState<Snapshot>(EMPTY);
  const [historyStats, setHistoryStats] = useState<WinLossStats | null>(null);
  const [historyTrades, setHistoryTrades] = useState<ClosedTrade[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const load = useCallback(async () => {
    try {
      const [sRes, hRes] = await Promise.all([
        fetch('/api/snapshot', { cache: 'no-store' }),
        fetch('/api/history', { cache: 'no-store' }),
      ]);
      const s = (await sRes.json()) as Snapshot;
      const h = await hRes.json();
      setSnap({ ...EMPTY, ...s });
      if (Array.isArray(h.closed_trades)) setHistoryTrades(h.closed_trades);
      if (h.stats) setHistoryStats(h.stats);
      setErr(s.error && s.error !== 'no data yet' ? s.error : null);
      setTick((t) => t + 1);
    } catch (e) {
      setErr(`Failed to refresh: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  const c = snap.crypto || EMPTY.crypto;
  const s = snap.stocks || EMPTY.stocks;
  const comb = snap.combined || EMPTY.combined;
  const live = !!snap.live_trading;
  const closed: ClosedTrade[] =
    (snap.closed_trades && snap.closed_trades.length
      ? snap.closed_trades
      : historyTrades) || [];
  const tape: TapeEvent[] =
    (snap.tape && snap.tape.length
      ? snap.tape
      : snap.recent_events) || [];
  const stats: WinLossStats =
    snap.stats ||
    historyStats || {
      wins: 0,
      losses: 0,
      win_rate: 0,
      total_closed: closed.length,
      net_pnl: 0,
    };

  const cDay = dayLossUsed(c.realized, c.unrealized, c.day_loss_cap || 3000);
  const sDay = dayLossUsed(s.realized, s.unrealized, s.day_loss_cap || 1500);
  const stale =
    snap.meta?.api_health?.marks_stale ||
    snap.meta?.api_health?.marks_error ||
    (!snap.generated_at && snap.error === 'no data yet');

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
            <span className="ml-2 text-desk-muted/60">#{tick}</span>
          </div>
          <div className="text-right">
            <div className="desk-label">Day PnL</div>
            <div className={`font-mono text-[1.85rem] font-bold leading-tight ${clsPnL(comb.day_pnl)}`}>
              {fmtMoney(comb.day_pnl)}
            </div>
          </div>
        </div>
      </header>

      {/* Win/loss strip */}
      <div className="desk-card mb-3.5 grid grid-cols-2 gap-3 px-4 py-3 sm:grid-cols-4 md:grid-cols-6">
        <Stat label="Wins" value={String(stats.wins ?? 0)} tone="pos" />
        <Stat label="Losses" value={String(stats.losses ?? 0)} tone="neg" />
        <Stat label="Win rate" value={pct(stats.win_rate ?? 0)} />
        <Stat label="Closed" value={String(stats.total_closed ?? closed.length)} />
        <Stat label="Net closed" value={fmtMoney(stats.net_pnl ?? 0)} tone={clsPnL(stats.net_pnl)} />
        <Stat
          label="Profit factor"
          value={
            stats.profit_factor == null
              ? stats.wins
                ? '∞'
                : '—'
              : Number(stats.profit_factor).toFixed(2)
          }
        />
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
            text={`${fmtMoney(cDay.used, 2).replace('+', '')} / ${fmtMoney(cDay.cap, 0).replace('+', '')}`}
          />
          <Meter
            label="Open risk"
            used={c.open_risk || 0}
            cap={c.open_risk_cap || 20000}
            text={`${fmtMoney(c.open_risk || 0, 0).replace('+', '')} / ${fmtMoney(c.open_risk_cap || 20000, 0).replace('+', '')}`}
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
            text={`${fmtMoney(sDay.used, 2).replace('+', '')} / ${fmtMoney(sDay.cap, 0).replace('+', '')}`}
          />
          <Meter
            label="Open risk"
            used={s.open_risk || 0}
            cap={s.open_risk_cap || 10000}
            text={`${fmtMoney(s.open_risk || 0, 0).replace('+', '')} / ${fmtMoney(s.open_risk_cap || 10000, 0).replace('+', '')}`}
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
              Cash USDC{' '}
              <b className="font-mono font-semibold">{fmtMoney(snap.cash?.USDC || 0, 2).replace('+', '')}</b>
            </span>
            <span>
              USD <b className="font-mono font-semibold">{fmtMoney(snap.cash?.USD || 0, 2).replace('+', '')}</b>
            </span>
          </div>
          <Meter
            label="Open risk"
            used={comb.open_risk || 0}
            cap={comb.open_risk_cap || 25000}
            text={`${fmtMoney(comb.open_risk || 0, 0).replace('+', '')} / ${fmtMoney(comb.open_risk_cap || 25000, 0).replace('+', '')}`}
          />
          <Meter
            label="Day halt remaining"
            used={Math.max(0, (comb.day_loss_cap || 3000) - (comb.day_halt_remaining || 0))}
            cap={comb.day_loss_cap || 3000}
            text={fmtMoney(comb.day_halt_remaining || 0, 2).replace('+', '')}
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
                {['Product', 'Entry', 'Mark', 'Size', 'Notional', 'PnL $', 'PnL %', 'SL → TP', 'Opened'].map(
                  (h) => (
                    <th
                      key={h}
                      className="border-b border-desk-border px-2 py-1.5 text-left text-[0.7rem] font-semibold uppercase tracking-wide text-desk-muted"
                    >
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {!c.positions?.length ? (
                <tr>
                  <td colSpan={9} className="px-2 py-3 text-desk-muted">
                    No open crypto positions
                  </td>
                </tr>
              ) : (
                c.positions.map((r) => (
                  <tr key={`${r.product_id}-${r.opened_at}`} className="border-b border-[#1a2432] last:border-0">
                    <td className="px-2 py-2 font-mono font-semibold">{r.product_id}</td>
                    <td className="px-2 py-2 font-mono">{fmtNum(r.entry, 6)}</td>
                    <td className="px-2 py-2 font-mono">
                      {fmtNum(r.mark, 6)}
                      {r.mark_stale ? (
                        <span className="ml-1 rounded bg-desk-bg3 px-1.5 py-0.5 text-[0.72rem] text-desk-muted">
                          stale
                        </span>
                      ) : null}
                    </td>
                    <td className="px-2 py-2 font-mono">{fmtNum(r.size, 6)}</td>
                    <td className="px-2 py-2 font-mono">{fmtMoney(r.notional, 2).replace('+', '')}</td>
                    <td className={`px-2 py-2 font-mono ${clsPnL(r.pnl)}`}>{fmtMoney(r.pnl)}</td>
                    <td className={`px-2 py-2 font-mono ${clsPnL(r.pnl_pct)}`}>{fmtMoney(r.pnl_pct, 2)}%</td>
                    <td className="px-2 py-2">
                      <SlTpBar progress={r.progress_to_exit} sl={r.sl} tp={r.tp} />
                    </td>
                    <td className="px-2 py-2 font-mono text-desk-muted">{shortDate(r.opened_at)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {(s.positions?.length ?? 0) > 0 && (
        <section className="desk-card mb-3.5 p-4">
          <h2 className="desk-label mb-3">Open stock positions</h2>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[0.84rem]">
              <thead>
                <tr>
                  {['Ticker', 'Entry', 'Mark', 'Notional', 'PnL', '%'].map((h) => (
                    <th
                      key={h}
                      className="border-b border-desk-border px-2 py-1.5 text-left text-[0.7rem] font-semibold uppercase tracking-wide text-desk-muted"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {s.positions.map((r) => (
                  <tr key={`${r.product_id}-${r.opened_at}`} className="border-b border-[#1a2432] last:border-0">
                    <td className="px-2 py-2 font-mono">{r.ticker || r.product_id}</td>
                    <td className="px-2 py-2 font-mono">{fmtNum(r.entry)}</td>
                    <td className="px-2 py-2 font-mono">{fmtNum(r.mark)}</td>
                    <td className="px-2 py-2 font-mono">{fmtMoney(r.notional, 2).replace('+', '')}</td>
                    <td className={`px-2 py-2 font-mono ${clsPnL(r.pnl)}`}>{fmtMoney(r.pnl)}</td>
                    <td className={`px-2 py-2 font-mono ${clsPnL(r.pnl_pct)}`}>{fmtMoney(r.pnl_pct, 2)}%</td>
                  </tr>
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
                  {['Product', 'Entry', 'Exit', 'PnL', '%', 'Reason', 'Closed'].map((h) => (
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
                {!closed.length ? (
                  <tr>
                    <td colSpan={7} className="px-2 py-3 text-desk-muted">
                      No closed trades yet
                    </td>
                  </tr>
                ) : (
                  closed.slice(0, 40).map((t, i) => (
                    <tr
                      key={t.id || `${t.product_id}-${t.closed_at}-${i}`}
                      className="border-b border-[#1a2432] last:border-0"
                    >
                      <td className="px-2 py-2 font-mono font-semibold">{t.product_id}</td>
                      <td className="px-2 py-2 font-mono">{fmtNum(t.entry, 6)}</td>
                      <td className="px-2 py-2 font-mono">{fmtNum(t.exit, 6)}</td>
                      <td className={`px-2 py-2 font-mono ${clsPnL(t.pnl)}`}>{fmtMoney(t.pnl)}</td>
                      <td className={`px-2 py-2 font-mono ${clsPnL(t.pnl_pct)}`}>{fmtMoney(t.pnl_pct, 2)}%</td>
                      <td className="px-2 py-2 text-desk-muted">{t.reason || '—'}</td>
                      <td className="px-2 py-2 font-mono text-desk-muted">{shortDate(t.closed_at)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="desk-card p-4">
          <h2 className="desk-label mb-3">Trade tape</h2>
          <div className="max-h-[420px] overflow-auto">
            {!tape.length ? (
              <div className="py-3 text-[0.85rem] text-desk-muted">No recent activity</div>
            ) : (
              tape.slice(0, 60).map((e, i) => (
                <div
                  key={`${e.ts}-${e.type}-${e.product}-${i}`}
                  className="grid grid-cols-[72px_1fr] gap-2 border-b border-[#1a2432] py-2 text-[0.8rem] last:border-0"
                >
                  <div className="font-mono text-[0.72rem] text-desk-muted">{shortTs(e.ts)}</div>
                  <div className="leading-snug">
                    <span className="mr-1.5 font-semibold text-desk-blue">{e.type}</span>
                    <span className="font-mono text-desk-text">
                      {e.product || ''}
                      {e.notional != null ? ` · $${Number(e.notional).toFixed(0)}` : ''}
                      {e.pnl != null ? ` · ${fmtMoney(e.pnl)}` : ''}
                    </span>
                    {e.reason ? (
                      <span className="mt-0.5 block text-[0.75rem] text-desk-muted">{e.reason}</span>
                    ) : null}
                  </div>
                </div>
              ))
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

function Stat({
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
}
