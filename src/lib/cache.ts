import { db } from './db';

const TIMEOUT_MS = 8000;

/**
 * Network-first JSON fetch that writes every successful response to IndexedDB and
 * falls back to the stored copy when the network fails or the device is offline.
 */
export async function cachedJson<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const store = await db();
  if (!navigator.onLine) {
    const hit = await store.get('api', key);
    if (hit) return hit.data as T;
  }
  try {
    const data = await withTimeout(fetcher(), TIMEOUT_MS);
    store.put('api', { key, data, savedAt: Date.now() }).catch(() => {});
    return data;
  } catch (err) {
    const hit = await store.get('api', key);
    if (hit) return hit.data as T;
    throw err;
  }
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('Request timed out')), ms);
    p.then(
      (v) => (clearTimeout(t), resolve(v)),
      (e) => (clearTimeout(t), reject(e)),
    );
  });
}

export async function clearApiCache() {
  await (await db()).clear('api');
}
