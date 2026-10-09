<script lang="ts">
  import { artistAlbums, genreAlbums, getItem, type Item } from '../lib/jellyfin';
  import Artwork from '../components/Artwork.svelte';
  import Icon from '../components/Icon.svelte';
  import ItemCard from '../components/ItemCard.svelte';

  /** Artist or genre page: a header plus a grid of albums. */
  let { id, kind }: { id: string; kind: 'artist' | 'genre' } = $props();

  let item = $state<Item | null>(null);
  let albums = $state<Item[]>([]);
  let loading = $state(true);
  let error = $state('');

  $effect(() => {
    const target = id;
    loading = true;
    error = '';
    Promise.all([getItem(target), kind === 'artist' ? artistAlbums(target) : genreAlbums(target)])
      .then(([it, al]) => {
        if (target !== id) return;
        item = it;
        albums = al;
      })
      .catch((err) => target === id && (error = navigator.onLine ? err.message : "You're offline, and this page hasn't been opened before."))
      .finally(() => target === id && (loading = false));
  });
</script>

<div class="page">
  <button class="icon-btn back" onclick={() => history.back()} aria-label="Back"><Icon name="back" /></button>
  {#if loading}
    <div class="center"><div class="spinner"></div></div>
  {:else if error || !item}
    <p class="error center">{error || 'Not found'}</p>
  {:else}
    <header class="head">
      {#if kind === 'artist'}<div class="pic"><Artwork {item} size={300} round fallback="artist" /></div>{/if}
      <h1>{item.Name}</h1>
    </header>
    <h2 class="section-title">Albums <span class="muted">({albums.length})</span></h2>
    <div class="grid">
      {#each albums as album (album.Id)}<ItemCard item={album} />{/each}
    </div>
  {/if}
</div>

<style>
  .back {
    margin-left: -10px;
  }
  .head {
    display: flex;
    align-items: center;
    gap: 16px;
  }
  .pic {
    width: 110px;
    flex: none;
  }
  h1 {
    font-size: 1.6rem;
    margin: 0;
  }
</style>
