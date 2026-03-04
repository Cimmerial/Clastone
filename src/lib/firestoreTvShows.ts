import { doc, getDoc, setDoc, type Firestore } from 'firebase/firestore';
import type { ClassKey } from '../components/RankedList';
import type { MovieShowItem } from '../components/EntryRowMovieShow';
import { defaultMovieClassDefs, movieClasses, type MovieClassDef } from '../mock/movies';
import { emptyByClass as emptyByClassMovies } from './firestoreMovies';

const ROOT_COLLECTION = 'users';
const SUBCOLLECTION = 'data';
const DOC_ID = 'tvShows';

export type TvShowsData = {
  byClass: Record<ClassKey, MovieShowItem[]>;
  classes?: MovieClassDef[];
};

/** Firestore does not allow undefined. Strip it from objects/arrays so setDoc succeeds. */
function stripUndefined<T>(value: T): T {
  if (value === undefined) return value;
  if (Array.isArray(value)) {
    return value
      .filter((item) => item !== undefined)
      .map((item) => stripUndefined(item)) as T;
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (v !== undefined) out[k] = stripUndefined(v);
    }
    return out as T;
  }
  return value;
}

export async function loadTvShows(
  db: Firestore,
  userId: string
): Promise<{ byClass: Record<ClassKey, MovieShowItem[]>; classes: MovieClassDef[] }> {
  const ref = doc(db, ROOT_COLLECTION, userId, SUBCOLLECTION, DOC_ID);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    return { byClass: emptyByClassMovies(movieClasses), classes: defaultMovieClassDefs };
  }
  const data = snap.data() as TvShowsData | undefined;
  const loadedClasses =
    Array.isArray(data?.classes) && data?.classes?.length ? data.classes : defaultMovieClassDefs;
  const keys = loadedClasses.map((c) => c.key);
  const base = emptyByClassMovies(keys);
  if (!data?.byClass || typeof data.byClass !== 'object') {
    return { byClass: base, classes: loadedClasses };
  }
  for (const key of keys) {
    if (Array.isArray((data.byClass as Record<string, unknown>)[key])) {
      base[key] = (data.byClass as Record<ClassKey, MovieShowItem[]>)[key] as MovieShowItem[];
    }
  }
  // Reset/cleanup: TV is "full show only". Drop any old season-instance ids like tmdb-tv-123-s1.
  const isFullShowId = (id: string) => /^tmdb-tv-\d+$/.test(id);
  for (const key of keys) {
    const list = base[key] ?? [];
    const filtered = list.filter((it) => isFullShowId(it.id));
    // If duplicates exist, keep first occurrence.
    const seen = new Set<string>();
    base[key] = filtered.filter((it) => {
      if (seen.has(it.id)) return false;
      seen.add(it.id);
      return true;
    });
  }
  return { byClass: base, classes: loadedClasses };
}

export async function saveTvShows(
  db: Firestore,
  userId: string,
  payload: { byClass: Record<ClassKey, MovieShowItem[]>; classes: MovieClassDef[] }
): Promise<void> {
  const ref = doc(db, ROOT_COLLECTION, userId, SUBCOLLECTION, DOC_ID);
  const sanitized = stripUndefined(payload);
  const total = Object.values(payload.byClass).reduce((acc, list) => acc + list.length, 0);
  console.info('[Clastone] Saving tv shows to Firestore', { uid: userId, totalEntries: total });
  await setDoc(ref, sanitized);
}

