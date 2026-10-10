<script lang="ts">
  import { onMount } from 'svelte';
  import { exitApp, pushBack, remote } from '../lib/remote.svelte';

  onMount(() => pushBack(() => (remote.quit = false)));
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="scrim centered" onclick={() => (remote.quit = false)}>
  <div class="dialog" role="alertdialog" aria-modal="true" aria-label="Quit the app?" tabindex="-1" onclick={(e) => e.stopPropagation()}>
    <h2>Quit the app?</h2>
    <p class="muted">Music stops when you exit.</p>
    <div class="buttons">
      <button class="btn primary" data-autofocus onclick={() => (remote.quit = false)}>No</button>
      <button class="btn" onclick={exitApp}>Yes, exit</button>
    </div>
  </div>
</div>

<style>
  .centered {
    align-items: center;
  }
  .dialog {
    width: min(480px, 90vw);
    background: var(--surface);
    border-radius: 16px;
    padding: 24px;
    text-align: center;
  }
  h2 {
    margin: 0 0 6px;
  }
  .buttons {
    display: flex;
    gap: 12px;
    justify-content: center;
    margin-top: 20px;
  }
  .buttons .btn {
    min-width: 140px;
  }
</style>
