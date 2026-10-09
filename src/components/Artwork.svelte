<script lang="ts">
  import { imageUrl, type Item } from '../lib/jellyfin';
  import Icon, { type IconName } from './Icon.svelte';

  let { item, size = 300, round = false, fallback = 'album' }: { item: Item | undefined; size?: number; round?: boolean; fallback?: IconName } = $props();

  const src = $derived(imageUrl(item, size));
  let failed = $state(false);
  $effect(() => {
    src;
    failed = false;
  });
</script>

<div class="art" class:round>
  {#if src && !failed}
    <!-- crossorigin lets the service worker cache a readable (non-opaque) copy -->
    <img {src} alt="" loading="lazy" decoding="async" crossorigin="anonymous" onerror={() => (failed = true)} />
  {:else}
    <span class="fallback"><Icon name={fallback} size={40} /></span>
  {/if}
</div>

<style>
  .art {
    position: relative;
    aspect-ratio: 1;
    width: 100%;
    border-radius: 8px;
    overflow: hidden;
    background: var(--surface-2);
  }
  .round {
    border-radius: 50%;
  }
  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  .fallback {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    color: var(--muted);
  }
</style>
