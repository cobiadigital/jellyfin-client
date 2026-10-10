<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { auth, settings } from './lib/session.svelte';
  import { exitDemo, handleDemoLink } from './lib/demo';
  import { route, href } from './lib/router.svelte';
  import { startCatalogSync } from './lib/catalog.svelte';
  import { initDownloads } from './lib/downloads.svelte';
  import { initStreamCache } from './lib/streamcache.svelte';
  import { player, restoreQueue } from './lib/player.svelte';
  import type { LibraryKind } from './lib/jellyfin';
  import Icon, { type IconName } from './components/Icon.svelte';
  import MiniPlayer from './components/MiniPlayer.svelte';
  import NowPlaying from './components/NowPlaying.svelte';
  import Toast from './components/Toast.svelte';
  import DebugOverlay from './components/DebugOverlay.svelte';
  import Login from './views/Login.svelte';
  import Library from './views/Library.svelte';
  import Collection from './views/Collection.svelte';
  import Albums from './views/Albums.svelte';
  import Search from './views/Search.svelte';
  import Downloads from './views/Downloads.svelte';
  import Settings from './views/Settings.svelte';

  const libraryKinds: LibraryKind[] = ['albums', 'artists', 'playlists', 'genres'];
  const nav: [string, string, IconName][] = [
    ['albums', 'Library', 'album'],
    ['search', 'Search', 'search'],
    ['downloads', 'Downloads', 'download'],
    ['settings', 'Settings', 'settings'],
  ];
  const navActive = (name: string) =>
    name === 'albums' ? libraryKinds.includes(route.name as LibraryKind) || ['album', 'artist', 'playlist', 'genre'].includes(route.name) : route.name === name;

  let online = $state(navigator.onLine);

  // `#/demo` starts the demo library directly (handy for preview links).
  $effect(() => {
    if (route.name === 'demo') untrack(handleDemoLink);
  });

  // Build or refresh the local content index in the background whenever someone is signed in.
  $effect(() => {
    if (auth.session && !auth.session.demo) untrack(startCatalogSync);
  });

  onMount(() => {
    initDownloads();
    initStreamCache().catch(() => {});
    if (auth.session) restoreQueue();
  });
</script>

<svelte:window ononline={() => (online = true)} onoffline={() => (online = false)} />

{#if !auth.session}
  <Login />
{:else}
  {#if auth.session.demo}
    <div class="demo-bar">Demo · sample library <button onclick={exitDemo}>Exit demo</button></div>
  {/if}
  {#if !online}<div class="offline">Offline · downloaded music and visited pages still work</div>{/if}

  {#if libraryKinds.includes(route.name as LibraryKind)}
    <Library kind={route.name as LibraryKind} />
  {:else if (route.name === 'album' || route.name === 'playlist') && route.id}
    {#key route.id}<Collection id={route.id} kind={route.name} />{/key}
  {:else if (route.name === 'artist' || route.name === 'genre') && route.id}
    {#key route.id}<Albums id={route.id} kind={route.name} />{/key}
  {:else if route.name === 'search'}
    <Search />
  {:else if route.name === 'downloads'}
    <Downloads />
  {:else if route.name === 'settings'}
    <Settings />
  {:else}
    <Library kind="albums" />
  {/if}

  <MiniPlayer />
  {#if player.expanded}<NowPlaying />{/if}
  <Toast />
  {#if settings.debugOverlay}<DebugOverlay />{/if}

  <nav class="bottom">
    {#each nav as [name, label, icon]}
      <a href={href(name)} class:active={navActive(name)}><Icon name={icon} /><span>{label}</span></a>
    {/each}
  </nav>
{/if}

<style>
  .offline {
    position: sticky;
    top: 0;
    z-index: 30;
    background: #5d4037;
    color: #fff;
    font-size: 0.8rem;
    text-align: center;
    padding: calc(var(--safe-t) + 4px) 8px 4px;
  }
  .demo-bar {
    position: sticky;
    top: 0;
    z-index: 30;
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 10px;
    background: var(--accent-2);
    color: #fff;
    font-size: 0.8rem;
    padding: calc(var(--safe-t) + 4px) 8px 4px;
  }
  .demo-bar button {
    color: #fff;
    text-decoration: underline;
    min-height: 28px;
    padding: 0 6px;
  }
  .bottom {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 25;
    height: calc(var(--nav-h) + var(--safe-b));
    padding-bottom: var(--safe-b);
    display: flex;
    background: rgb(16 20 24 / 0.94);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border-top: 1px solid var(--surface-2);
  }
  .bottom a {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    font-size: 0.7rem;
    color: var(--muted);
  }
  .bottom a.active {
    color: var(--accent);
  }

  /* TV: a vertical rail on the left instead of the bottom bar. */
  :global(html[data-tv]) .bottom {
    top: 0;
    right: auto;
    width: var(--rail-w);
    height: auto;
    flex-direction: column;
    justify-content: center;
    gap: 12px;
    padding: var(--safe-t) 12px var(--safe-b);
    border-top: 0;
    border-right: 1px solid var(--surface-2);
  }
  :global(html[data-tv]) .bottom a {
    flex: none;
    min-height: 88px;
    border-radius: 16px;
    font-size: 0.8rem;
  }
</style>
