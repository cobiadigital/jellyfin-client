<script lang="ts">
  import { onMount } from 'svelte';
  import { current, debugSnapshot, player } from '../lib/player.svelte';
  import { downloads } from '../lib/downloads.svelte';
  import { streamCache } from '../lib/streamcache.svelte';
  import { netStats } from '../lib/netstats.svelte';
  import { bytes } from '../lib/format';

  let snap = $state(debugSnapshot());
  let fill = $state<number | null>(null); // seconds of audio buffered per second of wall time
  let online = $state(navigator.onLine);
  let conn = $state('');

  let lastEnd = 0;
  let lastAt = 0;
  let lastId = '';

  function sample() {
    snap = debugSnapshot();
    online = navigator.onLine;
    const c = (navigator as Navigator & { connection?: { effectiveType?: string; downlink?: number; rtt?: number } }).connection;
    conn = c ? `${c.effectiveType ?? '?'} ${c.downlink ?? '?'}Mbps ${c.rtt ?? '?'}ms` : 'n/a';

    const now = performance.now();
    const id = current()?.Id ?? '';
    // Growth of the buffered range between samples; only meaningful on the same track.
    fill = id === lastId && lastAt && snap.bufferedEnd >= lastEnd ? (snap.bufferedEnd - lastEnd) / ((now - lastAt) / 1000) : null;
    lastEnd = snap.bufferedEnd;
    lastAt = now;
    lastId = id;
  }

  onMount(() => {
    sample();
    const t = setInterval(sample, 500);
    return () => clearInterval(t);
  });

  const track = $derived(current());
  const source = $derived(!track ? '-' : downloads.tracks.has(track.Id) ? 'downloaded' : streamCache.tracks.has(track.Id) ? 'cached' : 'streaming');
  const stalledSec = $derived((netStats.stallMs / 1000).toFixed(1));
</script>

<pre class="debug" aria-hidden="true">{`src    ${source}${player.offlineSource ? ' (local)' : ''}
state  ${player.playing ? 'playing' : player.loading ? 'loading' : 'idle'}  rs${snap.readyState} ns${snap.networkState}
buffer ${snap.ahead.toFixed(1)}s ahead  fill ${fill === null ? '-' : fill.toFixed(1) + 'x'}
first  ${netStats.firstPlayMs ? netStats.firstPlayMs + ' ms' : '-'}
stalls ${netStats.stalls} (${stalledSec}s)  stalled ${netStats.stalledEvents}
errors ${netStats.errors}${netStats.lastError ? '  ' + netStats.lastError : ''}
cache  ${netStats.fetches} fetched ${bytes(netStats.fetchBytes)}  ${netStats.fetchKbps ? netStats.fetchKbps + ' kbps' : '-'}${netStats.fetchFails ? `\nfetch  ${netStats.fetchFails} failed: ${netStats.lastFetchError}` : ''}
net    ${online ? 'online' : 'OFFLINE'}  ${conn}`}</pre>

<style>
  .debug {
    position: fixed;
    top: calc(env(safe-area-inset-top, 0px) + 6px);
    right: 6px;
    z-index: 90;
    margin: 0;
    max-width: calc(100vw - 12px);
    padding: 6px 8px;
    border-radius: 6px;
    background: rgb(0 0 0 / 0.72);
    color: #9fe8a4;
    font: 11px/1.35 ui-monospace, SFMono-Regular, Menlo, monospace;
    white-space: pre-wrap;
    word-break: break-word;
    pointer-events: none;
  }
</style>
