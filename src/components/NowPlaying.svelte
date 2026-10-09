<script lang="ts">
  import type { Component } from 'svelte';
  import { analyser, clearQueue, current, cycleRepeat, jumpTo, move, next, player, previous, removeAt, seek, toggle, toggleShuffle } from '../lib/player.svelte';
  import { artistLine, duration } from '../lib/format';
  import { href } from '../lib/router.svelte';
  import { saveSettings, settings } from '../lib/session.svelte';
  import Artwork from './Artwork.svelte';
  import Icon from './Icon.svelte';

  const track = $derived(current());
  let showQueue = $state(false);
  // While dragging the slider, show the drag position instead of the live time.
  let scrub = $state<number | null>(null);
  const shownTime = $derived(scrub ?? player.time);

  // Swiping the artwork cycles artwork → spectrum → scope; double-tap a visualizer for
  // full screen. The last view is remembered. Nothing visualizer-related loads while the
  // setting is off or the artwork is showing.
  type View = 'art' | 'spectrum' | 'scope';
  const view = $derived<View>(settings.visualizer ? settings.nowPlayingView : 'art');
  let full = $state(false);
  let Visualizer = $state<Component<{ mode: 'spectrum' | 'scope' }> | null>(null);
  const views = $derived<View[]>(full ? ['spectrum', 'scope'] : ['art', 'spectrum', 'scope']);

  $effect(() => {
    if (view !== 'art' && !Visualizer) import('./Visualizer.svelte').then((m) => (Visualizer = m.default));
  });

  function step(dir: number) {
    const i = views.indexOf(view);
    settings.nowPlayingView = views[(i + dir + views.length) % views.length];
    saveSettings();
    // Called from a tap or swipe, so the audio graph can start inside a user gesture.
    if (settings.nowPlayingView !== 'art') analyser(true);
  }

  function setFull(on: boolean) {
    full = on;
    if (on) document.documentElement.requestFullscreen?.().catch(() => {});
    else if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }

  let swipe: { x: number; y: number } | null = null;
  let lastTap = 0;

  function onpointerup(e: PointerEvent) {
    if (!swipe || !settings.visualizer) return;
    const dx = e.clientX - swipe.x;
    const dy = e.clientY - swipe.y;
    swipe = null;
    if (view !== 'art') analyser(true);
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      step(dx < 0 ? 1 : -1);
      lastTap = 0;
    } else if (view !== 'art' && Math.abs(dx) < 12 && Math.abs(dy) < 12) {
      if (e.timeStamp - lastTap < 350) {
        setFull(!full);
        lastTap = 0;
      } else lastTap = e.timeStamp;
    }
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      if (full) setFull(false);
      else close();
    } else if (settings.visualizer && (e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !(e.target instanceof HTMLInputElement)) {
      step(e.key === 'ArrowRight' ? 1 : -1);
    }
  }

  function close() {
    setFull(false);
    player.expanded = false;
    showQueue = false;
  }
</script>

<svelte:window {onkeydown} />
<svelte:document onfullscreenchange={() => !document.fullscreenElement && (full = false)} />

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
      <div
        class="stage"
        role="group"
        aria-roledescription="carousel"
        aria-label="Artwork and visualizer. Swipe or use arrow keys to switch."
        class:swipeable={settings.visualizer}
        class:full
        onpointerdown={(e) => (swipe = { x: e.clientX, y: e.clientY })}
        {onpointerup}
        onpointercancel={() => (swipe = null)}
      >
        {#if settings.visualizer && view !== 'art'}
          <div class="vis">{#if Visualizer}<Visualizer mode={view} />{/if}</div>
          {#if full}<button class="icon-btn exit" onclick={() => setFull(false)} aria-label="Exit full screen"><Icon name="close" /></button>{/if}
        {:else}
          <Artwork item={track} size={800} />
        {/if}
        {#if settings.visualizer && !full}
          <div class="dots" aria-hidden="true">
            {#each ['art', 'spectrum', 'scope'] as v (v)}<span class:on={view === v}></span>{/each}
          </div>
        {/if}
      </div>
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
  /* Phone landscape: artwork on the left, track info and controls on the right. */
  @media (orientation: landscape) and (max-height: 500px) {
    .np {
      display: grid;
      grid-template-columns: minmax(0, 45%) minmax(0, 1fr);
      grid-template-rows: auto 1fr auto auto auto;
      grid-template-areas: 'header header' 'stage .' 'stage meta' 'stage seek' 'stage controls';
      column-gap: 24px;
      padding-left: max(20px, env(safe-area-inset-left));
      padding-right: max(20px, env(safe-area-inset-right));
    }
    header {
      grid-area: header;
    }
    .stage,
    .queue {
      grid-area: stage;
      padding: 8px 0 16px;
    }
    .meta {
      grid-area: meta;
    }
    .seek {
      grid-area: seek;
    }
    .controls {
      grid-area: controls;
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
  /* Fills the space left over by the title and controls; the artwork is the largest
     square that fits in it (container units), so it never overlaps them. */
  .stage {
    position: relative;
    flex: 1;
    min-height: 0;
    container-type: size;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px 0;
  }
  .stage :global(.art) {
    flex: none;
    width: min(100cqw, 100cqh);
    box-shadow: 0 10px 40px rgb(0 0 0 / 0.5);
  }
  .swipeable {
    /* we handle horizontal swipes; also disables double-tap zoom */
    touch-action: pan-y;
    user-select: none;
    -webkit-user-select: none;
  }
  .vis {
    position: absolute;
    inset: 16px 0;
  }
  .stage.full {
    position: fixed;
    inset: 0;
    z-index: 10;
    padding: 0;
    background: #000;
  }
  .stage.full .vis {
    inset: var(--safe-t) 0 var(--safe-b);
  }
  .stage.full .vis :global(canvas) {
    border-radius: 0;
  }
  .exit {
    position: absolute;
    top: calc(var(--safe-t) + 8px);
    right: 8px;
    color: #fff;
    opacity: 0.6;
  }
  .dots {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 2px;
    display: flex;
    justify-content: center;
    gap: 6px;
  }
  .dots span {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--muted);
    opacity: 0.4;
  }
  .dots span.on {
    opacity: 1;
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
