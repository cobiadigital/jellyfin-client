<script lang="ts">
  import { logout } from '../lib/jellyfin';
  import { auth, isIOS, saveSettings, setSession, settings } from '../lib/session.svelte';
  import { clearApiCache } from '../lib/cache';
  import { clearQueue } from '../lib/player.svelte';

  $effect(() => {
    // Track every field so any change is saved.
    settings.streamQuality;
    settings.downloadFormat;
    settings.downloadBitrate;
    settings.visualizer;
    saveSettings();
  });

  async function signOut() {
    if (!confirm('Sign out? Downloaded music stays on this device.')) return;
    clearQueue();
    await logout();
    await clearApiCache();
    setSession(null);
    location.hash = '';
  }
</script>

<div class="page">
  <h1 class="page-title">Settings</h1>

  <section>
    <h2>Account</h2>
    <p>Signed in as <strong>{auth.session?.userName}</strong> on <strong>{auth.session?.serverName}</strong></p>
    <p class="muted small">{auth.session?.server}</p>
    <button class="btn" onclick={signOut}>Sign out</button>
  </section>

  <section>
    <h2>Streaming</h2>
    <label>
      Quality
      <select
        value={String(settings.streamQuality)}
        onchange={(e) => {
          const v = e.currentTarget.value;
          settings.streamQuality = v === 'original' ? 'original' : (+v as 320 | 192 | 128);
        }}
      >
        <option value="original">Original (direct play when possible)</option>
        <option value="320">Transcode to 320 kbps</option>
        <option value="192">Transcode to 192 kbps</option>
        <option value="128">Transcode to 128 kbps</option>
      </select>
    </label>
  </section>

  <section>
    <h2>Downloads</h2>
    <label>
      Format
      <select bind:value={settings.downloadFormat}>
        <option value="transcoded">Transcoded AAC (smaller, plays everywhere)</option>
        <option value="original">Original file (largest, best quality)</option>
      </select>
    </label>
    {#if settings.downloadFormat === 'transcoded'}
      <label>
        Bitrate
        <select value={String(settings.downloadBitrate)} onchange={(e) => (settings.downloadBitrate = +e.currentTarget.value as 320 | 192 | 128)}>
          <option value="320">320 kbps (~2.4 MB/min)</option>
          <option value="192">192 kbps (~1.4 MB/min)</option>
          <option value="128">128 kbps (~1 MB/min)</option>
        </select>
      </label>
    {:else}
      <p class="muted small">Originals are stored as-is. Some formats (for example ALAC in Chrome, or FLAC on older iPhones) may not play offline in this browser.</p>
    {/if}
    <p class="muted small">Applies to new downloads. Existing downloads keep their format.</p>
  </section>

  <section>
    <h2>Now Playing</h2>
    <label class="check">
      <input type="checkbox" bind:checked={settings.visualizer} />
      Winamp-style visualizer
    </label>
    <p class="muted small">Swipe the artwork on Now Playing to show the spectrum analyzer, then the oscilloscope. Double-tap a visualizer for full screen. When you turn it on, streamed music shows from the next track.</p>
    {#if isIOS}
      <p class="muted small">On iPhone and iPad the visualizer can stop music when the app is in the background or the screen locks. Once it has run, reload the app to restore normal background playback.</p>
    {/if}
  </section>

  <section>
    <h2>About</h2>
    <p class="muted small">Jellyfin Music PWA v0.1.0. Inspired by Finamp. Audio downloads are kept in this browser's Cache Storage; library data is cached in IndexedDB so screens you've visited work offline.</p>
  </section>
</div>

<style>
  section {
    background: var(--surface);
    border-radius: var(--radius);
    padding: 4px 16px 16px;
    margin-bottom: 16px;
  }
  h2 {
    font-size: 1rem;
    margin: 14px 0 10px;
  }
  label {
    display: grid;
    gap: 6px;
    margin-bottom: 12px;
    color: var(--muted);
    font-size: 0.9rem;
  }
  label.check {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 44px;
    margin-bottom: 0;
    color: var(--text);
    font-size: 1rem;
  }
  label.check input {
    flex: none;
    padding: 0;
    width: 22px;
    height: 22px;
    accent-color: var(--accent);
  }
  .small {
    font-size: 0.82rem;
  }
  p {
    margin: 6px 0;
  }
</style>
