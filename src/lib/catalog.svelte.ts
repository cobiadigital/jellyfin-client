import { db, type CatalogRecord, type CatalogType } from './db';
import { catalogPage, type Item, type LibraryKind, type LibrarySort, type SortOrder } from './jellyfin';
import { auth } from './session.svelte';

/**
 * Local copy of the server's catalog (artists, albums, playlists, genres, songs) in IndexedDB,
 * so search and filtering are instant and work offline. Separate from cache.ts, which caches
 * individual API responses. The index belongs to one server and user; it is cleared on logout.
 */

const TYPES: CatalogType[] = ['artist', 'album', 'playlist', 'genre', 'song'];
const PAGE: Record<CatalogType, number> = { artist: 1000, genre: 1000, album: 1000, playlist: 1000, song: 2000 };
const REFRESH_MS = 60 * 60 * 1000; // at most one background refresh per hour
const FULL_MS = 7 * 24 * 60 * 60 * 1000; // a full sweep at least weekly, to notice removals
const META_KEY = 'catalog:meta';
const RESULT_CAP = 300;

interface TypeMeta {
  complete: boolean;
  cursor: number; // next StartIndex of an unfinished full sweep
}

interface Meta {
  scope: string; // server + user the index belongs to
  syncId: string; // id of the sweep in progress, or the last one finished
  lastSync: number;
  lastFull: number;
  types: Record<CatalogType, TypeMeta>;
}

export const catalog = $state<{ status: 'idle' | 'syncing' | 'offline' | 'error'; progress: string; version: number }>({
  status: 'idle',
  progress: '',
  version: 0, // bumped whenever the data changes, so views can refresh
});

const mem: Record<CatalogType, Map<string, CatalogRecord>> = { artist: new Map(), album: new Map(), playlist: new Map(), genre: new Map(), song: new Map() };
let loaded: Promise<Meta | null> | undefined;
let running = false;
let epoch = 0; // bumped by clearCatalog so a sync in flight stops writing

const scopeOf = () => (auth.session && !auth.session.demo ? `${auth.session.server}|${auth.session.userId}` : '');
const emptyMeta = (scope: string): Meta => ({
  scope,
  syncId: '',
  lastSync: 0,
  lastFull: 0,
  types: { artist: { complete: false, cursor: 0 }, album: { complete: false, cursor: 0 }, playlist: { complete: false, cursor: 0 }, genre: { complete: false, cursor: 0 }, song: { complete: false, cursor: 0 } },
});

export function normalize(text: string) {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

// ---------- storage ----------

async function readMeta(): Promise<Meta | null> {
  return ((await (await db()).get('state', META_KEY)) as Meta | undefined) ?? null;
}

async function writeMeta(meta: Meta) {
  await (await db()).put('state', JSON.parse(JSON.stringify(meta)), META_KEY);
}

/** Load the stored index into memory once (dropping it if it belongs to someone else). */
function load(): Promise<Meta | null> {
  if (!scopeOf()) return Promise.resolve(null); // signed out or demo: nothing to load, and don't cache that
  loaded ??= (async () => {
    const scope = scopeOf();
    let meta = await readMeta();
    if (meta && meta.scope !== scope) {
      await clearStore();
      meta = null;
    }
    const store = await db();
    for (const type of TYPES) {
      mem[type].clear();
      for (const r of await store.getAllFromIndex('catalog', 'byType', type)) mem[type].set(r.id, r);
    }
    return meta;
  })();
  return loaded;
}

async function clearStore() {
  const store = await db();
  await store.clear('catalog');
  await store.delete('state', META_KEY);
  for (const type of TYPES) mem[type].clear();
}

/** Drop the whole index (Settings, logout). Any sync in progress notices and stops. */
export async function clearCatalog() {
  epoch++;
  loaded = undefined;
  await clearStore();
  catalog.status = 'idle';
  catalog.progress = '';
  catalog.version++;
}

// ---------- building ----------

function toRecord(type: CatalogType, it: Item, syncId: string): CatalogRecord {
  const name = it.Name ?? '';
  const artist = type === 'song' ? (it.Artists?.[0] ?? it.AlbumArtist) : type === 'album' ? it.AlbumArtist : undefined;
  const r: CatalogRecord = { id: it.Id, type, name, n: normalize(name), q: '', s: syncId };
  if (artist) r.artist = artist;
  if (type === 'song') {
    if (it.ArtistItems?.[0]) r.artistId = it.ArtistItems[0].Id;
    if (it.Album) r.album = it.Album;
    if (it.AlbumId) r.albumId = it.AlbumId;
    if (it.RunTimeTicks) r.dur = it.RunTimeTicks;
    if (it.IndexNumber != null) r.track = it.IndexNumber;
    if (it.ParentIndexNumber != null) r.disc = it.ParentIndexNumber;
    if (it.AlbumPrimaryImageTag) r.img = it.AlbumPrimaryImageTag;
  } else {
    if (it.ImageTags?.Primary) r.img = it.ImageTags.Primary;
    if (it.ChildCount) r.count = it.ChildCount;
    if (it.DateCreated) r.added = it.DateCreated;
  }
  if (it.ProductionYear) r.year = it.ProductionYear;
  r.q = normalize([name, r.artist, r.album].filter(Boolean).join(' '));
  return r;
}

async function putPage(records: CatalogRecord[]) {
  const tx = (await db()).transaction('catalog', 'readwrite');
  await Promise.all([...records.map((r) => tx.store.put(r)), tx.done]);
  for (const r of records) mem[r.type].set(r.id, r);
}

async function dropStale(type: CatalogType, syncId: string) {
  const stale = [...mem[type].values()].filter((r) => r.s !== syncId).map((r) => r.id);
  for (let i = 0; i < stale.length; i += 500) {
    const tx = (await db()).transaction('catalog', 'readwrite');
    await Promise.all([...stale.slice(i, i + 500).map((id) => tx.store.delete(id)), tx.done]);
  }
  for (const id of stale) mem[type].delete(id);
}

const yieldToUi = () => new Promise<void>((r) => setTimeout(r, 0));

class Stop extends Error {}

/** Fetch every item of a type in pages, resuming from the saved cursor. */
async function sweep(type: CatalogType, meta: Meta, guard: () => void) {
  const t = meta.types[type];
  t.complete = false;
  for (;;) {
    guard();
    const page = await catalogPage(type, t.cursor, PAGE[type]);
    guard();
    if (page.Items.length) await putPage(page.Items.map((it) => toRecord(type, it, meta.syncId)));
    t.cursor += page.Items.length;
    catalog.progress = `${label(type)} ${Math.min(t.cursor, page.TotalRecordCount).toLocaleString()} of ${page.TotalRecordCount.toLocaleString()}`;
    catalog.version++;
    const done = !page.Items.length || t.cursor >= page.TotalRecordCount;
    if (done) await dropStale(type, meta.syncId);
    if (done) {
      t.complete = true;
      t.cursor = 0;
    }
    await writeMeta(meta);
    if (done) return;
    await yieldToUi();
  }
}

/** Albums and songs: pull only what changed since the last sync, falling back to a sweep. */
async function refreshType(type: CatalogType, meta: Meta, guard: () => void) {
  const known = mem[type].size;
  const since = new Date(meta.lastSync - 60_000).toISOString();
  if (type === 'album' || type === 'song') {
    const changed = await catalogPage(type, 0, PAGE[type], since);
    guard();
    if (changed.TotalRecordCount <= PAGE[type] && changed.TotalRecordCount <= Math.max(50, known * 0.2)) {
      if (changed.Items.length) await putPage(changed.Items.map((it) => toRecord(type, it, meta.syncId)));
      const total = (await catalogPage(type, 0, 0)).TotalRecordCount;
      guard();
      if (total === mem[type].size) return;
    }
  }
  meta.types[type].cursor = 0;
  await sweep(type, meta, guard);
}

const label = (t: CatalogType) => ({ artist: 'Artists', album: 'Albums', playlist: 'Playlists', genre: 'Genres', song: 'Songs' })[t];

/**
 * Build or refresh the index. `force` ignores the refresh interval (Sync now).
 * Safe to call any time: it does nothing when offline, in demo mode, or while already running.
 */
export async function syncCatalog(force = false) {
  const scope = scopeOf();
  if (!scope || running) return;
  if (!navigator.onLine) {
    catalog.status = 'offline';
    return;
  }
  running = true;
  const mine = epoch;
  const guard = () => {
    if (epoch !== mine || scopeOf() !== scope) throw new Stop();
    if (!navigator.onLine) throw new Error('Offline');
  };
  try {
    let meta = (await load()) ?? emptyMeta(scope);
    guard();
    const now = Date.now();
    const built = TYPES.every((t) => meta.types[t].complete);
    if (built && !force && now - meta.lastSync < REFRESH_MS) return;
    catalog.status = 'syncing';
    // A first build, a forced sync and a weekly pass all re-read everything, which also lets
    // items removed on the server drop out. Otherwise only look for changes.
    const full = !built || force || now - meta.lastFull > FULL_MS;
    if (built || !meta.syncId) meta.syncId = crypto.randomUUID(); // an unfinished build resumes under its old id
    if (built && full) for (const t of TYPES) meta.types[t] = { complete: false, cursor: 0 };
    for (const type of ['artist', 'genre', 'playlist', 'album', 'song'] as const) {
      if (!built && meta.types[type].complete) continue; // finished before an earlier interruption
      if (built && !full && (type === 'album' || type === 'song')) await refreshType(type, meta, guard);
      else await sweep(type, meta, guard);
    }
    meta.lastSync = now;
    if (full) meta.lastFull = now;
    guard();
    await writeMeta(meta);
    catalog.status = 'idle';
    catalog.progress = '';
  } catch (err) {
    catalog.progress = '';
    if (err instanceof Stop) catalog.status = 'idle';
    else catalog.status = navigator.onLine ? 'error' : 'offline';
  } finally {
    running = false;
    catalog.version++;
  }
}

let watching = false;

/** Sync now, and again when the connection returns or the app is reopened (rate limited). */
export function startCatalogSync() {
  syncCatalog();
  if (watching) return;
  watching = true;
  const again = () => syncCatalog();
  addEventListener('online', again);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && again());
}

// ---------- querying ----------

const KIND_TYPE: Record<LibraryKind, CatalogType> = { albums: 'album', artists: 'artist', playlists: 'playlist', genres: 'genre' };

function toItem(r: CatalogRecord): Item {
  const item: Item = { Id: r.id, Name: r.name, Type: { artist: 'MusicArtist', album: 'MusicAlbum', playlist: 'Playlist', genre: 'MusicGenre', song: 'Audio' }[r.type] };
  if (r.year) item.ProductionYear = r.year;
  if (r.count) item.ChildCount = r.count;
  if (r.added) item.DateCreated = r.added;
  if (r.type === 'song') {
    if (r.artist) item.Artists = [r.artist];
    item.AlbumArtist = r.artist;
    item.Album = r.album;
    item.AlbumId = r.albumId;
    item.RunTimeTicks = r.dur;
    item.IndexNumber = r.track;
    item.ParentIndexNumber = r.disc;
    if (r.artistId && r.artist) item.ArtistItems = [{ Id: r.artistId, Name: r.artist }];
    if (r.img) item.AlbumPrimaryImageTag = r.img;
  } else {
    item.AlbumArtist = r.artist;
    if (r.img) item.ImageTags = { Primary: r.img };
  }
  return item;
}

function matcher(term: string) {
  const words = normalize(term).split(/\s+/).filter(Boolean);
  return {
    words,
    test: (r: CatalogRecord) => words.every((w) => r.q.includes(w)),
    // Names that start with, then contain a word starting with, the whole term rank first.
    rank: (r: CatalogRecord) => {
      const full = words.join(' ');
      return r.n.startsWith(full) ? 0 : r.n.includes(' ' + full) ? 1 : 2;
    },
  };
}

function find(type: CatalogType, term: string, cap: number): CatalogRecord[] {
  const m = matcher(term);
  if (!m.words.length) return [];
  const hits: [number, CatalogRecord][] = [];
  for (const r of mem[type].values()) if (m.test(r)) hits.push([m.rank(r), r]);
  hits.sort((a, b) => a[0] - b[0] || a[1].n.localeCompare(b[1].n));
  return hits.slice(0, cap).map((h) => h[1]);
}

/** True once every type has been fully indexed for the signed-in server and user. */
export async function catalogComplete() {
  const meta = await load();
  return !!meta && TYPES.every((t) => meta.types[t].complete);
}

/** Results from the local index, or null when nothing has been indexed yet. */
export async function searchCatalog(term: string) {
  await load();
  if (!TYPES.some((t) => mem[t].size)) return null;
  const pick = (t: CatalogType, cap: number) => find(t, term, cap).map(toItem);
  return { artists: pick('artist', 20), albums: pick('album', 20), tracks: pick('song', 40), playlists: pick('playlist', 20) };
}

/** A library tab filtered from the local index, or null when that tab isn't indexed enough to use. */
export async function filterCatalog(kind: LibraryKind, term: string, sort: LibrarySort, order: SortOrder, requireComplete: boolean) {
  const meta = await load();
  const type = KIND_TYPE[kind];
  if (!meta || !mem[type].size || (requireComplete && !meta.types[type].complete)) return null;
  const key = (r: CatalogRecord) => (sort === 'artist' ? `${normalize(r.artist ?? '')}\u0000${r.n}` : sort === 'released' ? String(r.year ?? '').padStart(4, '0') + r.n : sort === 'added' ? (r.added ?? '') : r.n);
  const dir = order === 'Descending' ? -1 : 1;
  const hits = find(type, term, RESULT_CAP).sort((a, b) => dir * key(a).localeCompare(key(b)));
  return { Items: hits.map(toItem), TotalRecordCount: hits.length, StartIndex: 0 };
}

// ---------- Settings ----------

export interface CatalogStats {
  lastSync: number;
  counts: Record<CatalogType, number>;
  bytes: number;
  complete: boolean;
}

export async function catalogStats(): Promise<CatalogStats> {
  const meta = await load();
  const counts = {} as Record<CatalogType, number>;
  let size = 0;
  for (const t of TYPES) {
    counts[t] = mem[t].size;
    // Sample the first few records and scale up, rather than serializing a huge library.
    let n = 0;
    let sample = 0;
    for (const r of mem[t].values()) {
      sample += JSON.stringify(r).length;
      if (++n === 200) break;
    }
    size += n ? (sample / n) * mem[t].size : 0;
  }
  return { lastSync: meta?.lastSync ?? 0, counts, bytes: Math.round(size), complete: !!meta && TYPES.every((t) => meta.types[t].complete) };
}
