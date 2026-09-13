import { get, put } from '@vercel/blob';

export const LATEST_PATH = 'bot/latest.json';
export const HISTORY_PATH = 'bot/history.json';

export async function readJsonBlob<T>(pathname: string, fallback: T): Promise<T> {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return fallback;
  try {
    const result = await get(pathname, {
      access: 'private',
      token,
      useCache: false,
    });
    if (!result || !result.stream) return fallback;
    const text = await new Response(result.stream).text();
    if (!text) return fallback;
    return JSON.parse(text) as T;
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
    access: 'private',
    token,
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true,
  });
  return { url: blob.url, bytes: body.length };
}
