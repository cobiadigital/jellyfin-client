<script lang="ts">
  import { albumTracks, getItem, playlistTracks, type Item } from '../lib/jellyfin';
  import { dismissJob, downloadCollection, downloads, getCollection, removeCollection } from '../lib/downloads.svelte';
  import { playTracks, ticksToSeconds } from '../lib/player.svelte';
  import { duration } from '../lib/format';
  import { href } from '../lib/router.svelte';
  import Artwork from '../components/Artwork.svelte';
  import Icon from '../components/Icon.svelte';
  import TrackList from '../components/TrackList.svelte';

  /** Album or playlist detail page. Falls back to the downloaded copy when offline. */
  let { id, kind }: { id: string; kind: 'album' | 'playlist' } = $props();

  let item = $state<Item | null>(null);
  let tracks = $state<Item[]>([]);
  let error = $state('');
  let loading = $state(true);
  let fromDownload = $state(false);

  $effect(() => {
    const target = id;
    loading = true;
    error = '';
    item = null;
    tracks = [];
    (async () => {
      try {
        const [it, tr] = await Promise.all([getItem(target), kind === 'album' ? albumTracks(target) : playlistTracks(target)]);
        if (target !== id) return;
        item = it;
        tracks = tr;
        fromDownload = false;
      } catch (err) {
        const local = await getCollection(target);
        if (target !== id) return;
        if (local) {
          item = local.item;
          tracks = local.tracks;
          fromDownload = true;
        } else error = navigator.onLine ? (err as Error).message : "You're offline, and this hasn't been downloaded or opened before.";
      } finally {
        if (target === id) loading = false;
      }
    })();
  });

  const job = $derived(downloads.jobs.find((j) => j.collectionId === id));
  const isDownloaded = $derived(downloads.collections.has(id));
  const totalTime = $derived(tracks.reduce((s, t) => s + ticksToSeconds(t.RunTimeTicks), 0));
  const artist = $derived(item?.AlbumArtists?.[0]);

  function toggleDownload() {
    if (!item) return;
    if (job?.error) dismissJob(id);
    if (isDownloaded && !job) {
      if (confirm(`Remove the downloaded copy of "${item.Name}"?`)) removeCollection(id);
    } else if (!job || job.error) downloadCollection(item, tracks);
  }
</script>

<div class="page">
  <button class="icon-btn back" onclick={() => history.back()} aria-label="Back"><Icon name="back" /></button>
  {#if loading}
    <div class="center"><div class="spinner"></div></div>
  {:else if error || !item}
    <p class="error center">{error || 'Not found'}</p>
  {:else}
    <header class="head">
      <div class="cover"><Artwork {item} size={600} fallback={kind === 'playlist' ? 'playlist' : 'album'} /></div>
      <div class="info">
        <h1>{item.Name}</h1>
        {#if artist}<a class="artist" href={href('artist', artist.Id)}>{artist.Name}</a>{:else if item.AlbumArtist}<div class="artist">{item.AlbumArtist}</div>{/if}
        <div class="muted small">
          {[item.ProductionYear, `${tracks.length} tracks`, duration(totalTime)].filter(Boolean).join(' · ')}
          {#if fromDownload}· offline copy{/if}
        </div>
      </div>
    </header>

    <div class="actions">
      <button class="btn primary" data-autofocus onclick={() => playTracks(tracks, 0)} disabled={!tracks.length}><Icon name="play" /> Play</button>
      <button class="btn" onclick={() => playTracks(tracks, 0, true)} disabled={!tracks.length}><Icon name="shuffle" /> Shuffle</button>
      <button class="icon-btn dl" class:on={isDownloaded && !job} onclick={toggleDownload} aria-label={isDownloaded ? 'Remove download' : 'Download'} disabled={fromDownload && !isDownloaded}>
        {#if job && !job.error}<span class="progress">{job.done}/{job.total}</span>{:else}<Icon name={isDownloaded ? 'downloaded' : 'download'} />{/if}
      </button>
    </div>
    {#if job?.error}<p class="error small">Download stopped: {job.error}. Tap download to retry.</p>{/if}

    <TrackList {tracks} showArt={kind === 'playlist'} />
  {/if}
</div>

<style>
  .back {
    margin-left: -10px;
  }
  .head {
    display: flex;
    gap: 16px;
    align-items: flex-end;
    flex-wrap: wrap;
  }
  .cover {
    width: min(220px, 55vw);
  }
  .info {
    flex: 1;
    min-width: 200px;
  }
  h1 {
    font-size: 1.5rem;
    margin: 0 0 4px;
  }
  .artist {
    font-weight: 600;
    display: block;
    margin-bottom: 4px;
  }
  .small {
    font-size: 0.85rem;
  }
  .actions {
    display: flex;
    gap: 10px;
    align-items: center;
    margin: 18px 0 8px;
  }
  .dl {
    margin-left: auto;
    background: var(--surface);
  }
  .progress {
    font-size: 0.72rem;
    font-weight: 700;
    color: var(--accent);
  }
</style>
