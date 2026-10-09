import { offlineAudioBlob } from './downloads.svelte';
import { cachedAudioBlob } from './streamcache.svelte';
import { analysisUrl, type Item } from './jellyfin';
import { ticksToSeconds } from './player.svelte';

/**
 * Visualizer data without touching playback. The track is decoded once (the downloaded
 * file, or a small mono MP3 from the server) and the spectrum/waveform is computed for
 * whatever time the player is at. Real-time Web Audio analysis needs the audio routed
 * through an AudioContext, which iOS suspends in the background and won't keep in step
 * with a second player.
 */

export interface Decoded {
  pcm: Float32Array; // mono
  rate: number;
}

const cache = new Map<string, Promise<Decoded>>();

/** Decoded audio for a track; the last couple are kept so skipping back is instant. */
export function decode(track: Item): Promise<Decoded> {
  let p = cache.get(track.Id);
  if (!p) {
    p = load(track);
    p.catch(() => cache.delete(track.Id));
    cache.set(track.Id, p);
    while (cache.size > 2) cache.delete(cache.keys().next().value!);
  }
  return p;
}

async function load(track: Item): Promise<Decoded> {
  // Keep the decoded buffer to a few tens of MB, even for long mixes.
  const seconds = ticksToSeconds(track.RunTimeTicks);
  if (seconds > 90 * 60) throw new Error('Track too long to visualize');
  const rate = seconds > 20 * 60 ? 11025 : 22050;

  const local = (await offlineAudioBlob(track.Id).catch(() => null)) ?? (await cachedAudioBlob(track.Id).catch(() => null));
  let bytes: ArrayBuffer;
  if (local) bytes = await local.arrayBuffer();
  else {
    const res = await fetch(analysisUrl(track.Id, rate));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    bytes = await res.arrayBuffer();
  }
  const buf = await new OfflineAudioContext(1, 1, rate).decodeAudioData(bytes);
  const pcm = new Float32Array(buf.length);
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const ch = buf.getChannelData(c);
    for (let i = 0; i < ch.length; i++) pcm[i] += ch[i] / buf.numberOfChannels;
  }
  return { pcm, rate: buf.sampleRate };
}

// ---------- FFT (matches AnalyserNode: Blackman window, |X|/N in dB) ----------

export const FFT_SIZE = 1024;
const MIN_DB = -90;
const MAX_DB = -20;

const blackman = Float32Array.from({ length: FFT_SIZE }, (_, i) => {
  const x = (2 * Math.PI * i) / FFT_SIZE;
  return 0.42 - 0.5 * Math.cos(x) + 0.08 * Math.cos(2 * x);
});
const bitrev = Uint16Array.from({ length: FFT_SIZE }, (_, i) => {
  let r = 0;
  for (let b = 1, v = i; b < FFT_SIZE; b <<= 1, v >>= 1) r = (r << 1) | (v & 1);
  return r;
});
const cos = Float32Array.from({ length: FFT_SIZE / 2 }, (_, i) => Math.cos((-2 * Math.PI * i) / FFT_SIZE));
const sin = Float32Array.from({ length: FFT_SIZE / 2 }, (_, i) => Math.sin((-2 * Math.PI * i) / FFT_SIZE));
const re = new Float32Array(FFT_SIZE);
const im = new Float32Array(FFT_SIZE);

/** Spectrum around time `t` into `out` (FFT_SIZE / 2 bins, 0..1 like getByteFrequencyData / 255). */
export function spectrum({ pcm, rate }: Decoded, t: number, out: Float32Array) {
  const start = Math.round(t * rate) - FFT_SIZE / 2;
  for (let i = 0; i < FFT_SIZE; i++) {
    const j = bitrev[i];
    const k = start + j;
    re[i] = k >= 0 && k < pcm.length ? pcm[k] * blackman[j] : 0;
    im[i] = 0;
  }
  for (let size = 2; size <= FFT_SIZE; size <<= 1) {
    const half = size >> 1;
    const step = FFT_SIZE / size;
    for (let i = 0; i < FFT_SIZE; i += size) {
      for (let j = 0; j < half; j++) {
        const a = i + j;
        const b = a + half;
        const wr = cos[j * step];
        const wi = sin[j * step];
        const tr = re[b] * wr - im[b] * wi;
        const ti = re[b] * wi + im[b] * wr;
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
      }
    }
  }
  for (let k = 0; k < FFT_SIZE / 2; k++) {
    const mag = Math.hypot(re[k], im[k]) / FFT_SIZE;
    const db = 20 * Math.log10(mag || 1e-12);
    out[k] = Math.min(1, Math.max(0, (db - MIN_DB) / (MAX_DB - MIN_DB)));
  }
}

/** Waveform starting at time `t` into `out` (-1..1), covering Winamp's ~13 ms scope window. */
export function waveform({ pcm, rate }: Decoded, t: number, out: Float32Array) {
  const start = Math.round(t * rate);
  const span = 0.013 * rate;
  for (let x = 0; x < out.length; x++) {
    const k = start + Math.floor((x * span) / out.length);
    out[x] = k >= 0 && k < pcm.length ? pcm[k] : 0;
  }
}
