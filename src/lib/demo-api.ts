/**
 * Demo mode backend: a seeded, in-memory library that answers the same request paths the
 * app sends to Jellyfin (see jellyfin.ts), with the same response shapes. Loaded lazily,
 * only when a demo session makes its first request. Nothing here touches the network,
 * IndexedDB, or Cache Storage.
 */
import { ApiError, type Item, type ItemsResult } from './jellyfin';
import { demoTrackSeconds } from './demo-media';

const ADJ = ['Midnight', 'Golden', 'Silent', 'Electric', 'Paper', 'Velvet', 'Neon', 'Hollow', 'Crimson', 'Pale', 'Wandering', 'Broken', 'Glass', 'Distant', 'Burning', 'Quiet'];
const NOUN = ['Tides', 'Echoes', 'Gardens', 'Engines', 'Lanterns', 'Rivers', 'Static', 'Signals', 'Orchards', 'Harbors', 'Machines', 'Shadows', 'Comets', 'Meadows', 'Mirrors', 'Thunder'];
const FIRST = ['Ava', 'Milo', 'Nora', 'Theo', 'Iris', 'Jonas', 'Lena', 'Omar', 'Piper', 'Rafael', 'Sana', 'Tobias', 'Uma', 'Victor', 'Wren', 'Yara'];
const LAST = ['Okafor', 'Lindqvist', 'Marlowe', 'Castellano', 'Bright', 'Nakamura', 'Ferreira', 'Holloway', 'Dubois', 'Kowalski', 'Ashby', 'Moreau', 'Singh', 'Vance', 'Whitaker', 'Zhang'];
const VERB = ['Falling', 'Waiting for', 'Under', 'Letters from', 'Back to', 'After', 'Chasing', 'Holding', 'Running through', 'Slow', 'Open', 'Dreaming of'];
const GENRES = ['Rock', 'Jazz', 'Electronic', 'Folk', 'Classical', 'Hip-Hop', 'Ambient', 'Soul'];
const PLAYLISTS = ['Road Trip', 'Late Night', 'Focus', 'Workout', 'Sunday Morning', 'Favorites', 'Nothing Here Yet'];

const LONG_ARTIST = 'The Extraordinarily Long-Named Philharmonic Orchestra of the Northern Lights and Southern Winds';
const LONG_ALBUM = 'A Surprisingly Long Album Title That Keeps Going Well Past the Edge of the Screen (Deluxe Anniversary Edition)';

interface Meta {
  created: string;
  premiere?: string;
  artistIds: string[];
  genreId?: string;
}

interface Playlist {
  item: Item;
  tracks: Item[];
}

interface Library {
  artists: Item[];
  albums: Item[];
  genres: Item[];
  tracks: Item[];
  playlists: Playlist[];
  albumTracks: Map<string, Item[]>;
  byId: Map<string, Item>;
  meta: Map<string, Meta>;
}

function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function build(): Library {
  const rand = mulberry32(22);
  const pick = <T>(a: T[]) => a[Math.floor(rand() * a.length)];
  const between = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));
  const date = (y: number) => `${y}-${String(between(1, 12)).padStart(2, '0')}-${String(between(1, 28)).padStart(2, '0')}T00:00:00.0000000Z`;

  const lib: Library = { artists: [], albums: [], genres: [], tracks: [], playlists: [], albumTracks: new Map(), byId: new Map(), meta: new Map() };
  const add = (item: Item, meta?: Meta) => {
    lib.byId.set(item.Id, item);
    if (meta) lib.meta.set(item.Id, meta);
  };

  GENRES.forEach((name, i) => {
    const g: Item = { Id: `demo-g-${i + 1}`, Name: name, Type: 'MusicGenre' };
    lib.genres.push(g);
    add(g);
  });

  // Artists: a mix of bands and people, with one very long name.
  const names = new Set<string>([LONG_ARTIST]);
  while (names.size < 60) names.add(names.size % 3 === 0 ? `The ${pick(ADJ)} ${pick(NOUN)}` : `${pick(FIRST)} ${pick(LAST)}`);
  [...names].forEach((name, i) => {
    const a: Item = { Id: `demo-ar-${i + 1}`, Name: name, Type: 'MusicArtist', ImageTags: { Primary: 'demo' }, AlbumCount: 0 };
    lib.artists.push(a);
    add(a, { created: date(between(2020, 2025)), artistIds: [] });
  });

  const titles = new Set<string>([LONG_ALBUM]);
  let trackNo = 0;
  let albumNo = 0;
  for (const artist of lib.artists) {
    const albumCount = artist === lib.artists[1] ? 1 : between(2, 6);
    for (let k = 0; k < albumCount; k++) {
      // The long-title album belongs to the first artist; everything else is unique.
      let title = artist === lib.artists[0] && k === 0 ? LONG_ALBUM : `${pick(ADJ)} ${pick(NOUN)}`;
      for (let n = 2; titles.has(title) && title !== LONG_ALBUM; n++) title = `${title.replace(/ \d+$/, '')} ${n}`;
      titles.add(title);

      albumNo++;
      const id = `demo-al-${albumNo}`;
      const single = albumNo % 23 === 0;
      const double = albumNo % 29 === 0;
      const count = single ? 1 : double ? 22 : between(8, 14);
      const year = albumNo % 17 === 0 ? undefined : between(1975, 2024); // a few albums have no year
      const genre = lib.genres[albumNo % lib.genres.length];

      const album: Item = {
        Id: id,
        Name: title,
        Type: 'MusicAlbum',
        AlbumArtist: artist.Name,
        AlbumArtists: [{ Id: artist.Id, Name: artist.Name }],
        ArtistItems: [{ Id: artist.Id, Name: artist.Name }],
        Artists: [artist.Name],
        ProductionYear: year,
        ChildCount: count,
        ImageTags: { Primary: 'demo' },
      };
      lib.albums.push(album);
      add(album, { created: date(between(2020, 2025)), premiere: year ? date(year) : undefined, artistIds: [artist.Id], genreId: genre.Id });
      artist.AlbumCount = (artist.AlbumCount ?? 0) + 1;

      const tracks: Item[] = [];
      for (let t = 1; t <= count; t++) {
        trackNo++;
        const tid = `demo-t-${trackNo}`;
        const track: Item = {
          Id: tid,
          Name: single ? title : `${pick(VERB)} ${pick(NOUN)}`,
          Type: 'Audio',
          AlbumId: id,
          Album: title,
          AlbumArtist: artist.Name,
          AlbumArtists: album.AlbumArtists,
          Artists: [artist.Name],
          ArtistItems: album.ArtistItems,
          ProductionYear: year,
          IndexNumber: double && t > 11 ? t - 11 : t,
          ParentIndexNumber: double && t > 11 ? 2 : 1,
          RunTimeTicks: demoTrackSeconds(tid) * 10_000_000,
          AlbumPrimaryImageTag: 'demo',
        };
        tracks.push(track);
        lib.tracks.push(track);
        add(track, { created: lib.meta.get(id)!.created, premiere: lib.meta.get(id)!.premiere, artistIds: [artist.Id], genreId: genre.Id });
      }
      lib.albumTracks.set(id, tracks);
    }
  }

  PLAYLISTS.forEach((name, i) => {
    const empty = name === 'Nothing Here Yet';
    const tracks = Array.from({ length: empty ? 0 : between(12, 30) }, (_, n) => ({ ...pick(lib.tracks), PlaylistItemId: `demo-pli-${i + 1}-${n}` }));
    const item: Item = { Id: `demo-pl-${i + 1}`, Name: name, Type: 'Playlist', ChildCount: tracks.length };
    lib.playlists.push({ item, tracks });
    add(item, { created: date(between(2023, 2025)), artistIds: [] });
  });

  return lib;
}

let lib: Library | undefined;
const library = () => (lib ??= build());

// ---------- request handling ----------

type Sorter = (i: Item, m: Meta | undefined) => string | number;
const sorters: Record<string, Sorter> = {
  sortname: (i) => i.Name.toLowerCase(),
  name: (i) => i.Name.toLowerCase(),
  albumartist: (i) => (i.AlbumArtist ?? '').toLowerCase(),
  productionyear: (i) => i.ProductionYear ?? 0,
  premieredate: (i, m) => m?.premiere ?? '',
  datecreated: (i, m) => m?.created ?? '',
  parentindexnumber: (i) => i.ParentIndexNumber ?? 0,
  indexnumber: (i) => i.IndexNumber ?? 0,
  childcount: (i) => i.ChildCount ?? 0,
};

function sortItems(items: Item[], by: string | undefined, order: string | undefined, meta: Map<string, Meta>) {
  const keys = (by || 'SortName').split(',').map((k) => sorters[k.trim().toLowerCase()]).filter(Boolean);
  const dir = order?.toLowerCase() === 'descending' ? -1 : 1;
  return items.slice().sort((a, b) => {
    for (const key of keys) {
      const x = key(a, meta.get(a.Id));
      const y = key(b, meta.get(b.Id));
      if (x < y) return -dir;
      if (x > y) return dir;
    }
    return 0;
  });
}

const matches = (i: Item, term: string) =>
  [i.Name, i.AlbumArtist, i.Album].some((s) => s?.toLowerCase().includes(term));

function paged(items: Item[], p: URLSearchParams, meta: Map<string, Meta>): ItemsResult {
  const get = (k: string) => [...p].find(([name]) => name.toLowerCase() === k.toLowerCase())?.[1];
  const term = get('searchTerm')?.trim().toLowerCase();
  let list = term ? items.filter((i) => matches(i, term)) : items;
  list = sortItems(list, get('SortBy'), get('SortOrder'), meta);
  const start = Number(get('StartIndex')) || 0;
  const limit = Number(get('Limit')) || list.length;
  return { Items: list.slice(start, start + limit), TotalRecordCount: list.length, StartIndex: start };
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function handle<T>(path: string, init: RequestInit = {}): Promise<T> {
  await delay(80); // enough for spinners to show, like a real request
  const L = library();
  const url = new URL(path, 'http://demo.local');
  const p = url.searchParams;
  const get = (k: string) => [...p].find(([name]) => name.toLowerCase() === k.toLowerCase())?.[1];
  const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
  const method = (init.method ?? 'GET').toUpperCase();
  const out = (v: unknown) => v as T;
  const notFound = () => new ApiError('404 Not Found', 404);

  if (parts[0] === 'Sessions') return out(undefined);

  if (parts[0] === 'Items' && parts[1]) {
    const item = L.byId.get(parts[1]);
    if (!item) throw notFound();
    return out(item);
  }

  if (parts[0] === 'Items') {
    const types = (get('IncludeItemTypes') ?? '').split(',');
    let source: Item[];
    if (types.includes('Audio')) source = get('ParentId') ? (L.albumTracks.get(get('ParentId')!) ?? []) : L.tracks;
    else if (types.includes('Playlist')) source = L.playlists.map((pl) => pl.item);
    else {
      source = L.albums;
      const artistIds = get('AlbumArtistIds')?.split(',');
      const genreIds = get('GenreIds')?.split(',');
      if (artistIds) source = source.filter((a) => L.meta.get(a.Id)!.artistIds.some((id) => artistIds.includes(id)));
      if (genreIds) source = source.filter((a) => genreIds.includes(L.meta.get(a.Id)!.genreId ?? ''));
    }
    return out(paged(source, p, L.meta));
  }

  if (parts[0] === 'Artists') return out(paged(L.artists, p, L.meta)); // /Artists and /Artists/AlbumArtists
  if (parts[0] === 'MusicGenres') return out(paged(L.genres, p, L.meta));

  if (parts[0] === 'Playlists') {
    if (method === 'POST' && !parts[1]) {
      const body = JSON.parse(String(init.body ?? '{}')) as { Name: string; Ids?: string[] };
      const id = `demo-pl-${L.playlists.length + 1}`;
      const item: Item = { Id: id, Name: body.Name, Type: 'Playlist', ChildCount: 0 };
      const pl: Playlist = { item, tracks: [] };
      addTracks(L, pl, body.Ids ?? []);
      L.playlists.push(pl);
      L.byId.set(id, item);
      L.meta.set(id, { created: new Date().toISOString(), artistIds: [] });
      return out({ Id: id });
    }
    const pl = L.playlists.find((x) => x.item.Id === parts[1]);
    if (!pl) throw notFound();
    if (method === 'POST') {
      addTracks(L, pl, (get('ids') ?? '').split(',').filter(Boolean));
      return out(undefined);
    }
    return out({ Items: pl.tracks, TotalRecordCount: pl.tracks.length, StartIndex: 0 } satisfies ItemsResult);
  }

  throw notFound();
}

function addTracks(L: Library, pl: Playlist, ids: string[]) {
  for (const id of ids) {
    const t = L.byId.get(id);
    if (t?.Type === 'Audio') pl.tracks.push({ ...t, PlaylistItemId: `demo-pli-${pl.item.Id}-${pl.tracks.length}-${Date.now()}` });
  }
  pl.item.ChildCount = pl.tracks.length;
}
