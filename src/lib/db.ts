import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Item } from './jellyfin';

/**
 * IndexedDB layout. Audio bytes live in Cache Storage ("audio-v1"); IndexedDB holds
 * the metadata that describes them, plus cached API responses for offline browsing.
 */
export interface DownloadRecord {
  id: string; // track id
  track: Item;
  parentId: string; // album or playlist the download was requested from
  format: 'original' | 'transcoded';
  bitrate?: number;
  bytes: number;
  contentType: string;
  addedAt: number;
}

export interface StreamCacheRecord {
  id: string; // track id
  track: Item;
  bytes: number;
  lastUsed: number;
}

export interface CollectionRecord {
  id: string; // album or playlist id
  item: Item;
  trackIds: string[];
  addedAt: number;
}

export type CatalogType = 'artist' | 'album' | 'playlist' | 'genre' | 'song';

/** One row of the local content index (see catalog.svelte.ts). Kept deliberately light. */
export interface CatalogRecord {
  id: string;
  type: CatalogType;
  name: string;
  n: string; // normalized name, used for sorting and prefix ranking
  q: string; // normalized search text (name plus artist, plus album for songs)
  artist?: string;
  artistId?: string;
  album?: string;
  albumId?: string;
  year?: number;
  count?: number; // tracks in an album or playlist
  dur?: number; // RunTimeTicks
  track?: number;
  disc?: number;
  added?: string;
  img?: string; // primary image tag (the album's, for songs)
  s: string; // id of the sync that last saw this record, used to drop removed items
}

interface Schema extends DBSchema {
  api: { key: string; value: { key: string; data: unknown; savedAt: number } };
  downloads: { key: string; value: DownloadRecord; indexes: { byParent: string } };
  collections: { key: string; value: CollectionRecord };
  state: { key: string; value: unknown };
  streamcache: { key: string; value: StreamCacheRecord };
  catalog: { key: string; value: CatalogRecord; indexes: { byType: string } };
}

let dbPromise: Promise<IDBPDatabase<Schema>> | undefined;

export function db() {
  dbPromise ??= openDB<Schema>('jellyfin-client', 3, {
    upgrade(d, oldVersion) {
      if (oldVersion < 1) {
        d.createObjectStore('api', { keyPath: 'key' });
        d.createObjectStore('downloads', { keyPath: 'id' }).createIndex('byParent', 'parentId');
        d.createObjectStore('collections', { keyPath: 'id' });
        d.createObjectStore('state');
      }
      if (oldVersion < 2) d.createObjectStore('catalog', { keyPath: 'id' }).createIndex('byType', 'type');
      if (oldVersion < 3) d.createObjectStore('streamcache', { keyPath: 'id' });
    },
  });
  return dbPromise;
}

export async function getState<T>(key: string): Promise<T | undefined> {
  return (await (await db()).get('state', key)) as T | undefined;
}

export async function setState(key: string, value: unknown) {
  await (await db()).put('state', plain(value), key);
}

// Svelte $state proxies can't be structured-cloned; round-trip through JSON instead.
function plain(value: unknown) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}
