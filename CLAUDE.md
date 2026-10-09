# CLAUDE.md

Guidance for Claude Code working in this repository.

## Change workflow (required)

Every change, however small, follows this process:

1. **Issue first.** Create a GitHub issue describing the change (goal, scope, acceptance criteria) before writing code. If the user describes a change in chat, open the issue for them.
2. **Branch from the issue.** Fetch the latest `main` and create a branch named `issue-<number>-<short-slug>`, e.g. `issue-12-playback-reporting`:
   ```sh
   git fetch origin main
   git checkout -B issue-12-playback-reporting origin/main
   ```
3. **Work on that branch only.** Commit there and push with `git push -u origin <branch>`.
4. **Open a pull request into `main`.** Reference the issue in the body with `Closes #<number>` so merging closes it.
5. **`main` changes only through merged PRs.** Never commit, push, merge, rebase, or force-push directly to `main`. Don't merge PRs yourself unless the user explicitly asks.

One issue per branch, and one branch per PR. If work uncovers an unrelated problem, open a new issue for it rather than widening the current PR. If a branch's PR has already merged, start follow-up work on a new issue and a new branch from the updated `main`.

## User context

- The owner works mostly from a phone, without easy terminal access. Prefer changes that need no local tooling, and give dashboard or GitHub UI steps rather than CLI steps.
- Deployment is **Cloudflare Workers Builds** connected to this repo. A merge to `main` triggers `npm run build`, then `npx wrangler deploy`. There is no separate staging step, so a merged PR goes straight to production.
- Never ask for secrets in chat or commit them. If something ever needs a key, have the user add it once as a Workers Builds variable or secret in the Cloudflare dashboard.

## Project overview

A Finamp-style Jellyfin music client built as an installable PWA. It's a static site with no backend; the browser talks directly to the user's Jellyfin server (10.9+, HTTPS, CORS).

Stack: Vite, Svelte 5 (runes), TypeScript, `idb`, and a hand-written service worker.

| Path | Purpose |
| --- | --- |
| `src/lib/jellyfin.ts` | Jellyfin API client, stream/download/image URLs |
| `src/lib/session.svelte.ts` | Auth session and settings (localStorage) |
| `src/lib/db.ts` | IndexedDB schema (`api`, `downloads`, `collections`, `state`) |
| `src/lib/cache.ts` | Network-first JSON with an IndexedDB fallback for offline browsing |
| `src/lib/downloads.svelte.ts` | Offline audio: bytes in Cache Storage `audio-v1`, metadata in IndexedDB |
| `src/lib/player.svelte.ts` | Audio element, queue, shuffle/repeat, Media Session, queue persistence |
| `src/lib/router.svelte.ts` | Hash router (`#/album/<id>`) |
| `src/sw.js` | Service worker template; `vite.config.ts` injects the precache list and version |
| `src/views/`, `src/components/` | UI |
| `wrangler.jsonc`, `public/_headers` | Cloudflare Workers static-assets config |

### Storage rules

- Audio never goes in localStorage (about 5 MB, strings only). Use Cache Storage for bytes and IndexedDB for metadata.
- localStorage is only for small values needed synchronously at startup (token, settings, device id).
- Svelte `$state` proxies can't be structured-cloned. Snapshot them (`$state.snapshot` or a JSON round-trip) before writing to IndexedDB.
- The player reads downloaded audio as a blob object URL rather than routing it through the service worker (avoids iOS range-request issues).
- iOS blocks `audio.play()` after an `await` outside a user gesture. Keep the streaming path synchronous inside tap handlers.

## Before opening a PR

Run these and make sure they pass:

```sh
npm run check   # svelte-check, must report 0 errors
npm run build   # must succeed
```

For player, download, or offline changes, also exercise the built app (`npm run preview`) in a browser, ideally at a phone-sized viewport. Mention in the PR what was tested and what wasn't (for example, "not tested against a real Jellyfin server").

## Conventions

- Match the existing style: small modules, Svelte 5 runes, comments only where intent isn't obvious.
- Keep the app mobile-first: 44px touch targets, safe-area insets, 16px inputs (prevents iOS zoom).
- Don't add dependencies without a clear reason; the bundle is small on purpose.
