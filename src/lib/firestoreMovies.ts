import {
  doc,
  getDoc,
  collection,
  getDocs,
  type Firestore
} from 'firebase/firestore';
import { throttledSetDoc, throttledWriteBatch, throttledDeleteDoc } from './firebaseThrottler';
import type { ClassKey } from '../components/RankedList';
import type { MovieShowItem } from '../components/EntryRowMovieShow';
import { defaultMovieClassDefs, movieClasses, type MovieClassDef } from '../mock/movies';
import { ONLY_UNRANKED_MOVIE_CLASS, emptyByClassForMovieClasses } from './classTemplates';

/** Legacy paths (single document) */
const LEGACY_COLLECTION = 'users';
const LEGACY_SUBCOLLECTION = 'data';
const LEGACY_DOC_ID = 'movies';

/** New paths (collection-based) */
const NEW_ROOT = 'users';
const MOVIE_DATA_COLLECTION = 'movieData';
const METADATA_DOC_ID = 'metadata';

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
export function pruneItem(item: MovieShowItem): MovieShowItem {
  return {
    ...item,
    cast: item.cast?.slice(0, 10),
    directors: item.directors?.slice(0, 5),
    overview: item.overview && item.overview.length > 300
      ? item.overview.slice(0, 300) + '...'
      : item.overview,
  };
}

export async function loadMovies(db: Firestore, userId: string): Promise<{
  byClass: Record<ClassKey, MovieShowItem[]>;
  classes: MovieClassDef[];
  isMigrated: boolean
}> {
  // Try loading from the flat movieData sub-collection (4 segments per doc)
  const moviesCol = collection(db, NEW_ROOT, userId, MOVIE_DATA_COLLECTION);
  const moviesSnap = await getDocs(moviesCol);

  if (!moviesSnap.empty) {
    let classes: MovieClassDef[] = defaultMovieClassDefs;
    const byClass: Record<ClassKey, MovieShowItem[]> = {};

    moviesSnap.forEach((d) => {
      const id = d.id;
      if (id === METADATA_DOC_ID) {
        const raw = d.data().classes as MovieClassDef[] | undefined;
        classes =
          raw && raw.length > 0
            ? raw
            : ONLY_UNRANKED_MOVIE_CLASS;
      } else if (id.startsWith('class_')) {
        const classKey = id.replace('class_', '') as ClassKey;
        byClass[classKey] = (d.data().items || []) as MovieShowItem[];
      }
    });

    const classOrder = classes.map((c) => c.key);
    // Ensure all classes exist in byClass even if empty.
    for (const ck of classOrder) {
      if (!byClass[ck]) byClass[ck] = [];
    }

    return { byClass, classes, isMigrated: true };
  }

  // If new structure doesn't exist, check legacy
  const legacyRef = doc(db, LEGACY_COLLECTION, userId, LEGACY_SUBCOLLECTION, LEGACY_DOC_ID);
  const legacySnap = await getDoc(legacyRef);

  if (legacySnap.exists()) {
    console.info('[Clastone] Found legacy movie data, migration required.');
    const legacyData = legacySnap.data() as MoviesData | undefined;
    return {
      byClass: legacyData?.byClass || emptyByClass(movieClasses),
      classes: legacyData?.classes || defaultMovieClassDefs,
      isMigrated: false
    };
  }

  return {
    byClass: emptyByClassForMovieClasses(ONLY_UNRANKED_MOVIE_CLASS),
    classes: ONLY_UNRANKED_MOVIE_CLASS,
    isMigrated: true
  };
}

export async function saveMovies(
  db: Firestore,
  userId: string,
  payload: {
    byClass: Record<ClassKey, MovieShowItem[]>;
    classes: MovieClassDef[];
    dirtyClasses?: ClassKey[];
    classesMetadataChanged?: boolean;
  }
): Promise<void> {
  const batch = throttledWriteBatch(db, {
    storeName: 'movies',
    dirtyClasses: payload.dirtyClasses,
    metadataChanged: payload.classesMetadataChanged
  });

  // 1. Save metadata only if changed or full sync
  if (payload.classesMetadataChanged || !payload.dirtyClasses) {
    const metadataRef = doc(db, NEW_ROOT, userId, MOVIE_DATA_COLLECTION, METADATA_DOC_ID);
    batch.set(metadataRef, stripUndefined({ classes: payload.classes }));
  }

  // 2. Save each class as a flat document (4 segments)
  const classesToSave = payload.dirtyClasses
    ? payload.classes.filter(c => payload.dirtyClasses!.includes(c.key))
    : payload.classes;

  for (const item of classesToSave) {
    const key = item.key;
    const classRef = doc(db, NEW_ROOT, userId, MOVIE_DATA_COLLECTION, `class_${key}`);
    const items = (payload.byClass[key] || []).map(pruneItem);
    batch.set(classRef, stripUndefined({ items }));
  }

  // 3. Delete legacy document if it exists
  const legacyRef = doc(db, LEGACY_COLLECTION, userId, LEGACY_SUBCOLLECTION, LEGACY_DOC_ID);
  batch.delete(legacyRef);

  console.info('[Clastone] Saving movies to flat Firestore sub-collection', {
    uid: userId,
    classesSaved: classesToSave.length,
    dirtyClasses: payload.dirtyClasses
  });

  await batch.commit();
}
