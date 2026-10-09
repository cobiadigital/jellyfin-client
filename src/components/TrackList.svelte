<script lang="ts">
  import type { Item } from '../lib/jellyfin';
  import { downloads } from '../lib/downloads.svelte';
  import { addToQueue, current, playNext, playTracks, player, ticksToSeconds } from '../lib/player.svelte';
  import { duration, artistLine } from '../lib/format';
  import { href } from '../lib/router.svelte';
  import Artwork from './Artwork.svelte';
  import Icon from './Icon.svelte';

  /** showArt: playlists/search show artwork; albums show track numbers. */
  let { tracks, showArt = false }: { tracks: Item[]; showArt?: boolean } = $props();

  let menuFor = $state<Item | null>(null);
  const multiDisc = $derived(new Set(tracks.map((t) => t.ParentIndexNumber ?? 1)).size > 1);
  const playingId = $derived(current()?.Id);
</script>

<ol class="tracks">
  {#each tracks as track, i (track.PlaylistItemId ?? track.Id)}
    {#if multiDisc && !showArt && (i === 0 || tracks[i - 1].ParentIndexNumber !== track.ParentIndexNumber)}
      <li class="disc muted">Disc {track.ParentIndexNumber ?? 1}</li>
    {/if}
    <li class="row" class:now={playingId === track.Id}>
      <button class="main" onclick={() => playTracks(tracks, i)}>
        {#if showArt}
          <span class="thumb"><Artwork item={track} size={96} /></span>
        {:else}
          <span class="num muted">{track.IndexNumber ?? ''}</span>
        {/if}
        <span class="text">
          <span class="title ellipsis">{track.Name}</span>
          <span class="sub muted ellipsis">
            {#if downloads.tracks.has(track.Id)}<span class="dl"><Icon name="downloaded" size={13} /></span>{/if}
            {artistLine(track)}{showArt && track.Album ? ` · ${track.Album}` : ''}
          </span>
        </span>
        <span class="dur muted">{duration(ticksToSeconds(track.RunTimeTicks))}</span>
      </button>
      <button class="icon-btn" aria-label="More options" onclick={() => (menuFor = track)}><Icon name="more" /></button>
    </li>
  {/each}
</ol>

{#if menuFor}
  {@const t = menuFor}
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="scrim" onclick={() => (menuFor = null)}>
    <div class="sheet" role="menu" tabindex="-1" onclick={(e) => e.stopPropagation()}>
      <div class="sheet-head">
        <span class="thumb"><Artwork item={t} size={96} /></span>
        <span class="text"><span class="title ellipsis">{t.Name}</span><span class="sub muted ellipsis">{artistLine(t)}</span></span>
      </div>
      <button role="menuitem" onclick={() => (playNext([t]), (menuFor = null))}><Icon name="playNext" /> Play next</button>
      <button role="menuitem" onclick={() => (addToQueue([t]), (menuFor = null))}><Icon name="queueAdd" /> Add to queue</button>
      {#if t.AlbumId}
        <a role="menuitem" href={href('album', t.AlbumId)} onclick={() => ((menuFor = null), (player.expanded = false))}><Icon name="album" /> Go to album</a>
      {/if}
      {#if t.ArtistItems?.[0]}
        <a role="menuitem" href={href('artist', t.ArtistItems[0].Id)} onclick={() => ((menuFor = null), (player.expanded = false))}><Icon name="artist" /> Go to artist</a>
      {/if}
    </div>
  </div>
{/if}

<style>
  .tracks {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .disc {
    font-size: 0.85rem;
    font-weight: 600;
    padding: 14px 0 4px;
  }
  .row {
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
    text-align: left;
  }
  .num {
    width: 24px;
    text-align: right;
    font-variant-numeric: tabular-nums;
    flex: none;
  }
  .thumb {
    width: 44px;
    flex: none;
  }
  .text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .title {
    font-weight: 500;
  }
  .sub {
    font-size: 0.82rem;
  }
  .dur {
    font-size: 0.82rem;
    font-variant-numeric: tabular-nums;
  }
  .now .title,
  .now .num {
    color: var(--accent);
  }
  .dl {
    color: var(--accent);
    vertical-align: -2px;
  }
  .scrim {
    position: fixed;
    inset: 0;
    background: rgb(0 0 0 / 0.5);
    z-index: 50;
    display: flex;
    align-items: flex-end;
    justify-content: center;
  }
  .sheet {
    width: 100%;
    max-width: 520px;
    background: var(--surface);
    border-radius: 16px 16px 0 0;
    padding: 12px 8px calc(12px + var(--safe-b));
  }
  .sheet-head {
    display: flex;
    gap: 12px;
    align-items: center;
    padding: 4px 8px 12px;
    border-bottom: 1px solid var(--surface-2);
    margin-bottom: 4px;
  }
  .sheet [role='menuitem'] {
    display: flex;
    align-items: center;
    gap: 16px;
    width: 100%;
    padding: 14px 12px;
    border-radius: 8px;
  }
  .sheet [role='menuitem']:active {
    background: var(--surface-2);
  }
</style>
