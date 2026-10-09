import { db, type CollectionRecord, type DownloadRecord } from './db';
import { downloadUrl, type Item } from './jellyfin';
import { isDemo, settings } from './session.svelte';
import { showToast } from './toast.svelte';

/**
 * Offline storage for audio.
 *  - Bytes: Cache Storage ("audio-v1"), keyed by a synthetic URL per track id.
 *  - Metadata: IndexedDB "downloads" (per track) and "collections" (per album/playlist).
 * Cache Storage is used rather than localStorage (5MB, strings only) and survives
 * as long as the origin's storage does; we ask for persistent storage on first use.
 */

const AUDIO_CACHE = 'audio-v1';
const key = (trackId: string) => `/__offline-audio/${trackId}`;

export interface Job {
  collectionId: string;
  name: string;
  done: number;
  total: number;
  currentBytes: number;
  error?: string;
}

export const downloads = $state({
  /** track ids that are fully stored */
  tracks: new Set<string>(),
  /** album/playlist ids that have been downloaded */
  collections: new Set<string>(),
  jobs: [] as Job[],
  usage: 0,
  quota: 0,
  persisted: false,
});

export async function initDownloads() {
  const d = await db();
  downloads.tracks = new Set(await d.getAllKeys('downloads'));
  downloads.collections = new Set(await d.getAllKeys('collections'));
  await refreshUsage();
}

export async function refreshUsage() {
  if (!navigator.storage?.estimate) return;
  const est = await navigator.storage.estimate();
  downloads.usage = est.usage ?? 0;
  downloads.quota = est.quota ?? 0;
  downloads.persisted = (await navigator.storage.persisted?.()) ?? false;
}

export async function requestPersistence() {
  if (navigator.storage?.persist) downloads.persisted = await navigator.storage.persist();
}

/** Object URL for a downloaded track, or null. Caller must revoke it. */
export async function offlineAudioBlob(trackId: string): Promise<Blob | null> {
  if (!downloads.tracks.has(trackId)) return null;
  const res = await (await caches.open(AUDIO_CACHE)).match(key(trackId));
  return res ? res.blob() : null;
}

export async function offlineAudioUrl(trackId: string): Promise<string | null> {
  const blob = await offlineAudioBlob(trackId);
  return blob && URL.createObjectURL(blob);
}

let running: Promise<void> = Promise.resolve();

/** Queue a whole album or playlist for download. Jobs run one at a time. */
export function downloadCollection(collection: Item, tracks: Item[]) {
  if (isDemo()) return showToast('Downloads are turned off in demo mode');
  if (downloads.jobs.some((j) => j.collectionId === collection.Id)) return;
  const job: Job = { collectionId: collection.Id, name: collection.Name, done: 0, total: tracks.length, currentBytes: 0 };
  downloads.jobs.push(job);
  running = running.then(() => runJob(collection, tracks));
}

async function runJob(collection: Item, tracks: Item[]) {
  const job = downloads.jobs.find((j) => j.collectionId === collection.Id)!;
  if (!downloads.persisted) await requestPersistence();
  const d = await db();
  await d.put('collections', {
    id: collection.Id,
    item: plain(collection),
    trackIds: tracks.map((t) => t.Id),
    addedAt: Date.now(),
  } satisfies CollectionRecord);
  downloads.collections.add(collection.Id);
  downloads.collections = new Set(downloads.collections);

  const cache = await caches.open(AUDIO_CACHE);
  const { downloadFormat: format, downloadBitrate: bitrate } = settings;
  for (const track of tracks) {
    try {
      if (!downloads.tracks.has(track.Id)) await downloadTrack(cache, track, collection.Id, format, bitrate, job);
      job.done++;
    } catch (err) {
      job.error = `${track.Name}: ${(err as Error).message}`;
      break;
    }
  }
  if (!job.error) downloads.jobs = downloads.jobs.filter((j) => j !== job);
  await refreshUsage();
}

async function downloadTrack(cache: Cache, track: Item, parentId: string, format: DownloadRecord['format'], bitrate: number, job: Job) {
  const res = await fetch(downloadUrl(track.Id, format, bitrate));
  if (!res.ok || !res.body) throw new Error(`server returned ${res.status}`);
  const contentType = res.headers.get('Content-Type') ?? 'audio/aac';

  // Read the stream ourselves so the UI can show progress.
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  job.currentBytes = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    job.currentBytes += value.byteLength;
  }
  const blob = new Blob(chunks as BlobPart[], { type: contentType });
  if (blob.size === 0) throw new Error('empty response');

  await cache.put(key(track.Id), new Response(blob, { headers: { 'Content-Type': contentType, 'Content-Length': String(blob.size) } }));
  await (await db()).put('downloads', {
    id: track.Id,
    track: plain(track),
    parentId,
    format,
    bitrate: format === 'transcoded' ? bitrate : undefined,
    bytes: blob.size,
    contentType,
    addedAt: Date.now(),
  });
  downloads.tracks.add(track.Id);
  downloads.tracks = new Set(downloads.tracks);
}

export function dismissJob(collectionId: string) {
  downloads.jobs = downloads.jobs.filter((j) => j.collectionId !== collectionId);
}

/** Remove a downloaded album/playlist. Tracks also used by another download are kept. */
export async function removeCollection(collectionId: string) {
  const d = await db();
  const col = await d.get('collections', collectionId);
  await d.delete('collections', collectionId);
  const others = await d.getAll('collections');
  const stillNeeded = new Set(others.flatMap((c) => c.trackIds));
  const cache = await caches.open(AUDIO_CACHE);
  for (const id of col?.trackIds ?? []) {
    if (stillNeeded.has(id)) continue;
    await cache.delete(key(id));
    await d.delete('downloads', id);
    downloads.tracks.delete(id);
  }
  downloads.tracks = new Set(downloads.tracks);
  downloads.collections.delete(collectionId);
  downloads.collections = new Set(downloads.collections);
  await refreshUsage();
}

export async function listCollections() {
  const d = await db();
  const cols = await d.getAll('collections');
  const all = await d.getAll('downloads');
  const bytes = new Map(all.map((r) => [r.id, r.bytes]));
  return cols
    .sort((a, b) => b.addedAt - a.addedAt)
    .map((c) => ({ ...c, bytes: c.trackIds.reduce((n, id) => n + (bytes.get(id) ?? 0), 0) }));
}

export async function getCollection(id: string) {
  const d = await db();
  const col = await d.get('collections', id);
  if (!col) return null;
  const tracks = (await Promise.all(col.trackIds.map((t) => d.get('downloads', t)))).filter((r) => !!r).map((r) => r.track);
  return { item: col.item, tracks };
}

export async function removeAll() {
  await caches.delete(AUDIO_CACHE);
  const d = await db();
  await d.clear('downloads');
  await d.clear('collections');
  downloads.tracks = new Set();
  downloads.collections = new Set();
  await refreshUsage();
}

function plain<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}
