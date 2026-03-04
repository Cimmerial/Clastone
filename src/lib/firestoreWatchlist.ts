import { doc, getDoc, setDoc, type Firestore } from 'firebase/firestore';
import type { WatchlistEntry } from '../state/watchlistStore';

const ROOT_COLLECTION = 'users';
const SUBCOLLECTION = 'data';
const DOC_ID = 'watchlist';

export type WatchlistData = {
  movies: WatchlistEntry[];
  tv: WatchlistEntry[];
};

export async function loadWatchlist(
  db: Firestore,
  userId: string
): Promise<{ movies: WatchlistEntry[]; tv: WatchlistEntry[] }> {
  const ref = doc(db, ROOT_COLLECTION, userId, SUBCOLLECTION, DOC_ID);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    return { movies: [], tv: [] };
  }
  const data = snap.data() as WatchlistData | undefined;
  return {
    movies: Array.isArray(data?.movies) ? data.movies : [],
    tv: Array.isArray(data?.tv) ? data.tv : []
  };
}

export async function saveWatchlist(
  db: Firestore,
  userId: string,
  payload: { movies: WatchlistEntry[]; tv: WatchlistEntry[] }
): Promise<void> {
  const ref = doc(db, ROOT_COLLECTION, userId, SUBCOLLECTION, DOC_ID);
  await setDoc(ref, payload);
}
