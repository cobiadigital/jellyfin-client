<script lang="ts">
  import { untrack } from 'svelte';
  import { libraryPage, type Item, type LibraryKind, type LibrarySort, type SortOrder } from '../lib/jellyfin';
  import { filterCatalog } from '../lib/catalog.svelte';
  import { href } from '../lib/router.svelte';
  import ItemCard from '../components/ItemCard.svelte';
  import ItemRow from '../components/ItemRow.svelte';
  import Icon from '../components/Icon.svelte';
  import SearchInput from '../components/SearchInput.svelte';

  let { kind }: { kind: LibraryKind } = $props();

  const tabs: [LibraryKind, string][] = [
    ['albums', 'Albums'],
    ['artists', 'Artists'],
    ['playlists', 'Playlists'],
    ['genres', 'Genres'],
  ];

  type View = 'tiles' | 'rows';
  interface Prefs { view: View; sort: LibrarySort; order: SortOrder }

  const sortOptions: Record<LibraryKind, [LibrarySort, string][]> = {
    albums: [['name', 'Album'], ['artist', 'Artist'], ['released', 'Year'], ['added', 'Added']],
    artists: [['name', 'Name'], ['added', 'Added']],
    playlists: [['name', 'Name'], ['added', 'Added']],
    genres: [['name', 'Name'], ['added', 'Added']],
  };

  function loadPrefs(k: LibraryKind): Prefs {
    const fallback: Prefs = { view: 'tiles', sort: 'name', order: 'Ascending' };
    try {
      const p = JSON.parse(localStorage.getItem(`jf.library.${k}`) ?? 'null') as Partial<Prefs> | null;
      if (!p) return fallback;
      return {
        view: p.view === 'rows' ? 'rows' : 'tiles',
        sort: sortOptions[k].some(([v]) => v === p.sort) ? p.sort! : 'name',
        order: p.order === 'Descending' ? 'Descending' : 'Ascending',
      };
    } catch {
      return fallback;
    }
  }

  let prefs = $state<Prefs>(loadPrefs(untrack(() => kind)));
  // Swap in the saved choices when the tab changes.
  $effect(() => {
    prefs = loadPrefs(kind);
  });

  function setPrefs(patch: Partial<Prefs>) {
    prefs = { ...prefs, ...patch };
    try {
      localStorage.setItem(`jf.library.${kind}`, JSON.stringify(prefs));
    } catch {
      /* private mode: choices just won't persist */
    }
  }

  // Filter text is shared across tabs and survives opening an item and coming back.
  const FILTER_KEY = 'jf.libraryFilter';
  const savedFilter = sessionStorage.getItem(FILTER_KEY) ?? '';
  let filterInput = $state(savedFilter);
  let filter = $state(savedFilter);
  let filterTimer: ReturnType<typeof setTimeout>;
  $effect(() => {
    const text = filterInput;
    try {
      sessionStorage.setItem(FILTER_KEY, text);
    } catch {}
    clearTimeout(filterTimer);
    filterTimer = setTimeout(() => (filter = text), 300);
    return () => clearTimeout(filterTimer);
  });

  function searchEverything() {
    try {
      sessionStorage.setItem('jf.search', filterInput.trim());
    } catch {}
    location.hash = href('search');
  }

  let items = $state<Item[]>([]);
  let total = $state(Infinity);
  let loading = $state(false);
  let error = $state('');
  let sentinel = $state<HTMLElement>();
  let generation = 0;

  function fetchPage(offset: number) {
    // Filtering reads the local index when it can, which is instant and works offline.
    const term = filter.trim();
    return (async () => (term && (await filterCatalog(kind, term, prefs.sort, prefs.order, navigator.onLine))) || libraryPage(kind, offset, 60, prefs.sort, prefs.order, filter))();
  }

  async function loadMore() {
    if (loading || items.length >= total) return;
    loading = true;
    const gen = generation;
    try {
      const page = await fetchPage(items.length);
      if (gen !== generation) return;
      items.push(...page.Items);
      total = page.Items.length ? page.TotalRecordCount : items.length;
      error = '';
    } catch (err) {
      if (gen === generation) {
        error = (err as Error).message;
        total = items.length; // stop the observer looping on errors
      }
    } finally {
      if (gen === generation) loading = false;
    }
  }

  // Reset and load the first page whenever the tab or sort changes.
  $effect(() => {
    kind;
    prefs.sort;
    prefs.order;
    generation++;
    items = [];
    total = Infinity;
    error = '';
    loading = false;
    untrack(loadMore);
  });

  // A new filter keeps the current items on screen and swaps in the fresh results when they arrive.
  let firstFilter = true;
  $effect(() => {
    filter;
    if (firstFilter) {
      firstFilter = false;
      return;
    }
    untrack(async () => {
      const gen = ++generation;
      loading = false;
      try {
        const page = await fetchPage(0);
        if (gen !== generation) return;
        items = page.Items;
        total = page.Items.length ? page.TotalRecordCount : 0;
        error = '';
      } catch (err) {
        if (gen === generation) {
          error = (err as Error).message;
          total = items.length;
        }
      }
    });
  });

  // Hide loaded items that no longer match as the user types, before the results come back.
  const visible = $derived.by(() => {
    const q = filterInput.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => i.Name.toLowerCase().includes(q) || (kind === 'albums' && i.AlbumArtist?.toLowerCase().includes(q)));
  });

  // Infinite scroll: load the next page as the bottom comes into view.
  $effect(() => {
    if (!sentinel) return;
    const io = new IntersectionObserver((entries) => entries[0].isIntersecting && untrack(loadMore), { rootMargin: '800px' });
    io.observe(sentinel);
    return () => io.disconnect();
  });

  function retry() {
    total = Infinity;
    loadMore();
  }
</script>

<div class="page">
  <nav class="tabs">
    {#each tabs as [k, label]}
      <a href={href(k)} class:active={k === kind}>{label}</a>
    {/each}
  </nav>

  <div class="filter"><SearchInput bind:value={filterInput} placeholder="Filter {kind}" /></div>

  <div class="controls">
    <div class="sorts" role="group" aria-label="Sort by">
      {#each sortOptions[kind] as [v, label]}
        {@const active = prefs.sort === v}
        <button
          class="sort"
          class:active
          aria-pressed={active}
          aria-label={active ? `${label}, ${prefs.order}` : label}
          onclick={() => setPrefs(active ? { order: prefs.order === 'Ascending' ? 'Descending' : 'Ascending' } : { sort: v })}
        >
          {label}
          {#if active}<span class="caret" class:desc={prefs.order === 'Descending'}><Icon name="up" size={14} /></span>{/if}
        </button>
      {/each}
    </div>
    <button class="btn" aria-label={prefs.view === 'tiles' ? 'Switch to rows' : 'Switch to tiles'} onclick={() => setPrefs({ view: prefs.view === 'tiles' ? 'rows' : 'tiles' })}>
      <Icon name={prefs.view === 'tiles' ? 'viewList' : 'viewGrid'} size={22} />
    </button>
  </div>

  {#if prefs.view === 'tiles'}
    <div class="grid">
      {#each visible as item (item.Id)}
        <ItemCard {item} />
      {/each}
    </div>
  {:else}
    <div class="rows">
      {#each visible as item (item.Id)}
        <ItemRow {item} />
      {/each}
    </div>
  {/if}

  {#if error}
    <div class="center"><p class="error">{error}</p><button class="btn" onclick={retry}>Retry</button></div>
  {:else if loading}
    <div class="center"><div class="spinner"></div></div>
  {:else if !visible.length}
    <p class="muted center">{filter.trim() ? `No ${kind} match "${filter.trim()}".` : 'Nothing here yet.'}</p>
  {/if}
  {#if filterInput.trim() && !loading}
    <div class="center"><button class="btn" onclick={searchEverything}>Search everything for "{filterInput.trim()}"</button></div>
  {/if}
  <div bind:this={sentinel} style="height: 1px"></div>
</div>

<style>
  .filter {
    margin-bottom: 12px;
  }
  .controls {
    display: flex;
    gap: 8px;
    margin-bottom: 16px;
  }
  .controls {
    align-items: center;
    position: sticky;
    top: var(--safe-t);
    z-index: 5;
    background: var(--bg);
    margin: 0 -16px 8px;
    padding: 0 16px;
  }
  .sorts {
    flex: 1;
    min-width: 0;
    display: flex;
    overflow-x: auto;
    scrollbar-width: none;
  }
  .sort {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    min-height: 44px;
    padding: 0 12px 0 0;
    background: none;
    border: 0;
    color: var(--muted, inherit);
    font-size: 0.8rem;
    white-space: nowrap;
  }
  .sort.active {
    color: inherit;
    font-weight: 700;
  }
  .caret {
    display: inline-flex;
  }
  .caret.desc {
    transform: rotate(180deg);
  }
  .controls .btn {
    min-height: 44px;
    min-width: 44px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .rows {
    display: flex;
    flex-direction: column;
  }
  .tabs {
    display: flex;
    gap: 8px;
    overflow-x: auto;
    margin: 4px -16px 16px;
    padding: 0 16px;
    scrollbar-width: none;
  }
  .tabs a {
    padding: 8px 16px;
    border-radius: 999px;
    background: var(--surface);
    white-space: nowrap;
    font-weight: 600;
    font-size: 0.92rem;
  }
  .tabs a.active {
    background: var(--accent);
    color: #001c27;
  }
</style>
