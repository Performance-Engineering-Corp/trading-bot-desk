import { HISTORY_PATH, LATEST_PATH, readJsonBlob } from './blob';
import { EMPTY_HISTORY, EMPTY_SNAPSHOT, normalizeHistory, normalizeSnapshot } from './defaults';
import type { HistoryPayload, Snapshot } from './types';

/** Server-only Blob reads used to SSR the desk without an HTTP self-fetch. */
export async function getLatestSnapshot(): Promise<Snapshot> {
  const data = await readJsonBlob(LATEST_PATH, EMPTY_SNAPSHOT);
  return normalizeSnapshot(data);
}

export async function getHistory(): Promise<HistoryPayload> {
  const data = await readJsonBlob(HISTORY_PATH, EMPTY_HISTORY);
  return normalizeHistory(data);
}
