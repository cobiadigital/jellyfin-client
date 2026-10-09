<script lang="ts">
  import { toast } from '../lib/toast.svelte';
</script>

{#if toast.message}
  <div class="toast" class:error={toast.error} role="status" aria-live="polite">{toast.message}</div>
{/if}

<style>
  .toast {
    position: fixed;
    left: 16px;
    right: 16px;
    bottom: calc(var(--nav-h) + var(--mini-h) + var(--safe-b) + 16px);
    max-width: 480px;
    margin: 0 auto;
    z-index: 60;
    padding: 12px 16px;
    border-radius: 10px;
    background: var(--text);
    color: var(--bg);
    font-weight: 600;
    font-size: 0.9rem;
    box-shadow: 0 4px 16px rgb(0 0 0 / 0.4);
  }
  .toast.error {
    background: var(--danger);
    color: #fff;
  }
</style>
