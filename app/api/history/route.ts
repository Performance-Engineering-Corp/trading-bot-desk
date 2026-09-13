// GET /api/history — public closed-trade history from Vercel Blob (bot/history.json).

import { HISTORY_PATH, readJsonBlob } from '@/lib/blob';
import { EMPTY_HISTORY } from '@/lib/defaults';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const data = await readJsonBlob(HISTORY_PATH, EMPTY_HISTORY);
    return Response.json(data, {
      headers: {
        'cache-control': 's-maxage=8, stale-while-revalidate=30',
      },
    });
  } catch {
    return Response.json(EMPTY_HISTORY);
  }
}
