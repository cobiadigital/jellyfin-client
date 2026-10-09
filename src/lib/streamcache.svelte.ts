import { db } from './db';
import { downloadUrl, type Item } from './jellyfin';
import { isDemo, settings } from './session.svelte';

/**
 * Opportunistic cache for streamed tracks, so songs you have already listened to
 * play again offline. Separate from explicit downloads: bytes live in Cache Storage
 * ("stream-v1"), metadata in IndexedDB "streamcache", and the least recently played
 * tracks are evicted to stay under the limit in Settings.
 */

const CACHE = 'stream-v1';
const key = (trackId: string) => `/__stream-cache/${trackId}`;

export const streamCache = $state({
  tracks: new Set<string>(),
  bytes: 0,
});

const inFlight = new Set<string>();
const limitBytes = () => settings.cacheLimitMB * 1024 * 1024;

export async function initStreamCache() {
  await refresh();
  if (settings.cacheLimitMB > 0) await trim();
}

async function refresh() {
  const rows = await (await db()).getAll('streamcache');
  streamCache.tracks = new Set(rows.map((r) => r.id));
  streamCache.bytes = rows.reduce((n, r) => n + r.bytes, 0);
}

/** Cached tracks, most recently played first. */
export async function listCached() {
  return (await (await db()).getAll('streamcache')).sort((a, b) => b.lastUsed - a.lastUsed);
}

export async function cachedAudioBlob(trackId: string): Promise<Blob | null> {
  if (!streamCache.tracks.has(trackId)) return null;
  const res = await (await caches.open(CACHE)).match(key(trackId));
  if (!res) return null;
  const d = await db();
  const row = await d.get('streamcache', trackId);
  if (row) d.put('streamcache', { ...row, lastUsed: Date.now() }).catch(() => {});
  return res.blob();
}

export async function cachedAudioUrl(trackId: string): Promise<string | null> {
  const blob = await cachedAudioBlob(trackId);
  return blob && URL.createObjectURL(blob);
}

/** Fetch a copy of a track that is being streamed. Failures are silent: this is best effort. */
export async function cacheStreamed(track: Item) {
  if (isDemo() || settings.cacheLimitMB <= 0 || !navigator.onLine) return;
  if (streamCache.tracks.has(track.Id) || inFlight.has(track.Id)) return;
  inFlight.add(track.Id);
  try {
    // "Original" streams may be direct-played formats this browser can't replay from a blob,
    // so keep a 320 kbps AAC copy in that case.
    const q = settings.streamQuality;
    const res = await fetch(downloadUrl(track.Id, 'transcoded', q === 'original' ? 320 : q));
    if (!res.ok) return;
    const contentType = res.headers.get('Content-Type') ?? 'audio/aac';
    const blob = await res.blob();
    // Re-check: the limit may have been changed while this was downloading.
    if (blob.size === 0 || blob.size > limitBytes() / 2) return;

    await (await caches.open(CACHE)).put(key(track.Id), new Response(blob, { headers: { 'Content-Type': contentType, 'Content-Length': String(blob.size) } }));
    await (await db()).put('streamcache', { id: track.Id, track: JSON.parse(JSON.stringify(track)), bytes: blob.size, lastUsed: Date.now() });
    await trim(track.Id);
    await refresh();
  } catch {
    /* offline or server error: try again next time */
  } finally {
    inFlight.delete(track.Id);
  }
}

/** Evict least recently played tracks until the cache fits the limit. */
async function trim(keep?: string) {
  const d = await db();
  const rows = (await d.getAll('streamcache')).sort((a, b) => a.lastUsed - b.lastUsed);
  let total = rows.reduce((n, r) => n + r.bytes, 0);
  const cache = await caches.open(CACHE);
  const limit = limitBytes();
  for (const r of rows) {
    if (total <= limit) break;
    if (r.id === keep) continue;
    await cache.delete(key(r.id));
    await d.delete('streamcache', r.id);
    total -= r.bytes;
  }
  await refresh();
}

/** Apply a changed limit from Settings. */
export async function applyCacheLimit() {
  if (settings.cacheLimitMB <= 0) await clearStreamCache();
  else await trim();
}

export async function dropCached(trackId: string) {
  if (!streamCache.tracks.has(trackId)) return;
  await (await caches.open(CACHE)).delete(key(trackId));
  await (await db()).delete('streamcache', trackId);
  await refresh();
}

export async function clearStreamCache() {
  await caches.delete(CACHE);
  await (await db()).clear('streamcache');
  await refresh();
}
