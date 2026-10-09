<script lang="ts">
  import { search, type Item } from '../lib/jellyfin';
  import ItemCard from '../components/ItemCard.svelte';
  import TrackList from '../components/TrackList.svelte';

  let term = $state(sessionStorage.getItem('jf.search') ?? '');
  let results = $state<{ artists: Item[]; albums: Item[]; tracks: Item[]; playlists: Item[] } | null>(null);
  let loading = $state(false);
  let error = $state('');
  let timer: ReturnType<typeof setTimeout>;
  let seq = 0;

  $effect(() => {
    const q = term.trim();
    try {
      sessionStorage.setItem('jf.search', term);
    } catch {}
    clearTimeout(timer);
    if (q.length < 2) {
      results = null;
      return;
    }
    // Debounce so we don't query on every keystroke.
    timer = setTimeout(async () => {
      const mine = ++seq;
      loading = true;
      error = '';
      try {
        const r = await search(q);
        if (mine === seq) results = r;
      } catch (err) {
        if (mine === seq) error = navigator.onLine ? (err as Error).message : 'Search needs a connection.';
      } finally {
        if (mine === seq) loading = false;
      }
    }, 300);
  });
</script>

<div class="page">
  <h1 class="page-title">Search</h1>
  <!-- svelte-ignore a11y_autofocus -->
  <input type="search" bind:value={term} placeholder="Artists, albums, songs" autofocus enterkeyhint="search" />

  {#if loading && !results}
    <div class="center"><div class="spinner"></div></div>
  {:else if error}
    <p class="error">{error}</p>
  {:else if results}
    {#if results.tracks.length}
      <h2 class="section-title">Songs</h2>
      <TrackList tracks={results.tracks} showArt />
    {/if}
    {#each [['Artists', results.artists], ['Albums', results.albums], ['Playlists', results.playlists]] as const as [label, list]}
      {#if list.length}
        <h2 class="section-title">{label}</h2>
        <div class="grid">{#each list as item (item.Id)}<ItemCard {item} />{/each}</div>
      {/if}
    {/each}
    {#if !results.tracks.length && !results.artists.length && !results.albums.length && !results.playlists.length}
      <p class="muted center">No results for "{term}".</p>
    {/if}
  {/if}
</div>
