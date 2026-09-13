// Snapshot ingest + serve.
//
// GET  /api/snapshot — public latest desk snapshot (from Vercel Blob).
// POST /api/snapshot — bot pushes sanitized JSON here; auth via x-bot-ingest-secret.
//                      Writes bot/latest.json; merges closed_trades/history into bot/history.json.

import {
  HISTORY_PATH,
  LATEST_PATH,
  readJsonBlob,
  writeJsonBlob,
} from '@/lib/blob';
import {
  computeStats,
  extractClosedTrades,
  mergeClosedTrades,
  sanitizeSnapshot,
} from '@/lib/sanitize';

export const dynamic = 'force-dynamic';

const EMPTY = {
  generated_at: null,
  live_trading: false,
  crypto: { positions: [], realized: 0, unrealized: 0, day_pnl: 0, open_risk: 0, open_risk_cap: 20000, day_loss_cap: 3000 },
  stocks: { positions: [], realized: 0, unrealized: 0, day_pnl: 0, open_risk: 0, open_risk_cap: 10000, day_loss_cap: 1500, idle: true },
  combined: { day_pnl: 0, open_risk: 0, open_risk_cap: 25000, day_loss_cap: 3000, day_halt_remaining: 3000 },
  closed_trades: [],
  recent_events: [],
  tape: [],
  stats: { wins: 0, losses: 0, win_rate: 0, total_closed: 0, net_pnl: 0 },
  error: 'no data yet',
};

export async function GET() {
  try {
    const data = await readJsonBlob(LATEST_PATH, EMPTY);
    return Response.json(data, {
      headers: {
        'cache-control': 's-maxage=4, stale-while-revalidate=12',
      },
    });
  } catch {
    return Response.json(EMPTY);
  }
}

export async function POST(req: Request) {
  const secret = process.env.BOT_INGEST_SECRET;
  if (!secret || req.headers.get('x-bot-ingest-secret') !== secret) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return Response.json({ error: 'BLOB_READ_WRITE_TOKEN not configured' }, { status: 500 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const snapshot = sanitizeSnapshot(raw);
  if (!snapshot.generated_at) {
    snapshot.generated_at = new Date().toISOString();
  }

  const incomingTrades = extractClosedTrades(snapshot);
  // Also accept closed_trades at root after sanitize
  if (Array.isArray(snapshot.closed_trades)) {
    // already extracted; keep sanitized list on snapshot (cap for latest)
    snapshot.closed_trades = (snapshot.closed_trades as unknown[]).slice(0, 50);
  }

  let historyUrl: string | undefined;
  let historyCount = 0;
  if (incomingTrades.length > 0) {
    const existing = (await readJsonBlob(HISTORY_PATH, {
      updated_at: null,
      closed_trades: [],
    })) as { closed_trades?: unknown[] };
    const merged = mergeClosedTrades(existing.closed_trades || [], incomingTrades);
    const stats = computeStats(merged);
    const history = {
      updated_at: new Date().toISOString(),
      closed_trades: merged,
      stats,
    };
    const written = await writeJsonBlob(HISTORY_PATH, history);
    historyUrl = written.url;
    historyCount = merged.length;
    // Attach rolling stats onto latest snapshot for the desk UI
    snapshot.stats = stats;
    if (!Array.isArray(snapshot.closed_trades) || !(snapshot.closed_trades as unknown[]).length) {
      snapshot.closed_trades = merged.slice(0, 40);
    }
  }

  // Prefer tape alias from recent_events
  if (!snapshot.tape && Array.isArray(snapshot.recent_events)) {
    snapshot.tape = snapshot.recent_events;
  }

  const latest = await writeJsonBlob(LATEST_PATH, snapshot);
  return Response.json({
    ok: true,
    url: latest.url,
    bytes: latest.bytes,
    history_url: historyUrl,
    history_trades: historyCount,
  });
}
