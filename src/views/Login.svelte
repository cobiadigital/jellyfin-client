<script lang="ts">
  import { login, quickConnectStart, quickConnectCheck, type QuickConnectRequest } from '../lib/jellyfin';
  import { onDestroy } from 'svelte';
  import { setSession } from '../lib/session.svelte';
  import { enterDemo } from '../lib/demo';

  let server = $state(localStorage.getItem('jf.lastServer') ?? '');
  let username = $state('');
  let password = $state('');
  let busy = $state(false);
  let error = $state('');

  let qc = $state<QuickConnectRequest | null>(null);
  let qcTimer: ReturnType<typeof setTimeout> | undefined;
  let qcRun = 0; // bumped to cancel a running poll ($state proxies don't compare equal to the raw object)
  const QC_POLL_MS = 3000;

  function finish(session: Awaited<ReturnType<typeof login>>) {
    try {
      localStorage.setItem('jf.lastServer', session.server);
    } catch {}
    setSession(session);
  }

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    busy = true;
    error = '';
    try {
      finish(await login(server, username, password));
    } catch (err) {
      error = (err as Error).message;
    } finally {
      busy = false;
    }
  }

  function stopQuickConnect() {
    clearTimeout(qcTimer);
    qcRun++;
    qc = null;
  }

  async function startQuickConnect() {
    if (!server.trim()) {
      error = 'Enter your server URL first.';
      return;
    }
    stopQuickConnect();
    busy = true;
    error = '';
    try {
      const req = await quickConnectStart(server);
      qc = req;
      poll(req, qcRun);
    } catch (err) {
      error = (err as Error).message;
    } finally {
      busy = false;
    }
  }

  function poll(req: QuickConnectRequest, run: number) {
    qcTimer = setTimeout(async () => {
      if (run !== qcRun) return; // cancelled or replaced
      try {
        const session = await quickConnectCheck(req);
        if (run !== qcRun) return;
        if (session) {
          stopQuickConnect();
          finish(session);
        } else poll(req, run);
      } catch (err) {
        if (run !== qcRun) return;
        stopQuickConnect();
        error = (err as Error).message;
      }
    }, QC_POLL_MS);
  }

  onDestroy(stopQuickConnect);
</script>

<main class="login">
  <img src="/icons/icon.svg" alt="" width="72" height="72" />
  <h1>Jellyfin Music</h1>
  {#if qc}
    <section class="qc" aria-live="polite">
      <p class="muted">On a device already signed in to Jellyfin, open your profile, then <b>Quick Connect</b>, and enter this code:</p>
      <p class="code">{qc.code}</p>
      <p class="muted note">Waiting for approval…</p>
      <button type="button" class="btn" onclick={stopQuickConnect}>Cancel</button>
    </section>
  {:else}
  <form onsubmit={submit}>
    <label>Server URL<input bind:value={server} type="url" inputmode="url" autocomplete="url" placeholder="https://jellyfin.example.com" required /></label>
    <label>Username<input bind:value={username} autocomplete="username" autocapitalize="off" required /></label>
    <label>Password<input bind:value={password} type="password" autocomplete="current-password" /></label>
    {#if error}<p class="error">{error}</p>{/if}
    <button class="btn primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
  </form>
  <button type="button" class="btn demo" onclick={startQuickConnect} disabled={busy}>Sign in with Quick Connect</button>
  <p class="muted note demo-note">Uses only the server URL above. No password to type.</p>
  {/if}
  <button type="button" class="btn demo" onclick={enterDemo}>Try demo</button>
  <p class="muted note demo-note">Browse a built-in sample library with no server or sign-in.</p>
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
  .qc {
    display: grid;
    gap: 12px;
    justify-items: center;
  }
  .code {
    margin: 4px 0;
    font-size: 2.6rem;
    font-weight: 700;
    letter-spacing: 0.18em;
    font-variant-numeric: tabular-nums;
  }
  .note {
    font-size: 0.8rem;
    margin-top: 24px;
  }
  .demo {
    width: 100%;
    margin-top: 14px;
  }
  .demo-note {
    margin-top: 8px;
  }
</style>
