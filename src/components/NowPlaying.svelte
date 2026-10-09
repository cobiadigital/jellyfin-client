<script lang="ts">
  import { clearQueue, current, cycleRepeat, jumpTo, move, next, player, previous, removeAt, seek, toggle, toggleShuffle } from '../lib/player.svelte';
  import { artistLine, duration } from '../lib/format';
  import { href } from '../lib/router.svelte';
  import { settings } from '../lib/session.svelte';
  import Artwork from './Artwork.svelte';
  import Icon from './Icon.svelte';
  import Visualizer from './Visualizer.svelte';

  const track = $derived(current());
  let showQueue = $state(false);
  // While dragging the slider, show the drag position instead of the live time.
  let scrub = $state<number | null>(null);
  const shownTime = $derived(scrub ?? player.time);
  // Short screens (phone landscape) have no room for the visualizer.
  let innerHeight = $state(window.innerHeight);

  function close() {
    player.expanded = false;
    showQueue = false;
  }
</script>

<svelte:window bind:innerHeight onkeydown={(e) => e.key === 'Escape' && close()} />

{#if track}
  <div class="np" role="dialog" aria-label="Now playing">
    <header>
      <button class="icon-btn" onclick={close} aria-label="Close"><Icon name="down" size={30} /></button>
      <span class="from muted ellipsis">{player.offlineSource ? 'Playing downloaded copy' : 'Streaming'}</span>
      <button class="icon-btn" class:on={showQueue} onclick={() => (showQueue = !showQueue)} aria-label="Queue"><Icon name="queue" /></button>
    </header>

    {#if showQueue}
      <div class="queue">
        <div class="queue-head">
          <h2>Queue</h2>
          <button class="btn" onclick={clearQueue}>Clear</button>
        </div>
        <ol>
          {#each player.queue as t, i (i + ':' + t.Id)}
            <li class:now={i === player.index} class:past={i < player.index}>
              <button class="q-main" onclick={() => jumpTo(i)}>
                <span class="q-thumb"><Artwork item={t} size={96} /></span>
                <span class="q-text"><span class="ellipsis">{t.Name}</span><span class="muted ellipsis small">{artistLine(t)}</span></span>
              </button>
              <button class="icon-btn" aria-label="Move up" disabled={i === 0} onclick={() => move(i, i - 1)}><Icon name="up" size={20} /></button>
              <button class="icon-btn" aria-label="Remove" onclick={() => removeAt(i)}><Icon name="close" size={20} /></button>
            </li>
          {/each}
        </ol>
      </div>
    {:else}
      <div class="art"><Artwork item={track} size={800} /></div>
      {#if settings.visualizer && innerHeight > 500}<Visualizer />{/if}
      <div class="meta">
        <div class="title ellipsis">{track.Name}</div>
        <div class="muted ellipsis">
          {#if track.ArtistItems?.[0]}<a href={href('artist', track.ArtistItems[0].Id)} onclick={close}>{artistLine(track)}</a>{:else}{artistLine(track)}{/if}
          {#if track.Album && track.AlbumId}· <a href={href('album', track.AlbumId)} onclick={close}>{track.Album}</a>{/if}
        </div>
        {#if player.error}<div class="error small">{player.error}</div>{/if}
      </div>
    {/if}

    <div class="seek">
      <input
        type="range"
        min="0"
        max={player.duration || 1}
        step="0.5"
        value={shownTime}
        oninput={(e) => (scrub = +e.currentTarget.value)}
        onchange={(e) => {
          seek(+e.currentTarget.value);
          scrub = null;
        }}
        aria-label="Seek"
      />
      <div class="times muted small"><span>{duration(shownTime)}</span><span>{duration(player.duration)}</span></div>
    </div>

    <div class="controls">
      <button class="icon-btn" class:on={player.shuffle} onclick={toggleShuffle} aria-label="Shuffle"><Icon name="shuffle" /></button>
      <button class="icon-btn" onclick={previous} aria-label="Previous"><Icon name="prev" size={36} /></button>
      <button class="play" onclick={toggle} aria-label={player.playing ? 'Pause' : 'Play'}>
        {#if player.loading && !player.playing}<span class="spinner"></span>{:else}<Icon name={player.playing ? 'pause' : 'play'} size={40} />{/if}
      </button>
      <button class="icon-btn" onclick={() => next()} aria-label="Next"><Icon name="next" size={36} /></button>
      <button class="icon-btn" class:on={player.repeat !== 'off'} onclick={cycleRepeat} aria-label="Repeat: {player.repeat}">
        <Icon name={player.repeat === 'one' ? 'repeatOne' : 'repeat'} />
      </button>
    </div>
  </div>
{/if}

<style>
  .np {
    position: fixed;
    inset: 0;
    z-index: 40;
    background: linear-gradient(180deg, #1d2630 0%, var(--bg) 70%);
    display: flex;
    flex-direction: column;
    padding: calc(var(--safe-t) + 8px) 20px calc(var(--safe-b) + 20px);
    max-width: 560px;
    margin: 0 auto;
  }
  @media (min-width: 560px) {
    .np {
      max-width: none;
      padding-left: calc(50vw - 260px);
      padding-right: calc(50vw - 260px);
    }
  }
  header {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .from {
    flex: 1;
    text-align: center;
    font-size: 0.85rem;
  }
  .art {
    flex: 1;
    min-height: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px 0;
  }
  .art :global(.art) {
    width: min(100%, 50dvh);
    box-shadow: 0 10px 40px rgb(0 0 0 / 0.5);
  }
  .meta {
    padding: 8px 0;
  }
  .title {
    font-size: 1.4rem;
    font-weight: 700;
  }
  .meta a {
    text-decoration: underline;
    text-decoration-color: #fff3;
  }
  .small {
    font-size: 0.8rem;
  }
  .seek {
    padding-top: 8px;
  }
  .seek input {
    width: 100%;
    padding: 0;
    border: 0;
    background: none;
    accent-color: var(--accent);
    height: 32px;
  }
  .times {
    display: flex;
    justify-content: space-between;
    font-variant-numeric: tabular-nums;
  }
  .controls {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-top: 12px;
  }
  .play {
    width: 72px;
    height: 72px;
    border-radius: 50%;
    background: var(--text);
    color: var(--bg);
    display: grid;
    place-items: center;
  }
  .queue {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    margin: 8px -8px;
  }
  .queue-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 8px;
  }
  .queue h2 {
    font-size: 1.2rem;
    margin: 8px 0;
  }
  .queue ol {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .queue li {
    display: flex;
    align-items: center;
    padding: 0 0 0 8px;
  }
  .queue li.past {
    opacity: 0.5;
  }
  .queue li.now .q-text > :first-child {
    color: var(--accent);
    font-weight: 600;
  }
  .q-main {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 0;
    text-align: left;
  }
  .q-thumb {
    width: 40px;
    flex: none;
  }
  .q-text {
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .icon-btn:disabled {
    opacity: 0.3;
  }
</style>
