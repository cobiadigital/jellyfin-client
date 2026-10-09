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
  const subtitle = $derived(
    kind === 'album' ? [item.AlbumArtist, item.ProductionYear].filter(Boolean).join(' · ') : kind === 'playlist' && item.ChildCount ? `${item.ChildCount} tracks` : '',
  );
</script>

<a class="card" href={href(kind, item.Id)}>
  <Artwork {item} round={kind === 'artist'} fallback={kind === 'artist' ? 'artist' : kind === 'playlist' ? 'playlist' : kind === 'genre' ? 'genre' : 'album'} />
  <div class="name ellipsis">
    {#if downloads.collections.has(item.Id)}<span class="dl"><Icon name="downloaded" size={14} /></span>{/if}
    {item.Name}
  </div>
  {#if subtitle}<div class="sub muted ellipsis">{subtitle}</div>{/if}
</a>

<style>
  .card {
    display: block;
    min-width: 0;
  }
  .name {
    margin-top: 6px;
    font-size: 0.92rem;
    font-weight: 600;
  }
  .sub {
    font-size: 0.8rem;
  }
  .dl {
    color: var(--accent);
    vertical-align: -2px;
  }
</style>
