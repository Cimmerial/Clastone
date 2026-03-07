import {
  doc,
  getDoc,
  setDoc,
  collection,
  writeBatch,
  deleteDoc,
  getDocs,
  type Firestore
} from 'firebase/firestore';
import type { ClassKey } from '../components/RankedList';
import type { MovieShowItem } from '../components/EntryRowMovieShow';
import { defaultMovieClassDefs, movieClasses, type MovieClassDef } from '../mock/movies';

/** Legacy paths */
const LEGACY_ROOT = 'users';
const LEGACY_SUB = 'data';
const LEGACY_DOC = 'tvShows';

/** New paths */
const NEW_ROOT = 'users';
const TV_DATA_COLLECTION = 'tvData';
const METADATA_DOC_ID = 'metadata';

export type TvShowsData = {
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

function pruneItem(item: MovieShowItem): MovieShowItem {
  const seenIds = new Set<string>();
  const records = (item.watchRecords || []).filter(r => {
    if (!r.id) return true;
    if (seenIds.has(r.id)) return false;
    seenIds.add(r.id);
    return true;
  });

  return {
    ...item,
    watchRecords: records,
    cast: item.cast?.slice(0, 10),
    directors: item.directors?.slice(0, 5),
    overview: item.overview && item.overview.length > 300
      ? item.overview.slice(0, 300) + '...'
      : item.overview,
  };
}

export async function loadTvShows(db: Firestore, userId: string): Promise<{
  byClass: Record<ClassKey, MovieShowItem[]>;
  classes: MovieClassDef[];
  isMigrated: boolean
}> {
  const tvCol = collection(db, NEW_ROOT, userId, TV_DATA_COLLECTION);
  const tvSnap = await getDocs(tvCol);

  if (!tvSnap.empty) {
    let classes: MovieClassDef[] = defaultMovieClassDefs;
    const byClass: Record<ClassKey, MovieShowItem[]> = {};

    tvSnap.forEach((d) => {
      const id = d.id;
      if (id === METADATA_DOC_ID) {
        classes = (d.data().classes || defaultMovieClassDefs) as MovieClassDef[];
      } else if (id.startsWith('class_')) {
        const classKey = id.replace('class_', '') as ClassKey;
        byClass[classKey] = (d.data().items || []) as MovieShowItem[];
      }
    });

    for (const ck of classes.map(c => c.key)) {
      if (!byClass[ck]) byClass[ck] = [];
    }

    return { byClass, classes, isMigrated: true };
  }

  // Legacy check
  const legacyRef = doc(db, LEGACY_ROOT, userId, LEGACY_SUB, LEGACY_DOC);
  const legacySnap = await getDoc(legacyRef);

  if (legacySnap.exists()) {
    console.info('[Clastone] Found legacy TV data, migration required.');
    const legacyData = legacySnap.data() as TvShowsData | undefined;
    return {
      byClass: legacyData?.byClass || emptyByClass(movieClasses),
      classes: legacyData?.classes || defaultMovieClassDefs,
      isMigrated: false
    };
  }

  return { byClass: emptyByClass(movieClasses), classes: defaultMovieClassDefs, isMigrated: false };
}

export async function saveTvShows(
  db: Firestore,
  userId: string,
  payload: { byClass: Record<ClassKey, MovieShowItem[]>; classes: MovieClassDef[] }
): Promise<void> {
  const batch = writeBatch(db);

  const metadataRef = doc(db, NEW_ROOT, userId, TV_DATA_COLLECTION, METADATA_DOC_ID);
  batch.set(metadataRef, stripUndefined({ classes: payload.classes }));

  for (const cls of payload.classes) {
    const key = cls.key;
    const classRef = doc(db, NEW_ROOT, userId, TV_DATA_COLLECTION, `class_${key}`);
    const items = (payload.byClass[key] || []).map(pruneItem);
    batch.set(classRef, stripUndefined({ items }));
  }

  const legacyRef = doc(db, LEGACY_ROOT, userId, LEGACY_SUB, LEGACY_DOC);
  batch.delete(legacyRef);

  console.info('[Clastone] Saving TV shows to flat Firestore sub-collection', {
    uid: userId,
    classes: payload.classes.length
  });

  await batch.commit();
}
