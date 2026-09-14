'use client';

import { memo, useMemo, useState } from 'react';
import type { ClosedTrade } from '@/lib/types';
import { clsPnL, fmtMoney } from '@/lib/format';

export type PeriodKey = '24h' | '7d' | '30d' | 'all';
export type BookKey = 'all' | 'crypto' | 'stocks';

const PERIODS: { key: PeriodKey; label: string; ms: number | null }[] = [
  { key: '24h', label: '24h', ms: 24 * 60 * 60 * 1000 },
  { key: '7d', label: '7d', ms: 7 * 24 * 60 * 60 * 1000 },
  { key: '30d', label: '30d', ms: 30 * 24 * 60 * 60 * 1000 },
  { key: 'all', label: 'All', ms: null },
];

const BOOKS: { key: BookKey; label: string }[] = [
  { key: 'all', label: 'Combined' },
  { key: 'crypto', label: 'Crypto' },
  { key: 'stocks', label: 'Stocks' },
];

function tradeTime(t: ClosedTrade): number {
  const raw = t.closed_at || t.opened_at || '';
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : 0;
}

function tradePnl(t: ClosedTrade): number {
  const v = t.pnl;
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function bookOf(t: ClosedTrade): BookKey {
  const a = (t.asset_class || '').toLowerCase();
  if (a === 'stocks' || a === 'equity' || a === 'stock') return 'stocks';
  return 'crypto';
}

export function filterTradesByPeriod(trades: ClosedTrade[], period: PeriodKey, now = Date.now()): ClosedTrade[] {
  const sorted = [...trades].filter((t) => tradeTime(t) > 0).sort((a, b) => tradeTime(a) - tradeTime(b));
  const def = PERIODS.find((p) => p.key === period);
  if (!def || def.ms == null) return sorted;
  const cutoff = now - def.ms;
  return sorted.filter((t) => tradeTime(t) >= cutoff);
}

export function buildCumulativeCurve(trades: ClosedTrade[]): { t: number; cumulative: number }[] {
  let cum = 0;
  const pts: { t: number; cumulative: number }[] = [];
  for (const tr of trades) {
    cum += tradePnl(tr);
    pts.push({ t: tradeTime(tr), cumulative: cum });
  }
  return pts;
}

type DayBooks = {
  cryptoDay?: number;
  stocksDay?: number;
  combinedDay?: number;
  cryptoUnreal?: number;
  stocksUnreal?: number;
};

type Props = {
  trades: ClosedTrade[];
  allTrades?: ClosedTrade[];
  dayBooks?: DayBooks;
};

export const PnLChart = memo(function PnLChart({ trades, allTrades, dayBooks }: Props) {
  const [period, setPeriod] = useState<PeriodKey>('all');
  const [book, setBook] = useState<BookKey>('all');
  const sourceAll = allTrades && allTrades.length ? allTrades : trades;

  const byBook = useMemo(() => {
    const crypto = sourceAll.filter((t) => bookOf(t) === 'crypto');
    const stocks = sourceAll.filter((t) => bookOf(t) === 'stocks');
    return { all: sourceAll, crypto, stocks };
  }, [sourceAll]);

  const active = byBook[book];
  const inceptionPnl = useMemo(() => active.reduce((s, t) => s + tradePnl(t), 0), [active]);
  const periodTrades = useMemo(() => filterTradesByPeriod(active, period), [active, period]);
  const periodPnl = useMemo(() => periodTrades.reduce((s, t) => s + tradePnl(t), 0), [periodTrades]);
  const curve = useMemo(() => buildCumulativeCurve(periodTrades), [periodTrades]);

  const cryptoInception = useMemo(() => byBook.crypto.reduce((s, t) => s + tradePnl(t), 0), [byBook.crypto]);
  const stocksInception = useMemo(() => byBook.stocks.reduce((s, t) => s + tradePnl(t), 0), [byBook.stocks]);

  const w = 640;
  const h = 160;
  const pad = { top: 12, right: 12, bottom: 22, left: 48 };

  const { path, zeroY, minY, maxY } = useMemo(() => {
    if (curve.length === 0) {
      return { path: '', zeroY: h / 2, minY: -1, maxY: 1 };
    }
    const ys = curve.map((p) => p.cumulative);
    let min = Math.min(0, ...ys);
    let max = Math.max(0, ...ys);
    if (min === max) {
      min -= 1;
      max += 1;
    }
    const span = max - min || 1;
    const xs = curve.map((p) => p.t);
    const t0 = xs[0];
    const t1 = xs[xs.length - 1] === t0 ? t0 + 1 : xs[xs.length - 1];
    const innerW = w - pad.left - pad.right;
    const innerH = h - pad.top - pad.bottom;
    const xOf = (t: number) => pad.left + ((t - t0) / (t1 - t0)) * innerW;
    const yOf = (v: number) => pad.top + (1 - (v - min) / span) * innerH;
    const d = curve
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${xOf(p.t).toFixed(1)},${yOf(p.cumulative).toFixed(1)}`)
      .join(' ');
    return { path: d, zeroY: yOf(0), minY: min, maxY: max };
  }, [curve]);

  const stroke = periodPnl >= 0 ? '#22c55e' : '#ef4444';

  return (
    <section className="desk-card mb-3.5 p-4">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="desk-label mb-2">Realized P&amp;L</h2>
          <div className="mb-3 grid grid-cols-3 gap-3 sm:max-w-lg">
            <div>
              <div className="desk-label">Combined day</div>
              <div className={`font-mono text-lg font-bold ${clsPnL(dayBooks?.combinedDay)}`}>
                {fmtMoney(dayBooks?.combinedDay ?? 0)}
              </div>
            </div>
            <div>
              <div className="desk-label">Crypto day</div>
              <div className={`font-mono text-lg font-bold ${clsPnL(dayBooks?.cryptoDay)}`}>
                {fmtMoney(dayBooks?.cryptoDay ?? 0)}
              </div>
              <div className="text-[0.7rem] text-desk-muted">U {fmtMoney(dayBooks?.cryptoUnreal ?? 0)}</div>
            </div>
            <div>
              <div className="desk-label">Stocks day</div>
              <div className={`font-mono text-lg font-bold ${clsPnL(dayBooks?.stocksDay)}`}>
                {fmtMoney(dayBooks?.stocksDay ?? 0)}
              </div>
              <div className="text-[0.7rem] text-desk-muted">U {fmtMoney(dayBooks?.stocksUnreal ?? 0)}</div>
            </div>
          </div>
          <div className="flex flex-wrap items-baseline gap-4">
            <div>
              <div className="desk-label">Since inception ({book === 'all' ? 'combined' : book})</div>
              <div className={`font-mono text-xl font-bold ${clsPnL(inceptionPnl)}`}>{fmtMoney(inceptionPnl)}</div>
            </div>
            <div>
              <div className="desk-label">Selected period</div>
              <div className={`font-mono text-xl font-bold ${clsPnL(periodPnl)}`}>{fmtMoney(periodPnl)}</div>
            </div>
            <div className="text-[0.75rem] text-desk-muted">
              crypto closed {fmtMoney(cryptoInception)} · stocks closed {fmtMoney(stocksInception)} · {periodTrades.length}{' '}
              close{periodTrades.length === 1 ? '' : 's'}
            </div>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Book filter">
            {BOOKS.map((b) => (
              <button
                key={b.key}
                type="button"
                onClick={() => setBook(b.key)}
                aria-pressed={book === b.key}
                className={`rounded-md px-2.5 py-1 text-[0.75rem] font-semibold transition ${
                  book === b.key
                    ? 'bg-desk-blue/20 text-desk-blue ring-1 ring-desk-blue/50'
                    : 'bg-desk-bg3 text-desk-muted ring-1 ring-desk-border hover:text-desk-text'
                }`}
              >
                {b.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="P&L time period">
            {PERIODS.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => setPeriod(p.key)}
                aria-pressed={period === p.key}
                className={`rounded-md px-2.5 py-1 text-[0.75rem] font-semibold transition ${
                  period === p.key
                    ? 'bg-desk-cyan/20 text-desk-cyan ring-1 ring-desk-cyan/50'
                    : 'bg-desk-bg3 text-desk-muted ring-1 ring-desk-border hover:text-desk-text'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {curve.length === 0 ? (
        <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-desk-border text-sm text-desk-muted">
          No closed trades in this book/period yet
        </div>
      ) : (
        <svg viewBox={`0 0 ${w} ${h}`} className="h-40 w-full" role="img" aria-label="Cumulative realized P&L chart">
          <line
            x1={pad.left}
            x2={w - pad.right}
            y1={zeroY}
            y2={zeroY}
            stroke="#243041"
            strokeDasharray="4 3"
            strokeWidth={1}
          />
          <text x={4} y={pad.top + 4} className="fill-desk-muted" style={{ fontSize: 10, fontFamily: 'ui-monospace, monospace' }}>
            {fmtMoney(maxY)}
          </text>
          <text x={4} y={h - pad.bottom} className="fill-desk-muted" style={{ fontSize: 10, fontFamily: 'ui-monospace, monospace' }}>
            {fmtMoney(minY)}
          </text>
          <path d={path} fill="none" stroke={stroke} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        </svg>
      )}
    </section>
  );
});
