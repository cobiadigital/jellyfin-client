/* Service worker: app shell precache + artwork cache.
 * Built by the plugin in vite.config.ts, which replaces the two placeholders below.
 * Audio is NOT handled here: downloaded tracks live in the "audio-v1" cache and the
 * player reads them directly (see src/lib/downloads.svelte.ts). */

const PRECACHE = self.__PRECACHE__;
const VERSION = self.__VERSION__;
const SHELL_CACHE = `shell-${VERSION}`;
const IMAGE_CACHE = 'images-v1';
const IMAGE_CACHE_MAX = 1500;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith('shell-') && k !== SHELL_CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // App navigations: network first so deploys show up, fall back to the cached shell offline.
  if (req.mode === 'navigate' && url.origin === self.location.origin) {
    event.respondWith(
      fetch(req).catch(async () => (await caches.match('/')) || Response.error()),
    );
    return;
  }

  // Same-origin static files: cache first (hashed filenames make this safe).
  if (url.origin === self.location.origin) {
    event.respondWith(caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req)));
    return;
  }

  // Jellyfin artwork: cache first. Only CORS (non-opaque) responses are stored, because
  // opaque responses are padded heavily against the storage quota.
  if (/\/Items\/[^/]+\/Images\//i.test(url.pathname)) {
    event.respondWith(cacheImage(req));
  }
});

async function cacheImage(req) {
  const cache = await caches.open(IMAGE_CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok && res.type === 'cors') {
    await cache.put(req, res.clone());
    trimCache(cache, IMAGE_CACHE_MAX);
  }
  return res;
}

async function trimCache(cache, max) {
  const keys = await cache.keys();
  if (keys.length <= max) return;
  await Promise.all(keys.slice(0, keys.length - max).map((k) => cache.delete(k)));
}
