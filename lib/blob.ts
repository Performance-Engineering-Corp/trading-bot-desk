import { list, put } from '@vercel/blob';

export const LATEST_PATH = 'bot/latest.json';
export const HISTORY_PATH = 'bot/history.json';

export async function readJsonBlob(
  pathname: string,
  fallback: unknown
): Promise<unknown> {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return fallback;
  try {
    const { blobs } = await list({ prefix: pathname, token, limit: 1 });
    if (!blobs.length) return fallback;
    const r = await fetch(blobs[0].url, { cache: 'no-store' });
    if (!r.ok) return fallback;
    return await r.json();
  } catch {
    return fallback;
  }
}

export async function writeJsonBlob(pathname: string, data: unknown) {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    throw new Error('BLOB_READ_WRITE_TOKEN not configured');
  }
  const body = JSON.stringify(data);
  const blob = await put(pathname, body, {
    access: 'public',
    token,
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true,
  });
  return { url: blob.url, bytes: body.length };
}
