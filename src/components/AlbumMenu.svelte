<script lang="ts">
  import { onMount } from 'svelte';
  import { albumTracks, playlistTracks, type Item } from '../lib/jellyfin';
  import { downloadCollection, downloads, getCollection, removeCollection } from '../lib/downloads.svelte';
  import { addToQueue, playNext, playTracks } from '../lib/player.svelte';
  import { pushBack } from '../lib/remote.svelte';
  import { href } from '../lib/router.svelte';
  import { showToast } from '../lib/toast.svelte';
  import Artwork from './Artwork.svelte';
  import Icon from './Icon.svelte';

  /** Context menu for an album or playlist, opened with the remote's Menu button. */
  let { item, onclose }: { item: Item; onclose: () => void } = $props();

  const isPlaylist = $derived(item.Type === 'Playlist');
  const artist = $derived(item.AlbumArtists?.[0]);
  const isDownloaded = $derived(downloads.collections.has(item.Id));

  onMount(() => pushBack(onclose));

  async function tracksOf(it: Item): Promise<Item[]> {
    try {
      return await (it.Type === 'Playlist' ? playlistTracks(it.Id) : albumTracks(it.Id));
    } catch (err) {
      const local = await getCollection(it.Id);
      if (local) return local.tracks;
      throw err;
    }
  }

  // Closing clears the prop, so take hold of the item before anything else.
  async function run(fn: (it: Item, tracks: Item[]) => void, message?: string) {
    const it = item;
    onclose();
    try {
      const t = await tracksOf(it);
      if (!t.length) return showToast('Nothing to play here', true);
      fn(it, t);
      if (message) showToast(message);
    } catch (err) {
      showToast(navigator.onLine ? (err as Error).message : "You're offline, and this hasn't been downloaded.", true);
    }
  }

  function removeDownload() {
    const id = item.Id;
    onclose();
    removeCollection(id);
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="scrim" onclick={onclose}>
  <div class="sheet" role="menu" tabindex="-1" onclick={(e) => e.stopPropagation()}>
    <div class="sheet-head">
      <span class="thumb"><Artwork {item} size={96} fallback={isPlaylist ? 'playlist' : 'album'} /></span>
      <span class="text"><span class="title ellipsis">{item.Name}</span><span class="sub muted ellipsis">{item.AlbumArtist ?? ''}</span></span>
    </div>
    <button role="menuitem" data-autofocus onclick={() => run((_, t) => playTracks(t, 0))}><Icon name="play" /> Play</button>
    <button role="menuitem" onclick={() => run((_, t) => playTracks(t, 0, true))}><Icon name="shuffle" /> Shuffle</button>
    <button role="menuitem" onclick={() => run((_, t) => playNext(t), 'Playing next')}><Icon name="playNext" /> Play next</button>
    <button role="menuitem" onclick={() => run((_, t) => addToQueue(t), 'Added to queue')}><Icon name="queueAdd" /> Add to queue</button>
    {#if isDownloaded}
      <button role="menuitem" onclick={removeDownload}><Icon name="downloaded" /> Remove download</button>
    {:else}
      <button role="menuitem" onclick={() => run((it, t) => downloadCollection(it, t))}><Icon name="download" /> Download</button>
    {/if}
    {#if artist}
      <a role="menuitem" href={href('artist', artist.Id)} onclick={onclose}><Icon name="artist" /> Go to artist</a>
    {/if}
  </div>
</div>

<style>
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
    font-weight: 600;
  }
  .sub {
    font-size: 0.82rem;
  }
</style>
