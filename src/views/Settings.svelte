<script lang="ts">
  import { logout } from '../lib/jellyfin';
  import { auth, saveSettings, setSession, settings } from '../lib/session.svelte';
  import { clearApiCache } from '../lib/cache';
  import { catalog, catalogStats, clearCatalog, syncCatalog, type CatalogStats } from '../lib/catalog.svelte';
  import { bytes } from '../lib/format';
  import { clearQueue } from '../lib/player.svelte';
  import { exitDemo } from '../lib/demo';
  import { resetNetStats } from '../lib/netstats.svelte';
  import { getTvPref, setTvPref, type TvPref } from '../lib/tv';
  import { applyCacheLimit, clearStreamCache, streamCache } from '../lib/streamcache.svelte';

  $effect(() => {
    // Track every field so any change is saved.
    settings.streamQuality;
    settings.downloadFormat;
    settings.cacheLimitMB;
    settings.downloadBitrate;
    settings.visualizer;
    settings.debugOverlay;
    saveSettings();
  });

  const tvPref = getTvPref();
  function changeTv(v: TvPref) {
    setTvPref(v);
    location.reload();
  }

  let stats = $state<CatalogStats | null>(null);
  $effect(() => {
    catalog.status; // reload when a sync starts or ends, and as it makes progress
    catalog.version;
    catalogStats().then((s) => (stats = s));
  });

  async function clearIndex() {
    if (!confirm('Clear the library index? It will be rebuilt in the background.')) return;
    await clearCatalog();
    syncCatalog(true);
  }

  async function signOut() {
    if (!confirm('Sign out? Downloaded music stays on this device.')) return;
    clearQueue();
    await logout();
    await clearApiCache();
    await clearCatalog();
    setSession(null);
    location.hash = '';
  }
</script>

<div class="page">
  <h1 class="page-title">Settings</h1>

  <section>
    <h2>Account</h2>
    {#if auth.session?.demo}
      <p>You are in <strong>demo mode</strong>, using a built-in sample library. Nothing is sent to a server.</p>
      <button class="btn" onclick={exitDemo}>Exit demo</button>
    {:else}
      <p>Signed in as <strong>{auth.session?.userName}</strong> on <strong>{auth.session?.serverName}</strong></p>
      <p class="muted small">{auth.session?.server}</p>
      <button class="btn" onclick={signOut}>Sign out</button>
    {/if}
  </section>

  {#if !auth.session?.demo}
    <section>
      <h2>Library index</h2>
      <p class="muted small">A local copy of your library's names, so search and filters are instant and work offline. It builds and refreshes itself in the background.</p>
      {#if stats}
        <p>
          {#if catalog.status === 'syncing'}
            Syncing{catalog.progress ? `: ${catalog.progress}` : '…'}
          {:else if catalog.status === 'error'}
            Last sync failed. It will retry.
          {:else if catalog.status === 'offline'}
            Offline. Sync will resume when you are back online.
          {:else if stats.lastSync}
            Last synced {new Date(stats.lastSync).toLocaleString()}
          {:else}
            Not synced yet
          {/if}
        </p>
        <p class="muted small">
          {stats.counts.song.toLocaleString()} songs · {stats.counts.album.toLocaleString()} albums · {stats.counts.artist.toLocaleString()} artists ·
          {stats.counts.playlist.toLocaleString()} playlists · {stats.counts.genre.toLocaleString()} genres · about {bytes(stats.bytes)}
        </p>
      {/if}
      <div class="row">
        <button class="btn" disabled={catalog.status === 'syncing'} onclick={() => syncCatalog(true)}>Sync now</button>
        <button class="btn" disabled={catalog.status === 'syncing'} onclick={clearIndex}>Clear index</button>
      </div>
    </section>
  {/if}

  <section>
    <h2>Display</h2>
    <label>
      TV layout (remote control)
      <select value={tvPref} onchange={(e) => changeTv(e.currentTarget.value as TvPref)}>
        <option value="auto">Automatic (on for Fire TV)</option>
        <option value="on">Always on</option>
        <option value="off">Always off</option>
      </select>
    </label>
    <p class="muted small">Changing this reloads the app.</p>
  </section>

  <section>
    <h2>Streaming</h2>
    <label>
      Quality
      <select
        value={String(settings.streamQuality)}
        onchange={(e) => {
          const v = e.currentTarget.value;
          settings.streamQuality = v === 'original' ? 'original' : (+v as 320 | 192 | 128);
        }}
      >
        <option value="original">Original (direct play when possible)</option>
        <option value="320">Transcode to 320 kbps</option>
        <option value="192">Transcode to 192 kbps</option>
        <option value="128">Transcode to 128 kbps</option>
      </select>
    </label>
  </section>

  <section>
    <h2>Stream cache</h2>
    <label>
      Storage limit
      <select
        value={String(settings.cacheLimitMB)}
        onchange={(e) => {
          settings.cacheLimitMB = +e.currentTarget.value;
          applyCacheLimit();
        }}
      >
        <option value="0">Off</option>
        <option value="250">250 MB</option>
        <option value="500">500 MB</option>
        <option value="1024">1 GB</option>
        <option value="2048">2 GB</option>
        <option value="5120">5 GB</option>
      </select>
    </label>
    <p>{streamCache.tracks.size.toLocaleString()} cached {streamCache.tracks.size === 1 ? 'song' : 'songs'} · {bytes(streamCache.bytes)}</p>
    <p class="muted small">Songs you stream are saved here so they play again offline. When the limit is reached, the songs you played longest ago are removed first. Each song is fetched once more in the background (at up to 320 kbps AAC), which uses a little extra data. Downloads are separate and never removed automatically.</p>
    <button class="btn" disabled={!streamCache.tracks.size} onclick={() => confirm('Clear all cached songs?') && clearStreamCache()}>Clear cache</button>
  </section>

  <section>
    <h2>Downloads</h2>
    <label>
      Format
      <select bind:value={settings.downloadFormat}>
        <option value="transcoded">Transcoded AAC (smaller, plays everywhere)</option>
        <option value="original">Original file (largest, best quality)</option>
      </select>
    </label>
    {#if settings.downloadFormat === 'transcoded'}
      <label>
        Bitrate
        <select value={String(settings.downloadBitrate)} onchange={(e) => (settings.downloadBitrate = +e.currentTarget.value as 320 | 192 | 128)}>
          <option value="320">320 kbps (~2.4 MB/min)</option>
          <option value="192">192 kbps (~1.4 MB/min)</option>
          <option value="128">128 kbps (~1 MB/min)</option>
        </select>
      </label>
    {:else}
      <p class="muted small">Originals are stored as-is. Some formats (for example ALAC in Chrome, or FLAC on older iPhones) may not play offline in this browser.</p>
    {/if}
    <p class="muted small">Applies to new downloads. Existing downloads keep their format.</p>
  </section>

  <section>
    <h2>Now Playing</h2>
    <label class="check">
      <input type="checkbox" bind:checked={settings.visualizer} />
      Winamp-style visualizer
    </label>
    <p class="muted small">Swipe the artwork on Now Playing to show the spectrum analyzer, then the oscilloscope. Double-tap a visualizer for full screen.</p>
    <p class="muted small">To draw it, the app downloads a small low-quality copy of each streamed track you visualize (about 2–3 MB per 5 minutes). Downloaded tracks use no extra data.</p>
  </section>

  <section>
    <h2>Debug</h2>
    <label class="check">
      <input type="checkbox" bind:checked={settings.debugOverlay} />
      Show streaming stats overlay
    </label>
    <p class="muted small">Shows buffer, stalls, errors and throughput over the app while you listen. Useful when playback stutters or fails.</p>
    <button class="btn" onclick={resetNetStats}>Reset counters</button>
  </section>

  <section>
    <h2>About</h2>
    <p class="muted small">Jellyfin Music PWA v0.1.0. Inspired by Finamp. Audio downloads are kept in this browser's Cache Storage; library data is cached in IndexedDB so screens you've visited work offline.</p>
  </section>
</div>

<style>
  section {
    background: var(--surface);
    border-radius: var(--radius);
    padding: 4px 16px 16px;
    margin-bottom: 16px;
  }
  h2 {
    font-size: 1rem;
    margin: 14px 0 10px;
  }
  label {
    display: grid;
    gap: 6px;
    margin-bottom: 12px;
    color: var(--muted);
    font-size: 0.9rem;
  }
  label.check {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 44px;
    margin-bottom: 0;
    color: var(--text);
    font-size: 1rem;
  }
  label.check input {
    flex: none;
    padding: 0;
    width: 22px;
    height: 22px;
    accent-color: var(--accent);
  }
  .small {
    font-size: 0.82rem;
  }
  p {
    margin: 6px 0;
  }
  .row {
    display: flex;
    gap: 8px;
    margin-top: 8px;
  }
  .row .btn {
    min-height: 44px;
  }
</style>
