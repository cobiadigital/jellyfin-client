/**
 * Counters behind the debug overlay (Settings > Debug). Cheap to keep running:
 * the player and stream cache just bump numbers here; the overlay reads them.
 */
const blank = () => ({
  loads: 0,
  firstPlayMs: 0, // load start to audio actually playing, for the latest track
  stalls: 0, // playback ran dry after it had started
  stallMs: 0,
  stalledEvents: 0, // browser reports the stream stopped delivering data
  errors: 0,
  lastError: '',
  fetches: 0, // background stream-cache copies
  fetchBytes: 0,
  fetchMs: 0,
  fetchKbps: 0,
  fetchFails: 0,
  lastFetchError: '',
});

export const netStats = $state(blank());

let loadStartedAt = 0;
let stallStartedAt = 0;

export function statLoadStart() {
  netStats.loads++;
  loadStartedAt = performance.now();
  stallStartedAt = 0;
}

export function statPlaying() {
  const now = performance.now();
  if (loadStartedAt) {
    netStats.firstPlayMs = Math.round(now - loadStartedAt);
    loadStartedAt = 0;
  }
  if (stallStartedAt) {
    netStats.stallMs += Math.round(now - stallStartedAt);
    stallStartedAt = 0;
  }
}

/** Only counts as a stall once the track has started; the first wait is just loading. */
export function statWaiting() {
  if (loadStartedAt || stallStartedAt) return;
  netStats.stalls++;
  stallStartedAt = performance.now();
}

export const statStalledEvent = () => netStats.stalledEvents++;

export function statError(message: string) {
  netStats.errors++;
  netStats.lastError = message;
}

export function statFetch(bytes: number, ms: number) {
  netStats.fetches++;
  netStats.fetchBytes += bytes;
  netStats.fetchMs += ms;
  netStats.fetchKbps = ms > 0 ? Math.round((bytes * 8) / ms) : 0; // bits per ms = kbps
}

export function statFetchFail(message: string) {
  netStats.fetchFails++;
  netStats.lastFetchError = message;
}

export function resetNetStats() {
  Object.assign(netStats, blank());
  loadStartedAt = 0;
  stallStartedAt = 0;
}
