import { getState, setState } from './db';
import { downloads, offlineAudioUrl } from './downloads.svelte';
import { imageUrl, streamUrl, type Item } from './jellyfin';
import { settings } from './session.svelte';

export type Repeat = 'off' | 'all' | 'one';

interface SavedQueue {
  queue: Item[];
  original: Item[] | null;
  index: number;
  time: number;
  shuffle: boolean;
  repeat: Repeat;
}

const audio = new Audio();
audio.preload = 'auto';

export const player = $state({
  queue: [] as Item[],
  /** pre-shuffle order, kept so turning shuffle off restores it */
  original: null as Item[] | null,
  index: -1,
  playing: false,
  loading: false,
  time: 0,
  duration: 0,
  shuffle: false,
  repeat: 'off' as Repeat,
  offlineSource: false,
  error: '',
  expanded: false,
});

export function current(): Item | undefined {
  return player.queue[player.index];
}

let objectUrl: string | null = null;
let loadToken = 0;

async function load(index: number, autoplay: boolean, startAt = 0) {
  const track = player.queue[index];
  if (!track) return;
  const token = ++loadToken;
  player.index = index;
  player.time = startAt;
  player.duration = ticksToSeconds(track.RunTimeTicks);
  player.error = '';
  player.loading = autoplay;

  // Prefer the local copy; fall back to streaming. Streams are set synchronously so
  // that play() still runs inside the user's tap (iOS blocks it after an await).
  let local: string | null = null;
  if (downloads.tracks.has(track.Id)) {
    local = await offlineAudioUrl(track.Id).catch(() => null);
    if (token !== loadToken) {
      if (local) URL.revokeObjectURL(local);
      return;
    }
  }
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  objectUrl = local;
  player.offlineSource = !!local;
  // Web Audio only hears cross-origin streams fetched with CORS (otherwise it outputs silence).
  audio.crossOrigin = settings.visualizer || analyserNode ? 'anonymous' : null;
  readableSource = !!local || audio.crossOrigin === 'anonymous';
  audio.src = local ?? streamUrl(track.Id);
  if (startAt) audio.addEventListener('loadedmetadata', () => (audio.currentTime = startAt), { once: true });
  updateMediaSession(track);
  persist();
  if (autoplay) await play();
}

export async function play() {
  if (player.index < 0 && player.queue.length) return load(0, true);
  resumeContext();
  try {
    await audio.play();
  } catch (err) {
    if ((err as Error).name !== 'AbortError') player.error = (err as Error).message;
  }
}

export function pause() {
  audio.pause();
}

export function toggle() {
  if (audio.paused) play();
  else pause();
}

export function seek(seconds: number) {
  if (!Number.isFinite(seconds)) return;
  audio.currentTime = Math.max(0, seconds);
  player.time = audio.currentTime;
}

export function next(auto = false) {
  if (auto && player.repeat === 'one') return load(player.index, true);
  if (player.index + 1 < player.queue.length) return load(player.index + 1, true);
  if (player.repeat === 'all' && player.queue.length) return load(0, true);
  if (auto) {
    player.playing = false;
    seek(0);
  }
}

export function previous() {
  if (audio.currentTime > 3 || player.index === 0) return seek(0);
  return load(player.index - 1, true);
}

/** Replace the queue and start playing. */
export function playTracks(tracks: Item[], startIndex = 0, shuffle = false) {
  if (!tracks.length) return;
  const list = tracks.slice();
  if (shuffle) {
    // Shuffle everything; if a specific track was tapped, start with it.
    player.original = list.slice();
    const [first] = startIndex > 0 ? list.splice(startIndex, 1) : [];
    shuffleInPlace(list);
    player.queue = first ? [first, ...list] : list;
    player.shuffle = true;
    return load(0, true);
  }
  player.original = null;
  player.shuffle = false;
  player.queue = list;
  return load(startIndex, true);
}

export function playNext(tracks: Item[]) {
  if (player.index < 0) return playTracks(tracks);
  player.queue.splice(player.index + 1, 0, ...tracks);
  player.original?.push(...tracks);
  persist();
}

export function addToQueue(tracks: Item[]) {
  if (player.index < 0) return playTracks(tracks);
  player.queue.push(...tracks);
  player.original?.push(...tracks);
  persist();
}

export function jumpTo(index: number) {
  return load(index, true);
}

export function removeAt(index: number) {
  if (index === player.index) {
    player.queue.splice(index, 1);
    if (!player.queue.length) return clearQueue();
    return load(Math.min(index, player.queue.length - 1), !audio.paused);
  }
  player.queue.splice(index, 1);
  if (index < player.index) player.index--;
  persist();
}

export function move(from: number, to: number) {
  if (to < 0 || to >= player.queue.length || from === to) return;
  const [t] = player.queue.splice(from, 1);
  player.queue.splice(to, 0, t);
  if (player.index === from) player.index = to;
  else if (from < player.index && to >= player.index) player.index--;
  else if (from > player.index && to <= player.index) player.index++;
  persist();
}

export function clearQueue() {
  audio.pause();
  audio.removeAttribute('src');
  audio.load();
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  objectUrl = null;
  player.queue = [];
  player.original = null;
  player.index = -1;
  player.expanded = false;
  if ('mediaSession' in navigator) navigator.mediaSession.metadata = null;
  persist();
}

export function toggleShuffle() {
  const cur = current();
  if (!cur) {
    player.shuffle = !player.shuffle;
    return;
  }
  if (!player.shuffle) {
    player.original = player.queue.slice();
    const rest = player.queue.filter((_, i) => i !== player.index);
    shuffleInPlace(rest);
    player.queue = [cur, ...rest];
    player.index = 0;
    player.shuffle = true;
  } else {
    const orig = player.original ?? player.queue;
    player.queue = orig.slice();
    player.index = Math.max(0, orig.findIndex((t) => t.Id === cur.Id));
    player.original = null;
    player.shuffle = false;
  }
  persist();
}

export function cycleRepeat() {
  player.repeat = player.repeat === 'off' ? 'all' : player.repeat === 'all' ? 'one' : 'off';
  persist();
}

// ---------- audio element wiring ----------

const isRealTrack = () => audio.src !== SILENT_WAV && player.index >= 0;

audio.addEventListener('playing', () => {
  if (!isRealTrack()) return;
  player.playing = true;
  player.loading = false;
});
audio.addEventListener('pause', () => (player.playing = false));
audio.addEventListener('waiting', () => (player.loading = true));
audio.addEventListener('canplay', () => (player.loading = false));
audio.addEventListener('ended', () => next(true));
audio.addEventListener('durationchange', () => {
  if (Number.isFinite(audio.duration) && audio.duration > 0) player.duration = audio.duration;
});

let lastSaved = 0;
audio.addEventListener('timeupdate', () => {
  player.time = audio.currentTime;
  if ('mediaSession' in navigator && player.duration > 0) {
    try {
      navigator.mediaSession.setPositionState({ duration: player.duration, position: Math.min(audio.currentTime, player.duration), playbackRate: audio.playbackRate });
    } catch {
      /* some browsers reject position > duration during transcodes */
    }
  }
  if (Date.now() - lastSaved > 10_000) persist();
});

audio.addEventListener('error', () => {
  if (!isRealTrack()) return;
  player.loading = false;
  player.playing = false;
  const t = current();
  player.error = `Couldn't play ${t?.Name ?? 'track'}${player.offlineSource ? ' (downloaded copy)' : navigator.onLine ? '' : ' (offline, not downloaded)'}`;
});

// ---------- visualizer audio graph ----------
// Routing the element through Web Audio can't be undone, so the graph is built lazily:
// only once a visualizer asks for it, the current source is readable, and the browser
// will let the AudioContext run (a context created without a user gesture starts
// suspended, which would silence playback).

let audioCtx: AudioContext | null = null;
let analyserNode: AnalyserNode | null = null;
let readableSource = false;

/** The shared analyser, building the audio graph if allowed. `gesture`: called from a tap. */
export function analyser(gesture = false): AnalyserNode | null {
  if (!analyserNode) {
    const activated = gesture || (navigator.userActivation?.isActive ?? false);
    if (!readableSource || !activated || typeof AudioContext === 'undefined') return null;
    try {
      audioCtx = new AudioContext();
      const node = audioCtx.createAnalyser();
      node.fftSize = 2048;
      node.smoothingTimeConstant = 0.5;
      node.minDecibels = -90;
      node.maxDecibels = -20;
      audioCtx.createMediaElementSource(audio).connect(node);
      node.connect(audioCtx.destination);
      analyserNode = node;
    } catch {
      return null;
    }
  }
  resumeContext();
  return analyserNode;
}

function resumeContext() {
  if (audioCtx && audioCtx.state !== 'running') audioCtx.resume().catch(() => {});
}

// iOS suspends the context in the background; pick it back up on return.
document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && resumeContext());

// ---------- lock screen / notification controls ----------

function updateMediaSession(track: Item) {
  if (!('mediaSession' in navigator)) return;
  const art = imageUrl(track, 512);
  navigator.mediaSession.metadata = new MediaMetadata({
    title: track.Name,
    artist: track.Artists?.join(', ') ?? track.AlbumArtist ?? '',
    album: track.Album ?? '',
    artwork: art ? [{ src: art, sizes: '512x512', type: 'image/jpeg' }] : [],
  });
}

if ('mediaSession' in navigator) {
  const ms = navigator.mediaSession;
  const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
    ['play', () => play()],
    ['pause', () => pause()],
    ['previoustrack', () => previous()],
    ['nexttrack', () => next()],
    ['seekto', (d) => d.seekTime != null && seek(d.seekTime)],
    ['seekbackward', (d) => seek(audio.currentTime - (d.seekOffset ?? 10))],
    ['seekforward', (d) => seek(audio.currentTime + (d.seekOffset ?? 10))],
  ];
  for (const [action, fn] of handlers) {
    try {
      ms.setActionHandler(action, fn);
    } catch {
      /* unsupported action */
    }
  }
}

// ---------- persistence ----------

function persist() {
  lastSaved = Date.now();
  const saved: SavedQueue = {
    queue: player.queue,
    original: player.original,
    index: player.index,
    time: audio.currentTime || 0,
    shuffle: player.shuffle,
    repeat: player.repeat,
  };
  setState('queue', saved).catch(() => {});
}

/** Restore the last queue (paused) when the app opens. */
export async function restoreQueue() {
  const saved = await getState<SavedQueue>('queue').catch(() => undefined);
  if (!saved?.queue?.length || saved.index < 0) return;
  player.queue = saved.queue;
  player.original = saved.original;
  player.shuffle = saved.shuffle;
  player.repeat = saved.repeat;
  await load(saved.index, false, saved.time);
}

window.addEventListener('pagehide', persist);

// iOS only allows audio.play() from a user gesture until the element has played once.
// Downloaded tracks load asynchronously (blob from Cache Storage), so unlock the element
// with a silent clip on the first tap of the session.
function unlock() {
  if (!audio.src) {
    audio.src = SILENT_WAV;
    // Only pause if a real track hasn't replaced the clip in the meantime.
    audio.play().then(() => audio.src === SILENT_WAV && audio.pause(), () => {});
  }
}
window.addEventListener('pointerdown', unlock, { once: true, capture: true });

const SILENT_WAV = (() => {
  const samples = 800;
  const buf = new DataView(new ArrayBuffer(44 + samples));
  const str = (o: number, t: string) => [...t].forEach((c, i) => buf.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF'); buf.setUint32(4, 36 + samples, true); str(8, 'WAVE'); str(12, 'fmt ');
  buf.setUint32(16, 16, true); buf.setUint16(20, 1, true); buf.setUint16(22, 1, true);
  buf.setUint32(24, 8000, true); buf.setUint32(28, 8000, true); buf.setUint16(32, 1, true);
  buf.setUint16(34, 8, true); str(36, 'data'); buf.setUint32(40, samples, true);
  for (let i = 0; i < samples; i++) buf.setUint8(44 + i, 128);
  let bin = '';
  new Uint8Array(buf.buffer).forEach((b) => (bin += String.fromCharCode(b)));
  return `data:audio/wav;base64,${btoa(bin)}`;
})();

// ---------- helpers ----------

export function ticksToSeconds(ticks?: number) {
  return ticks ? ticks / 10_000_000 : 0;
}

function shuffleInPlace<T>(a: T[]) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
}
