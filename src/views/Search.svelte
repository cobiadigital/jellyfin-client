<script lang="ts">
  import { search, type Item } from '../lib/jellyfin';
  import { catalogComplete, searchCatalog } from '../lib/catalog.svelte';
  import ItemCard from '../components/ItemCard.svelte';
  import TrackList from '../components/TrackList.svelte';
  import SearchInput from '../components/SearchInput.svelte';

  let term = $state(sessionStorage.getItem('jf.search') ?? '');
  type Results = { artists: Item[]; albums: Item[]; tracks: Item[]; playlists: Item[] };
  let results = $state<Results | null>(null);

  // Local matches first, then anything the server has that the index doesn't yet.
  function merge(local: Results, remote: Results): Results {
    const add = (a: Item[], b: Item[]) => {
      const seen = new Set(a.map((i) => i.Id));
      return [...a, ...b.filter((i) => !seen.has(i.Id))];
    };
    return { artists: add(local.artists, remote.artists), albums: add(local.albums, remote.albums), tracks: add(local.tracks, remote.tracks), playlists: add(local.playlists, remote.playlists) };
  }
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
        // The local index answers instantly and works offline.
        const local = await searchCatalog(q);
        if (mine !== seq) return;
        if (local) {
          results = local;
          loading = false;
          if (!navigator.onLine || (await catalogComplete())) return;
        } else if (!navigator.onLine) {
          error = 'Search needs a connection until the library index is built.';
          return;
        }
        const r = await search(q);
        if (mine === seq) results = local ? merge(local, r) : r;
      } catch (err) {
        if (mine === seq && !results) error = navigator.onLine ? (err as Error).message : 'Search needs a connection.';
      } finally {
        if (mine === seq) loading = false;
      }
    }, 300);
  });
</script>

<div class="page">
  <h1 class="page-title">Search</h1>
  <SearchInput bind:value={term} placeholder="Artists, albums, songs" autofocus />

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
