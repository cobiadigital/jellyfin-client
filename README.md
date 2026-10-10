# Jellyfin Music (PWA)

A Finamp-style music player for [Jellyfin](https://jellyfin.org), built as an installable Progressive Web App with offline downloads.

Stack: Vite + Svelte 5 + TypeScript, a hand-written service worker, IndexedDB and Cache Storage. No backend: it's a static site served by Cloudflare Workers.

## Features (v0.1)

- **Library**: albums, artists, playlists and genres with artwork and infinite scroll; album, artist, playlist and genre pages; search.
- **Player**: mini player plus full-screen Now Playing, queue (jump, reorder, remove, clear, play next, add to queue), shuffle, repeat all/one, seek, and lock-screen / headset controls through the Media Session API. The queue and position are restored when you reopen the app.
- **Offline**: download albums or playlists, as transcoded AAC (128/192/320 kbps) or original files (a setting). Downloaded tracks play from the device automatically. Pages you've opened before also work offline.

## Demo mode

Tap **Try demo** on the sign-in screen, or open `/#/demo` on any deployment or preview URL, to browse a built-in sample library with no server or login. Playback uses short generated tones, and downloads are turned off. Demo mode never stores a token, contacts a server, or writes to the app's IndexedDB or Cache Storage. Use **Exit demo** (top bar or Settings) to return to sign-in.

## How local storage works

| What | Where | Why |
| --- | --- | --- |
| Audio files | Cache Storage (`audio-v1`) | Holds large binary blobs; localStorage is capped around 5 MB and stores only strings. |
| Download metadata (tracks, albums, sizes) | IndexedDB `downloads`, `collections` | Structured and queryable; survives reloads. |
| Library API responses | IndexedDB `api` | Network-first, falls back to the stored copy offline. |
| Queue / playback position | IndexedDB `state` | Restore where you left off. |
| Artwork | Cache Storage (`images-v1`), via the service worker | Capped at 1500 images. |
| Sign-in token, settings, device id | localStorage | Tiny and needed synchronously at startup. |

The app asks for **persistent storage** on the first download so the browser won't evict music under storage pressure. On iPhone, install it to the Home Screen (Share, then Add to Home Screen); Safari gives installed web apps more storage and stronger persistence.

## Requirements

- Jellyfin **10.9 or newer** (uses the `/Items?userId=` API).
- The server must be reachable over **HTTPS** from your phone (a page served over HTTPS can't call an `http://` server). A reverse proxy or Cloudflare Tunnel works.
- CORS: Jellyfin allows all origins by default. If you've restricted it, or your reverse proxy strips CORS headers, allow this app's URL.

## Deploying with Cloudflare Workers Builds

1. Cloudflare dashboard, then Workers & Pages, then Create, then Import a repository, and pick this repo.
2. Settings:
   - **Build command:** `npm run build`
   - **Deploy command:** `npx wrangler deploy`
   - The Worker name must match `name` in `wrangler.jsonc` (`jellyfin-client`), or change that file to match.
3. Every push to `main` builds and deploys. No secrets or environment variables are needed: you sign in to your Jellyfin server from inside the app, and only the returned access token is stored, on your device.

## Fire TV app (sideload)

The same web app is wrapped as an Android APK with [Capacitor](https://capacitorjs.com) for Fire TV. It is built on GitHub, so no local tooling is needed.

1. On GitHub, open **Actions**, then **Fire TV APK**, then **Run workflow**. To publish a downloadable Release instead, push a tag like `tv-v0.1.0`.
2. When the run finishes, download the `jellyfin-music-firetv` artifact (or the Release asset) and unzip it if needed. Copy the link to the `.apk` for the Fire TV.
3. On the Fire TV, install the **Downloader** app, enable **Settings, My Fire TV, Developer Options, Install unknown apps** for Downloader, then enter the APK URL.
4. The app appears in your Fire TV Apps row. Your Jellyfin server must be HTTPS and allow CORS from `https://localhost` (Jellyfin's default does).

The Cloudflare deploy is unaffected: it only runs `npm run build`.

## Local development (optional)

```sh
npm install
npm run dev      # dev server (service worker disabled)
npm run build    # production build into dist/
npm run preview  # serve dist/ with the service worker
npm run check    # type-check
```

## Roadmap ideas

- Report playback to Jellyfin (play counts, "now playing" on the dashboard), favourites, instant mix.
- Download individual tracks and artists; "download all favourites".
- Pre-buffer the next track for near-gapless playback.
- Background Fetch for large downloads where supported.
