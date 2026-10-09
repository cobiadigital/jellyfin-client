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

export interface CollectionRecord {
  id: string; // album or playlist id
  item: Item;
  trackIds: string[];
  addedAt: number;
}

interface Schema extends DBSchema {
  api: { key: string; value: { key: string; data: unknown; savedAt: number } };
  downloads: { key: string; value: DownloadRecord; indexes: { byParent: string } };
  collections: { key: string; value: CollectionRecord };
  state: { key: string; value: unknown };
}

let dbPromise: Promise<IDBPDatabase<Schema>> | undefined;

export function db() {
  dbPromise ??= openDB<Schema>('jellyfin-client', 1, {
    upgrade(d) {
      d.createObjectStore('api', { keyPath: 'key' });
      d.createObjectStore('downloads', { keyPath: 'id' }).createIndex('byParent', 'parentId');
      d.createObjectStore('collections', { keyPath: 'id' });
      d.createObjectStore('state');
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
