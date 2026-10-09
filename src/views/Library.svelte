<script lang="ts">
  import { untrack } from 'svelte';
  import { libraryPage, type Item, type LibraryKind } from '../lib/jellyfin';
  import { href } from '../lib/router.svelte';
  import ItemCard from '../components/ItemCard.svelte';

  let { kind }: { kind: LibraryKind } = $props();

  const tabs: [LibraryKind, string][] = [
    ['albums', 'Albums'],
    ['artists', 'Artists'],
    ['playlists', 'Playlists'],
    ['genres', 'Genres'],
  ];

  let items = $state<Item[]>([]);
  let total = $state(Infinity);
  let loading = $state(false);
  let error = $state('');
  let sentinel = $state<HTMLElement>();
  let generation = 0;

  async function loadMore() {
    if (loading || items.length >= total) return;
    loading = true;
    const gen = generation;
    try {
      const page = await libraryPage(kind, items.length);
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

  // Reset and load the first page whenever the tab changes.
  $effect(() => {
    kind;
    generation++;
    items = [];
    total = Infinity;
    error = '';
    loading = false;
    untrack(loadMore);
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

  <div class="grid">
    {#each items as item (item.Id)}
      <ItemCard {item} />
    {/each}
  </div>

  {#if error}
    <div class="center"><p class="error">{error}</p><button class="btn" onclick={retry}>Retry</button></div>
  {:else if loading}
    <div class="center"><div class="spinner"></div></div>
  {:else if !items.length}
    <p class="muted center">Nothing here yet.</p>
  {/if}
  <div bind:this={sentinel} style="height: 1px"></div>
</div>

<style>
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
