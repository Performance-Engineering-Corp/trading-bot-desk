/**
 * Sanitize rules for public blob payloads:
 * - Strip order_id, client_order_id, and any *order_id* keys
 * - Strip API keys / secrets / tokens / authorization headers
 * - Strip alpha_signals / picks (public desk shows real trades only)
 * - Keep product, prices, sizes, pnl, timestamps, reasons
 */

const FORBIDDEN_KEY_RE =
  /^(order_id|client_order_id|.*_order_id|api[_-]?key|api[_-]?secret|secret|token|password|authorization|auth|private[_-]?key|access[_-]?key|signing[_-]?key|passphrase|credential)$/i;

const FORBIDDEN_TOP_LEVEL = new Set([
  'alpha_signals',
  'alpha',
  'picks',
  'picks_long',
  'signals',
  'external_signals',
]);

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function sanitizeValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sanitizeValue);
  }
  if (!isPlainObject(value)) {
    return value;
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    if (FORBIDDEN_KEY_RE.test(k)) continue;
    if (FORBIDDEN_TOP_LEVEL.has(k)) continue;
    out[k] = sanitizeValue(v);
  }
  return out;
}

export function sanitizeSnapshot(raw: unknown): Record<string, unknown> {
  const cleaned = sanitizeValue(raw);
  if (!isPlainObject(cleaned)) {
    return { generated_at: new Date().toISOString(), error: 'invalid snapshot body' };
  }
  // Ensure we never leak alpha picks even if nested oddly
  delete cleaned.alpha_signals;
  delete cleaned.alpha;
  delete cleaned.picks;
  return cleaned;
}

export function extractClosedTrades(body: Record<string, unknown>): unknown[] {
  const fromClosed = body.closed_trades;
  const fromHistory = body.history;
  const trades: unknown[] = [];
  if (Array.isArray(fromClosed)) trades.push(...fromClosed);
  if (Array.isArray(fromHistory)) trades.push(...fromHistory);
  if (isPlainObject(fromHistory) && Array.isArray(fromHistory.closed_trades)) {
    trades.push(...fromHistory.closed_trades);
  }
  return trades.map(sanitizeValue);
}

export function tradeKey(t: Record<string, unknown>): string {
  if (typeof t.id === 'string' && t.id) return t.id;
  const pid = String(t.product_id || t.ticker || '');
  const closed = String(t.closed_at || '');
  const entry = String(t.entry ?? '');
  const exit = String(t.exit ?? '');
  return `${pid}|${closed}|${entry}|${exit}`;
}

export function mergeClosedTrades(
  existing: unknown[],
  incoming: unknown[],
  max = 500
): Record<string, unknown>[] {
  const map = new Map<string, Record<string, unknown>>();
  for (const item of [...existing, ...incoming]) {
    if (!isPlainObject(item)) continue;
    const cleaned = sanitizeValue(item) as Record<string, unknown>;
    map.set(tradeKey(cleaned), cleaned);
  }
  const merged = Array.from(map.values());
  merged.sort((a, b) => String(b.closed_at || '').localeCompare(String(a.closed_at || '')));
  return merged.slice(0, max);
}

export function computeStats(trades: Record<string, unknown>[]): {
  wins: number;
  losses: number;
  scratch: number;
  win_rate: number;
  avg_win: number;
  avg_loss: number;
  profit_factor: number | null;
  total_closed: number;
  net_pnl: number;
} {
  let wins = 0;
  let losses = 0;
  let scratch = 0;
  let winSum = 0;
  let lossSum = 0;
  let net = 0;
  for (const t of trades) {
    const pnl = Number(t.pnl ?? 0);
    if (Number.isNaN(pnl)) continue;
    net += pnl;
    if (pnl > 1e-8) {
      wins += 1;
      winSum += pnl;
    } else if (pnl < -1e-8) {
      losses += 1;
      lossSum += Math.abs(pnl);
    } else {
      scratch += 1;
    }
  }
  const decided = wins + losses;
  return {
    wins,
    losses,
    scratch,
    win_rate: decided > 0 ? wins / decided : 0,
    avg_win: wins > 0 ? winSum / wins : 0,
    avg_loss: losses > 0 ? lossSum / losses : 0,
    profit_factor: lossSum > 0 ? winSum / lossSum : wins > 0 ? null : 0,
    total_closed: trades.length,
    net_pnl: Math.round(net * 10000) / 10000,
  };
}
