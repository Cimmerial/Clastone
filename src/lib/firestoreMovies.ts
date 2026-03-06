import {
  doc,
  getDoc,
  setDoc,
  type Firestore
} from 'firebase/firestore';
import type { ClassKey } from '../components/RankedList';
import type { MovieShowItem } from '../components/EntryRowMovieShow';
import { defaultMovieClassDefs, movieClasses, type MovieClassDef } from '../mock/movies';

const MOVIES_COLLECTION = 'users';
const MOVIES_SUBCOLLECTION = 'data';
const MOVIES_DOC_ID = 'movies';

export type MoviesData = {
  byClass: Record<ClassKey, MovieShowItem[]>;
  classes?: MovieClassDef[];
};

export function emptyByClass(keys: ClassKey[] = movieClasses): Record<ClassKey, MovieShowItem[]> {
  return keys.reduce(
    (acc, k) => {
      acc[k] = [];
      return acc;
    },
    {} as Record<ClassKey, MovieShowItem[]>
  );
}

/** Firestore does not allow undefined. Strip it from objects/arrays so setDoc succeeds. */
function stripUndefined<T>(value: T): T {
  if (value === undefined) {
    return value;
  }
  if (Array.isArray(value)) {
    return value
      .filter((item) => item !== undefined)
      .map((item) => stripUndefined(item)) as T;
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (v !== undefined) {
        out[k] = stripUndefined(v);
      }
    }
    return out as T;
  }
  return value;
}

/** Prune large fields that can be re-fetched from TMDB to keep document under 1MB. */
function pruneItem(item: MovieShowItem): MovieShowItem {
  // We'll keep the top 10 cast members and directors to avoid empty UI 
  // while still saving space compared to full TMDB responses.
  return {
    ...item,
    cast: item.cast?.slice(0, 10),
    directors: item.directors?.slice(0, 5),
    overview: item.overview && item.overview.length > 300
      ? item.overview.slice(0, 300) + '...'
      : item.overview,
  };
}

export async function loadMovies(
  db: Firestore,
  userId: string
): Promise<{ byClass: Record<ClassKey, MovieShowItem[]>; classes: MovieClassDef[] }> {
  const ref = doc(db, MOVIES_COLLECTION, userId, MOVIES_SUBCOLLECTION, MOVIES_DOC_ID);
  const snap = await getDoc(ref);
  if (!snap.exists()) return { byClass: emptyByClass(movieClasses), classes: defaultMovieClassDefs };
  const data = snap.data() as MoviesData | undefined;
  const loadedClasses = Array.isArray(data?.classes) && data?.classes?.length
    ? data.classes
    : defaultMovieClassDefs;
  const keys = loadedClasses.map((c) => c.key);
  const base = emptyByClass(keys);
  if (!data?.byClass || typeof data.byClass !== 'object') return { byClass: base, classes: loadedClasses };
  for (const key of keys) {
    if (Array.isArray((data.byClass as Record<string, unknown>)[key])) {
      base[key] = (data.byClass as Record<ClassKey, MovieShowItem[]>)[key] as MovieShowItem[];
    }
  }
  return { byClass: base, classes: loadedClasses };
}

export async function saveMovies(
  db: Firestore,
  userId: string,
  payload: { byClass: Record<ClassKey, MovieShowItem[]>; classes: MovieClassDef[] }
): Promise<void> {
  const ref = doc(db, MOVIES_COLLECTION, userId, MOVIES_SUBCOLLECTION, MOVIES_DOC_ID);
  const prunedByClass: Record<ClassKey, MovieShowItem[]> = {} as Record<ClassKey, MovieShowItem[]>;
  for (const [key, list] of Object.entries(payload.byClass)) {
    prunedByClass[key as ClassKey] = list.map(pruneItem);
  }

  const prunedPayload = {
    ...payload,
    byClass: prunedByClass
  };

  const sanitized = stripUndefined(prunedPayload);
  const total = Object.values(payload.byClass).reduce((acc, list) => acc + list.length, 0);
  console.info('[Clastone] Saving movies to Firestore (pruned)', {
    uid: userId,
    totalEntries: total
  });
  await setDoc(ref, sanitized);
}
