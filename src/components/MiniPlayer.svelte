<script lang="ts">
  import { current, next, player, toggle } from '../lib/player.svelte';
  import { artistLine } from '../lib/format';
  import Artwork from './Artwork.svelte';
  import Icon from './Icon.svelte';

  const track = $derived(current());
  const progress = $derived(player.duration ? (player.time / player.duration) * 100 : 0);
</script>

{#if track}
  <div class="mini">
    <div class="bar" style:width="{progress}%"></div>
    <button class="info" onclick={() => (player.expanded = true)} aria-label="Open now playing">
      <span class="thumb"><Artwork item={track} size={96} /></span>
      <span class="text">
        <span class="title ellipsis">{track.Name}</span>
        <span class="sub muted ellipsis">{player.error || artistLine(track)}</span>
      </span>
    </button>
    <button class="icon-btn" onclick={toggle} aria-label={player.playing ? 'Pause' : 'Play'}>
      {#if player.loading && !player.playing}<span class="spinner small"></span>{:else}<Icon name={player.playing ? 'pause' : 'play'} size={30} />{/if}
    </button>
    <button class="icon-btn" onclick={() => next()} aria-label="Next"><Icon name="next" /></button>
  </div>
{/if}

<style>
  .mini {
    position: fixed;
    left: 8px;
    right: 8px;
    bottom: calc(var(--nav-h) + var(--safe-b) + 6px);
    height: var(--mini-h);
    max-width: 760px;
    margin: 0 auto;
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 0 6px 0 8px;
    background: var(--surface-2);
    border-radius: 12px;
    overflow: hidden;
    z-index: 20;
    box-shadow: 0 4px 16px rgb(0 0 0 / 0.4);
  }
  .bar {
    position: absolute;
    left: 0;
    bottom: 0;
    height: 2px;
    background: var(--accent);
  }
  .info {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 10px;
    text-align: left;
  }
  .thumb {
    width: 46px;
    flex: none;
  }
  .text {
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .title {
    font-weight: 600;
    font-size: 0.95rem;
  }
  .sub {
    font-size: 0.8rem;
  }
  :global(html[data-tv]) .mini {
    left: calc(var(--rail-w) + 24px);
    right: 48px;
    bottom: var(--safe-b);
    max-width: none;
    margin: 0;
  }
  .small {
    width: 22px;
    height: 22px;
  }
</style>
