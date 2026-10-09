<script lang="ts">
  import { login } from '../lib/jellyfin';
  import { setSession } from '../lib/session.svelte';

  let server = $state(localStorage.getItem('jf.lastServer') ?? '');
  let username = $state('');
  let password = $state('');
  let busy = $state(false);
  let error = $state('');

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    busy = true;
    error = '';
    try {
      const session = await login(server, username, password);
      try {
        localStorage.setItem('jf.lastServer', session.server);
      } catch {}
      setSession(session);
    } catch (err) {
      error = (err as Error).message;
    } finally {
      busy = false;
    }
  }
</script>

<main class="login">
  <img src="/icons/icon.svg" alt="" width="72" height="72" />
  <h1>Jellyfin Music</h1>
  <form onsubmit={submit}>
    <label>Server URL<input bind:value={server} type="url" inputmode="url" autocomplete="url" placeholder="https://jellyfin.example.com" required /></label>
    <label>Username<input bind:value={username} autocomplete="username" autocapitalize="off" required /></label>
    <label>Password<input bind:value={password} type="password" autocomplete="current-password" /></label>
    {#if error}<p class="error">{error}</p>{/if}
    <button class="btn primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
  </form>
  <p class="muted note">Your server must be reachable over HTTPS from this device. The password is sent only to your server; this app stores just the access token it returns.</p>
</main>

<style>
  .login {
    max-width: 400px;
    margin: 0 auto;
    padding: calc(var(--safe-t) + 48px) 16px 32px;
    text-align: center;
  }
  h1 {
    margin: 12px 0 24px;
  }
  form {
    display: grid;
    gap: 14px;
    text-align: left;
  }
  label {
    display: grid;
    gap: 6px;
    font-size: 0.9rem;
    color: var(--muted);
  }
  .note {
    font-size: 0.8rem;
    margin-top: 24px;
  }
</style>
