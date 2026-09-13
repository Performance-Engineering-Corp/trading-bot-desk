// Snapshot ingest + serve.
//
// GET  /api/snapshot — public latest desk snapshot (from Vercel Blob).
// POST /api/snapshot — bot pushes sanitized JSON here; auth via x-bot-ingest-secret.
//                      Writes bot/latest.json; merges closed_trades/history into bot/history.json.

import { HISTORY_PATH, LATEST_PATH, readJsonBlob, writeJsonBlob } from '@/lib/blob';
import { EMPTY_SNAPSHOT } from '@/lib/defaults';
import {
  computeStats,
  extractClosedTrades,
  mergeClosedTrades,
  sanitizeSnapshot,
} from '@/lib/sanitize';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const data = await readJsonBlob(LATEST_PATH, EMPTY_SNAPSHOT);
    return Response.json(data, {
      headers: {
        'cache-control': 's-maxage=4, stale-while-revalidate=12',
      },
    });
  } catch {
    return Response.json(EMPTY_SNAPSHOT);
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
  if (Array.isArray(snapshot.closed_trades)) {
    snapshot.closed_trades = (snapshot.closed_trades as unknown[]).slice(0, 50);
  }

  let historyUrl: string | undefined;
  let historyCount = 0;
  if (incomingTrades.length > 0) {
    const existing = await readJsonBlob(HISTORY_PATH, {
      updated_at: null as string | null,
      closed_trades: [] as unknown[],
    });
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
    snapshot.stats = stats;
    if (!Array.isArray(snapshot.closed_trades) || !(snapshot.closed_trades as unknown[]).length) {
      snapshot.closed_trades = merged.slice(0, 40);
    }
  }

  if (!snapshot.tape && Array.isArray(snapshot.recent_events)) {
    snapshot.tape = snapshot.recent_events;
  }

  try {
    const latest = await writeJsonBlob(LATEST_PATH, snapshot);
    return Response.json({
      ok: true,
      url: latest.url,
      bytes: latest.bytes,
      history_url: historyUrl,
      history_trades: historyCount,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'write failed';
    return Response.json({ error: message }, { status: 500 });
  }
}
