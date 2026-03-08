import {
  doc,
  getDoc,
  type Firestore
} from 'firebase/firestore';
import { throttledSetDoc, throttledWriteBatch, throttledDeleteDoc } from './firebaseThrottler';
import type { WatchlistEntry } from '../state/watchlistStore';

/** Legacy path */
const LEGACY_ROOT = 'users';
const LEGACY_SUB = 'data';
const LEGACY_DOC = 'watchlist';

/** New paths */
const NEW_ROOT = 'users';
const WATCHLIST_FOLDER = 'watchlistData';
const MOVIES_DOC_ID = 'movies';
const TV_DOC_ID = 'tv';

export type WatchlistData = {
  movies: WatchlistEntry[];
  tv: WatchlistEntry[];
};

function stripUndefined<T>(value: T): T {
  if (value === undefined) return value;
  if (Array.isArray(value)) return value.filter(i => i !== undefined).map(stripUndefined) as T;
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (v !== undefined) out[k] = stripUndefined(v);
    }
    return out as T;
  }
  return value;
}

function pruneWatchlistEntry(entry: WatchlistEntry): WatchlistEntry {
  return {
    id: entry.id,
    title: entry.title,
    posterPath: entry.posterPath,
    releaseDate: entry.releaseDate
  };
}

export async function loadWatchlist(db: Firestore, userId: string): Promise<{
  movies: WatchlistEntry[];
  tv: WatchlistEntry[];
  isMigrated: boolean
}> {
  const movieRef = doc(db, NEW_ROOT, userId, WATCHLIST_FOLDER, MOVIES_DOC_ID);
  const tvRef = doc(db, NEW_ROOT, userId, WATCHLIST_FOLDER, TV_DOC_ID);

  const [movieSnap, tvSnap] = await Promise.all([getDoc(movieRef), getDoc(tvRef)]);

  if (movieSnap.exists() || tvSnap.exists()) {
    return {
      movies: (movieSnap.data()?.items || []) as WatchlistEntry[],
      tv: (tvSnap.data()?.items || []) as WatchlistEntry[],
      isMigrated: true
    };
  }

  // Legacy check
  const legacyRef = doc(db, LEGACY_ROOT, userId, LEGACY_SUB, LEGACY_DOC);
  const legacySnap = await getDoc(legacyRef);

  if (legacySnap.exists()) {
    console.info('[Clastone] Found legacy watchlist data, migration required.');
    const data = legacySnap.data() as WatchlistData | undefined;
    return {
      movies: (data?.movies || []).map(pruneWatchlistEntry),
      tv: (data?.tv || []).map(pruneWatchlistEntry),
      isMigrated: false
    };
  }

  return { movies: [], tv: [], isMigrated: false };
}

export async function saveWatchlist(
  db: Firestore,
  userId: string,
  payload: {
    movies: WatchlistEntry[];
    tv: WatchlistEntry[];
    dirtyMovies?: boolean;
    dirtyTv?: boolean;
  }
): Promise<void> {
  const batch = throttledWriteBatch(db, {
    storeName: 'watchlist',
    dirtyMovies: payload.dirtyMovies,
    dirtyTv: payload.dirtyTv
  });

  const movieRef = doc(db, NEW_ROOT, userId, WATCHLIST_FOLDER, MOVIES_DOC_ID);
  const tvRef = doc(db, NEW_ROOT, userId, WATCHLIST_FOLDER, TV_DOC_ID);

  if (payload.dirtyMovies || payload.dirtyMovies === undefined) {
    batch.set(movieRef, stripUndefined({ items: payload.movies.map(pruneWatchlistEntry) }));
  }
  if (payload.dirtyTv || payload.dirtyTv === undefined) {
    batch.set(tvRef, stripUndefined({ items: payload.tv.map(pruneWatchlistEntry) }));
  }

  const legacyRef = doc(db, LEGACY_ROOT, userId, LEGACY_SUB, LEGACY_DOC);
  batch.delete(legacyRef);

  console.info('[Clastone] Saving watchlist to split documents', {
    uid: userId,
    movies: payload.movies.length,
    tv: payload.tv.length,
    dirtyMovies: payload.dirtyMovies,
    dirtyTv: payload.dirtyTv
  });

  await batch.commit();
}
