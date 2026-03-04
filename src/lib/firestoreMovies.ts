import {
  doc,
  getDoc,
  setDoc,
  type Firestore
} from 'firebase/firestore';
import type { ClassKey } from '../components/RankedList';
import type { MovieShowItem } from '../components/EntryRowMovieShow';
import { movieClasses } from '../mock/movies';

const MOVIES_COLLECTION = 'users';
const MOVIES_SUBCOLLECTION = 'data';
const MOVIES_DOC_ID = 'movies';

export type MoviesData = {
  byClass: Record<ClassKey, MovieShowItem[]>;
};

function emptyByClass(): Record<ClassKey, MovieShowItem[]> {
  return movieClasses.reduce(
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

export async function loadMovies(
  db: Firestore,
  userId: string
): Promise<Record<ClassKey, MovieShowItem[]>> {
  const ref = doc(db, MOVIES_COLLECTION, userId, MOVIES_SUBCOLLECTION, MOVIES_DOC_ID);
  const snap = await getDoc(ref);
  const base = emptyByClass();
  if (!snap.exists()) return base;
  const data = snap.data() as MoviesData | undefined;
  if (!data?.byClass || typeof data.byClass !== 'object') return base;
  for (const key of movieClasses) {
    if (Array.isArray(data.byClass[key])) {
      base[key] = data.byClass[key] as MovieShowItem[];
    }
  }
  return base;
}

export async function saveMovies(
  db: Firestore,
  userId: string,
  byClass: Record<ClassKey, MovieShowItem[]>
): Promise<void> {
  const ref = doc(db, MOVIES_COLLECTION, userId, MOVIES_SUBCOLLECTION, MOVIES_DOC_ID);
  const payload = stripUndefined({ byClass });
  const total = Object.values(byClass).reduce((acc, list) => acc + list.length, 0);
  console.info('[Clastone] Saving movies to Firestore', {
    uid: userId,
    totalEntries: total
  });
  await setDoc(ref, payload);
}
