<script lang="ts">
  import type { Item } from '../lib/jellyfin';
  import { downloads } from '../lib/downloads.svelte';
  import { href } from '../lib/router.svelte';
  import Artwork from './Artwork.svelte';
  import Icon from './Icon.svelte';

  let { item }: { item: Item } = $props();

  const kind = $derived(
    item.Type === 'MusicArtist' ? 'artist' : item.Type === 'Playlist' ? 'playlist' : item.Type === 'MusicGenre' ? 'genre' : 'album',
  );
  const meta = $derived(
    kind === 'album'
      ? [item.ProductionYear, item.ChildCount ? `${item.ChildCount} ${item.ChildCount === 1 ? 'track' : 'tracks'}` : ''].filter(Boolean).join(' · ')
      : kind === 'playlist' && item.ChildCount
        ? `${item.ChildCount} tracks`
        : '',
  );
</script>

<a class="row" href={href(kind, item.Id)}>
  <div class="art"><Artwork {item} size={96} round={kind === 'artist'} fallback={kind} /></div>
  <div class="text">
    <div class="name ellipsis">
      {#if downloads.collections.has(item.Id)}<span class="dl"><Icon name="downloaded" size={14} /></span>{/if}
      {item.Name}
    </div>
    {#if kind === 'album' && item.AlbumArtist}<div class="artist muted ellipsis">{item.AlbumArtist}</div>{/if}
  </div>
  {#if meta}<div class="meta muted">{meta}</div>{/if}
</a>

<style>
  .row {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 56px;
    padding: 6px 0;
  }
  .art {
    width: 48px;
    flex: none;
  }
  .text {
    flex: 1;
    min-width: 0;
  }
  .name {
    font-size: 0.95rem;
    font-weight: 600;
  }
  .artist {
    font-size: 0.8rem;
    font-weight: 700;
  }
  .meta {
    flex: none;
    text-align: right;
    font-size: 0.78rem;
  }
  .dl {
    color: var(--accent);
    vertical-align: -2px;
  }
</style>
