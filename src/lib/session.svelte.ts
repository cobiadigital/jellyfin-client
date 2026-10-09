/**
 * Auth session and user settings. These are tiny and needed synchronously at startup
 * (to build stream/image URLs), so they live in localStorage. Everything large goes
 * to IndexedDB / Cache Storage.
 */

export interface Session {
  server: string; // e.g. https://jellyfin.example.com (no trailing slash)
  serverName: string;
  userId: string;
  userName: string;
  token: string;
  /** true for the built-in sample library: no server, no token (see demo.ts) */
  demo?: boolean;
}

export type StreamQuality = 'original' | 320 | 192 | 128;

export interface Settings {
  streamQuality: StreamQuality;
  downloadFormat: 'transcoded' | 'original';
  downloadBitrate: 320 | 192 | 128;
  /** storage allotted to the stream cache, in MB (0 turns it off) */
  cacheLimitMB: number;
  visualizer: boolean;
  /** last Now Playing view, restored when it reopens */
  nowPlayingView: 'art' | 'spectrum' | 'scope';
}

/** iOS (including iPadOS, which reports itself as a Mac) */
export const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

const SESSION_KEY = 'jf.session';
const SETTINGS_KEY = 'jf.settings';
const DEVICE_KEY = 'jf.deviceId';

// Off by default on iOS: routing audio through Web Audio there can stop background playback.
const defaultSettings: Settings = {
  streamQuality: 'original',
  downloadFormat: 'transcoded',
  downloadBitrate: 192,
  cacheLimitMB: 500,
  visualizer: !isIOS,
  nowPlayingView: 'art',
};

function load<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function save(key: string, value: unknown) {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode / quota: the session just won't persist */
  }
}

export const deviceId: string = (() => {
  let id = load<string>(DEVICE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    save(DEVICE_KEY, id);
  }
  return id;
})();

export const auth = $state<{ session: Session | null }>({ session: load<Session>(SESSION_KEY) });

export const isDemo = () => !!auth.session?.demo;

export function setSession(session: Session | null) {
  auth.session = session;
  save(SESSION_KEY, session);
}

export const settings = $state<Settings>({ ...defaultSettings, ...load<Partial<Settings>>(SETTINGS_KEY) });

export function saveSettings() {
  save(SETTINGS_KEY, $state.snapshot(settings));
}
