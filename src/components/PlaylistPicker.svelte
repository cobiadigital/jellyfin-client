<script lang="ts">
  import { addToPlaylist, ApiError, createPlaylist, userPlaylists, type Item } from '../lib/jellyfin';
  import { showToast } from '../lib/toast.svelte';
  import { pushBack } from '../lib/remote.svelte';
  import { onMount } from 'svelte';
  import { artistLine } from '../lib/format';
  import Artwork from './Artwork.svelte';
  import Icon from './Icon.svelte';

  let { track, onclose }: { track: Item; onclose: () => void } = $props();

  onMount(() => pushBack(onclose));

  let playlists = $state<Item[] | null>(null);
  let loadError = $state('');
  let busy = $state(false);
  let creating = $state(false);
  let newName = $state('');

  userPlaylists().then(
    (p) => (playlists = p),
    (err) => (loadError = describe(err)),
  );

  function describe(err: unknown) {
    if (!navigator.onLine) return "You're offline. Adding to a playlist needs a connection.";
    if (err instanceof ApiError && err.status === 403) return "You don't have permission to edit that playlist.";
    return (err as Error).message;
  }

  async function add(playlist: Item) {
    busy = true;
    try {
      await addToPlaylist(playlist.Id, [track.Id]);
      showToast(`Added to ${playlist.Name}`);
      onclose();
    } catch (err) {
      showToast(describe(err), true);
      busy = false;
    }
  }

  async function create(e: SubmitEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    busy = true;
    try {
      await createPlaylist(name, [track.Id]);
      showToast(`Created ${name}`);
      onclose();
    } catch (err) {
      showToast(describe(err), true);
      busy = false;
    }
  }
</script>


<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="scrim" onclick={onclose}>
  <div class="sheet" role="menu" tabindex="-1" aria-label="Add to playlist" onclick={(e) => e.stopPropagation()}>
    <div class="sheet-head">
      <span class="thumb"><Artwork item={track} size={96} /></span>
      <span class="text">
        <span class="muted small">Add to playlist</span>
        <span class="title ellipsis">{track.Name}</span>
        <span class="muted small ellipsis">{artistLine(track)}</span>
      </span>
    </div>

    {#if creating}
      <form class="new" onsubmit={create}>
        <!-- svelte-ignore a11y_autofocus -->
        <input bind:value={newName} placeholder="Playlist name" aria-label="Playlist name" autofocus maxlength="200" />
        <div class="new-actions">
          <button type="button" class="btn" onclick={() => (creating = false)}>Cancel</button>
          <button class="btn primary" disabled={busy || !newName.trim()}>Create</button>
        </div>
      </form>
    {:else}
      <button role="menuitem" onclick={() => (creating = true)} disabled={!!loadError}><Icon name="playlistAdd" /> New playlist</button>
    {/if}

    {#if loadError}
      <p class="error msg">{loadError}</p>
    {:else if !playlists}
      <div class="center"><div class="spinner"></div></div>
    {:else}
      {#each playlists as pl (pl.Id)}
        <button role="menuitem" onclick={() => add(pl)} disabled={busy}>
          <span class="pl-thumb"><Artwork item={pl} size={96} fallback="playlist" /></span>
          <span class="text">
            <span class="ellipsis">{pl.Name}</span>
            {#if pl.ChildCount != null}<span class="muted small">{pl.ChildCount} tracks</span>{/if}
          </span>
        </button>
      {:else}
        <p class="muted msg">No playlists yet. Create one above.</p>
      {/each}
    {/if}
  </div>
</div>

<style>
  .thumb {
    width: 44px;
    flex: none;
  }
  .pl-thumb {
    width: 40px;
    flex: none;
    margin: -6px 0;
  }
  .text {
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .title {
    font-weight: 600;
  }
  .small {
    font-size: 0.8rem;
  }
  .msg {
    padding: 8px 12px;
  }
  .new {
    display: grid;
    gap: 10px;
    padding: 8px;
  }
  .new-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }
</style>
