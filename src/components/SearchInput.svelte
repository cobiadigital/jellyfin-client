<script lang="ts">
  import Icon from './Icon.svelte';

  let {
    value = $bindable(''),
    placeholder = '',
    autofocus = false,
  }: { value: string; placeholder?: string; autofocus?: boolean } = $props();

  let input: HTMLInputElement;

  function clear() {
    value = '';
    input.focus();
  }
</script>

<div class="wrap">
  <!-- svelte-ignore a11y_autofocus -->
  <input bind:this={input} type="search" bind:value {placeholder} {autofocus} enterkeyhint="search" aria-label={placeholder} />
  {#if value}
    <!-- preventDefault on pointerdown keeps the keyboard open instead of blurring the field -->
    <button class="clear" type="button" aria-label="Clear" onpointerdown={(e) => e.preventDefault()} onclick={clear}><Icon name="close" size={20} /></button>
  {/if}
</div>

<style>
  .wrap {
    position: relative;
    width: 100%;
  }
  input {
    min-height: 44px;
    padding-right: 44px; /* room for the clear button */
  }
  /* The browser's own clear control is missing or tiny on some phones; use ours. */
  input::-webkit-search-cancel-button,
  input::-webkit-search-decoration {
    -webkit-appearance: none;
    appearance: none;
  }
  .clear {
    position: absolute;
    top: 0;
    right: 0;
    width: 44px;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--muted, var(--text));
    opacity: 0.8;
  }
</style>
