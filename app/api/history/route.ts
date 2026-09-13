// GET /api/history — public closed-trade history from Vercel Blob (bot/history.json).

import { HISTORY_PATH, readJsonBlob } from '@/lib/blob';

export const dynamic = 'force-dynamic';

const EMPTY = {
  updated_at: null,
  closed_trades: [],
  stats: { wins: 0, losses: 0, win_rate: 0, total_closed: 0, net_pnl: 0 },
  error: 'no data yet',
};

export async function GET() {
  try {
    const data = await readJsonBlob(HISTORY_PATH, EMPTY);
    return Response.json(data, {
      headers: {
        'cache-control': 's-maxage=8, stale-while-revalidate=30',
      },
    });
  } catch {
    return Response.json(EMPTY);
  }
}
