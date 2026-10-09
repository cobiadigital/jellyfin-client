<script lang="ts">
  import { dismissJob, downloads, listCollections, refreshUsage, removeAll, removeCollection, requestPersistence, persistCached, SAVED_ID } from '../lib/downloads.svelte';
  import { dropCached, listCached, streamCache } from '../lib/streamcache.svelte';
  import { artistLine } from '../lib/format';
  import { bytes } from '../lib/format';
  import { isDemo } from '../lib/session.svelte';
  import { href } from '../lib/router.svelte';
  import Artwork from '../components/Artwork.svelte';
  import Icon from '../components/Icon.svelte';

  type Row = Awaited<ReturnType<typeof listCollections>>[number];
  let rows = $state<Row[]>([]);

  // Re-list whenever the set of downloaded collections or active jobs changes.
  const demo = isDemo();
  $effect(() => {
    if (demo) return;
    downloads.collections;
    downloads.jobs.length;
    listCollections().then((r) => (rows = r));
  });
  if (!demo) refreshUsage();

  let cached = $state<Awaited<ReturnType<typeof listCached>>>([]);
  $effect(() => {
    if (demo) return;
    streamCache.tracks;
    listCached().then((r) => (cached = r));
  });

  async function remove(row: Row) {
    if (confirm(`Remove "${row.item.Name}" from this device?`)) await removeCollection(row.id);
  }

  async function wipe() {
    if (confirm('Remove all downloaded music from this device?')) await removeAll();
  }
</script>

<div class="page">
  <h1 class="page-title">Downloads</h1>
  {#if demo}
    <p class="muted">Downloads are turned off in demo mode, so nothing here touches this device's offline storage.</p>
  {:else}

  <section class="storage">
    <div class="usage">
      <div class="meter"><div style:width="{downloads.quota ? Math.min(100, (downloads.usage / downloads.quota) * 100) : 0}%"></div></div>
      <div class="muted small">{bytes(downloads.usage)} used{downloads.quota ? ` of ${bytes(downloads.quota)} available to this app` : ''}</div>
    </div>
    {#if !downloads.persisted}
      <p class="small muted">
        Storage isn't marked persistent, so the browser may clear downloads when space runs low.
        <button class="link" onclick={requestPersistence}>Request persistent storage</button>
        (on iOS, adding the app to your Home Screen helps).
      </p>
    {/if}
  </section>

  {#each downloads.jobs as job (job.collectionId)}
    <div class="job">
      <div class="ellipsis"><strong>{job.name}</strong></div>
      {#if job.error}
        <div class="error small">{job.error}</div>
        <button class="btn" onclick={() => dismissJob(job.collectionId)}>Dismiss</button>
      {:else}
        <div class="muted small">Track {Math.min(job.done + 1, job.total)} of {job.total} · {bytes(job.currentBytes)}</div>
        <div class="meter"><div style:width="{(job.done / job.total) * 100}%"></div></div>
      {/if}
    </div>
  {/each}

  {#if rows.length}
    <ul class="list">
      {#each rows as row (row.id)}
        <li>
          {#if row.id === SAVED_ID}
            <div class="main">
              <span class="thumb"><Artwork item={undefined} size={96} fallback="downloaded" /></span>
              <span class="text">
                <span class="ellipsis">Saved songs</span>
                <span class="muted small ellipsis">{row.trackIds.length} tracks · {bytes(row.bytes)}</span>
              </span>
            </div>
          {:else}
            <a class="main" href={href(row.item.Type === 'Playlist' ? 'playlist' : 'album', row.id)}>
              <span class="thumb"><Artwork item={row.item} size={96} /></span>
              <span class="text">
                <span class="ellipsis">{row.item.Name}</span>
                <span class="muted small ellipsis">{row.trackIds.length} tracks · {bytes(row.bytes)}</span>
              </span>
            </a>
          {/if}
          <button class="icon-btn" aria-label="Remove" onclick={() => remove(row)}><Icon name="delete" /></button>
        </li>
      {/each}
    </ul>
    <button class="btn danger" onclick={wipe}>Remove all downloads</button>
  {:else if !downloads.jobs.length}
    <p class="muted">Nothing downloaded yet. Open an album or playlist and tap <Icon name="download" size={16} /> to keep a copy on this device.</p>
  {/if}

  {#if cached.length}
    <h2 class="section-title">Cached songs</h2>
    <p class="muted small">Saved automatically from streaming and removed when space is needed. Tap <Icon name="download" size={14} /> to keep one as a download.</p>
    <ul class="list">
      {#each cached as row (row.id)}
        <li>
          <div class="main">
            <span class="thumb"><Artwork item={row.track} size={96} /></span>
            <span class="text">
              <span class="ellipsis">{row.track.Name}</span>
              <span class="muted small ellipsis">{artistLine(row.track)} · {bytes(row.bytes)}</span>
            </span>
          </div>
          <button class="icon-btn" aria-label="Keep as download" onclick={() => persistCached(row.track)}><Icon name="download" /></button>
          <button class="icon-btn" aria-label="Remove from cache" onclick={() => dropCached(row.id)}><Icon name="delete" /></button>
        </li>
      {/each}
    </ul>
  {/if}
  {/if}
</div>

<style>
  .storage {
    background: var(--surface);
    border-radius: var(--radius);
    padding: 14px;
    margin-bottom: 16px;
  }
  .meter {
    height: 6px;
    border-radius: 3px;
    background: var(--surface-2);
    overflow: hidden;
    margin: 6px 0;
  }
  .meter > div {
    height: 100%;
    background: var(--accent);
  }
  .small {
    font-size: 0.82rem;
  }
  .link {
    color: var(--accent);
    text-decoration: underline;
  }
  .job {
    background: var(--surface);
    border-radius: var(--radius);
    padding: 12px 14px;
    margin-bottom: 10px;
  }
  .list {
    list-style: none;
    padding: 0;
    margin: 0 0 24px;
  }
  .list li {
    display: flex;
    align-items: center;
  }
  .main {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 0;
  }
  .thumb {
    width: 52px;
    flex: none;
  }
  .text {
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .section-title {
    font-size: 1.1rem;
    margin: 8px 0 4px;
  }
  .danger {
    color: var(--danger);
  }
</style>
