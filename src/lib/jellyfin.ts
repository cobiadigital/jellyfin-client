import { auth, deviceId, settings, type Session } from './session.svelte';
import { cachedJson } from './cache';

/** The subset of Jellyfin's BaseItemDto this app uses. */
export interface Item {
  Id: string;
  Name: string;
  Type: 'MusicAlbum' | 'MusicArtist' | 'Audio' | 'Playlist' | 'MusicGenre' | string;
  ServerId?: string;
  AlbumId?: string;
  Album?: string;
  AlbumArtist?: string;
  AlbumArtists?: { Id: string; Name: string }[];
  Artists?: string[];
  ArtistItems?: { Id: string; Name: string }[];
  ProductionYear?: number;
  IndexNumber?: number;
  ParentIndexNumber?: number;
  RunTimeTicks?: number;
  ChildCount?: number;
  SongCount?: number;
  AlbumCount?: number;
  ImageTags?: Record<string, string>;
  AlbumPrimaryImageTag?: string;
  PlaylistItemId?: string;
  UserData?: { IsFavorite?: boolean; PlayCount?: number };
}

export interface ItemsResult {
  Items: Item[];
  TotalRecordCount: number;
  StartIndex: number;
}

const CLIENT = 'Jellyfin PWA';
const VERSION = '0.1.0';

function deviceName() {
  const ua = navigator.userAgent;
  if (/iPhone|iPad/.test(ua)) return 'iOS PWA';
  if (/Android/.test(ua)) return 'Android PWA';
  return 'Browser PWA';
}

function authHeader(token?: string) {
  let h = `MediaBrowser Client="${CLIENT}", Device="${deviceName()}", DeviceId="${deviceId}", Version="${VERSION}"`;
  if (token) h += `, Token="${token}"`;
  return h;
}

export function normalizeServer(input: string) {
  let url = input.trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  return url;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

function requireSession(): Session {
  if (!auth.session) throw new ApiError('Not signed in', 401);
  return auth.session;
}

async function request<T>(path: string, init: RequestInit = {}, session = requireSession()): Promise<T> {
  const res = await fetch(`${session.server}${path}`, {
    ...init,
    headers: { Authorization: authHeader(session.token), 'Content-Type': 'application/json', ...init.headers },
  });
  if (!res.ok) throw new ApiError(`${res.status} ${res.statusText}`, res.status);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

function qs(params: Record<string, string | number | boolean | undefined>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') p.set(k, String(v));
  return p.toString();
}

/** GET with an IndexedDB fallback, so screens you've visited still render offline. */
function get<T>(path: string, params: Record<string, string | number | boolean | undefined> = {}) {
  const s = requireSession();
  const full = `${path}?${qs(params)}`;
  return cachedJson<T>(`${s.userId}:${full}`, () => request<T>(full));
}

// ---------- auth ----------

export async function login(serverInput: string, username: string, password: string): Promise<Session> {
  const server = normalizeServer(serverInput);
  let info: { ServerName: string };
  try {
    const res = await fetch(`${server}/System/Info/Public`);
    if (!res.ok) throw new Error();
    info = await res.json();
  } catch {
    throw new Error(
      `Couldn't reach a Jellyfin server at ${server}. Check the URL, that it uses HTTPS, and that it's reachable from this device.`,
    );
  }
  const res = await fetch(`${server}/Users/AuthenticateByName`, {
    method: 'POST',
    headers: { Authorization: authHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ Username: username, Pw: password }),
  });
  if (res.status === 401) throw new Error('Wrong username or password.');
  if (!res.ok) throw new Error(`Sign-in failed (${res.status}).`);
  const data = await res.json();
  return { server, serverName: info.ServerName, userId: data.User.Id, userName: data.User.Name, token: data.AccessToken };
}

export async function logout() {
  try {
    await request('/Sessions/Logout', { method: 'POST' });
  } catch {
    /* offline or token already revoked */
  }
}

// ---------- library ----------

const LIST_FIELDS = 'PrimaryImageAspectRatio,ChildCount,ProductionYear';
const TRACK_FIELDS = 'PrimaryImageAspectRatio';

export type LibraryKind = 'albums' | 'artists' | 'playlists' | 'genres';

export function libraryPage(kind: LibraryKind, startIndex: number, limit = 60) {
  const s = requireSession();
  const common = { userId: s.userId, StartIndex: startIndex, Limit: limit, SortBy: 'SortName', SortOrder: 'Ascending', EnableTotalRecordCount: true };
  switch (kind) {
    case 'albums':
      return get<ItemsResult>('/Items', { ...common, IncludeItemTypes: 'MusicAlbum', Recursive: true, Fields: LIST_FIELDS, ImageTypeLimit: 1, EnableImageTypes: 'Primary' });
    case 'artists':
      return get<ItemsResult>('/Artists/AlbumArtists', { ...common, Fields: LIST_FIELDS, ImageTypeLimit: 1, EnableImageTypes: 'Primary' });
    case 'playlists':
      return get<ItemsResult>('/Items', { ...common, IncludeItemTypes: 'Playlist', MediaTypes: 'Audio', Recursive: true, Fields: LIST_FIELDS });
    case 'genres':
      return get<ItemsResult>('/MusicGenres', { ...common, Fields: LIST_FIELDS });
  }
}

export function getItem(id: string) {
  return get<Item>(`/Items/${id}`, { userId: requireSession().userId });
}

export async function albumTracks(albumId: string) {
  const r = await get<ItemsResult>('/Items', {
    userId: requireSession().userId,
    ParentId: albumId,
    IncludeItemTypes: 'Audio',
    Recursive: true,
    SortBy: 'ParentIndexNumber,IndexNumber,SortName',
    Fields: TRACK_FIELDS,
  });
  return r.Items;
}

export async function playlistTracks(playlistId: string) {
  const r = await get<ItemsResult>(`/Playlists/${playlistId}/Items`, { userId: requireSession().userId, Fields: TRACK_FIELDS });
  return r.Items;
}

export async function artistAlbums(artistId: string) {
  const r = await get<ItemsResult>('/Items', {
    userId: requireSession().userId,
    AlbumArtistIds: artistId,
    IncludeItemTypes: 'MusicAlbum',
    Recursive: true,
    SortBy: 'ProductionYear,SortName',
    SortOrder: 'Descending',
    Fields: LIST_FIELDS,
  });
  return r.Items;
}

export async function genreAlbums(genreId: string) {
  const r = await get<ItemsResult>('/Items', {
    userId: requireSession().userId,
    GenreIds: genreId,
    IncludeItemTypes: 'MusicAlbum',
    Recursive: true,
    SortBy: 'SortName',
    Fields: LIST_FIELDS,
  });
  return r.Items;
}

export async function search(term: string) {
  const s = requireSession();
  const base = { userId: s.userId, searchTerm: term, Recursive: true, Limit: 20, Fields: LIST_FIELDS };
  // Search results aren't worth caching offline; hit the network directly.
  const [artists, albums, tracks, playlists] = await Promise.all([
    request<ItemsResult>(`/Artists?${qs({ ...base })}`),
    request<ItemsResult>(`/Items?${qs({ ...base, IncludeItemTypes: 'MusicAlbum' })}`),
    request<ItemsResult>(`/Items?${qs({ ...base, IncludeItemTypes: 'Audio', Limit: 40 })}`),
    request<ItemsResult>(`/Items?${qs({ ...base, IncludeItemTypes: 'Playlist', MediaTypes: 'Audio' })}`),
  ]);
  return { artists: artists.Items, albums: albums.Items, tracks: tracks.Items, playlists: playlists.Items };
}

// ---------- playlists ----------

/** The user's audio playlists, fresh from the server (needs a connection). */
export async function userPlaylists() {
  const s = requireSession();
  const r = await request<ItemsResult>(
    `/Items?${qs({ userId: s.userId, IncludeItemTypes: 'Playlist', MediaTypes: 'Audio', Recursive: true, SortBy: 'SortName', Fields: 'ChildCount', ImageTypeLimit: 1, EnableImageTypes: 'Primary' })}`,
  );
  return r.Items;
}

export function addToPlaylist(playlistId: string, itemIds: string[]) {
  const s = requireSession();
  return request<void>(`/Playlists/${playlistId}/Items?${qs({ ids: itemIds.join(','), userId: s.userId })}`, { method: 'POST' });
}

export function createPlaylist(name: string, itemIds: string[]) {
  const s = requireSession();
  return request<{ Id: string }>('/Playlists', {
    method: 'POST',
    body: JSON.stringify({ Name: name, Ids: itemIds, UserId: s.userId, MediaType: 'Audio' }),
  });
}

// ---------- urls ----------

export function imageUrl(item: Item | undefined, size = 300): string | null {
  const s = auth.session;
  if (!s || !item) return null;
  let id: string | undefined;
  let tag: string | undefined;
  if (item.ImageTags?.Primary) {
    id = item.Id;
    tag = item.ImageTags.Primary;
  } else if (item.AlbumId && item.AlbumPrimaryImageTag) {
    id = item.AlbumId;
    tag = item.AlbumPrimaryImageTag;
  }
  if (!id) return null;
  return `${s.server}/Items/${id}/Images/Primary?${qs({ fillWidth: size, fillHeight: size, quality: 90, tag })}`;
}

/** Containers this browser can direct-play, in Jellyfin's "container|codec" syntax. */
const directPlayContainers = (() => {
  const a = document.createElement('audio');
  const ok = (t: string) => a.canPlayType(t) !== '';
  const list: string[] = [];
  if (ok('audio/mpeg')) list.push('mp3');
  if (ok('audio/mp4; codecs="mp4a.40.2"')) list.push('aac', 'm4a|aac', 'm4b|aac', 'mp4|aac');
  if (ok('audio/flac')) list.push('flac');
  if (ok('audio/mp4; codecs="alac"')) list.push('m4a|alac');
  if (ok('audio/ogg; codecs="opus"')) list.push('opus', 'ogg|opus');
  if (ok('audio/ogg; codecs="vorbis"')) list.push('ogg|vorbis');
  if (ok('audio/webm; codecs="opus"')) list.push('webma', 'webm|webma', 'webm|opus');
  if (ok('audio/wav')) list.push('wav');
  return list.join(',');
})();

export function streamUrl(trackId: string): string {
  const s = requireSession();
  const q = settings.streamQuality;
  return `${s.server}/Audio/${trackId}/universal?${qs({
    UserId: s.userId,
    DeviceId: deviceId,
    MaxStreamingBitrate: q === 'original' ? 999_999_999 : q * 1000,
    Container: directPlayContainers,
    TranscodingContainer: 'aac',
    TranscodingProtocol: 'http',
    AudioCodec: 'aac',
    ApiKey: s.token,
  })}`;
}

/** A small mono MP3 of the track, only used to compute the visualizer. */
export function analysisUrl(trackId: string, sampleRate: number): string {
  const s = requireSession();
  return `${s.server}/Audio/${trackId}/stream.mp3?${qs({ AudioCodec: 'mp3', AudioBitRate: 64000, AudioSampleRate: sampleRate, AudioChannels: 1, ApiKey: s.token })}`;
}

export function downloadUrl(trackId: string, format: 'original' | 'transcoded', bitrate: number): string {
  const s = requireSession();
  if (format === 'original') return `${s.server}/Audio/${trackId}/stream?${qs({ static: true, ApiKey: s.token })}`;
  return `${s.server}/Audio/${trackId}/stream.aac?${qs({ AudioCodec: 'aac', AudioBitRate: bitrate * 1000, MaxAudioChannels: 2, ApiKey: s.token })}`;
}
