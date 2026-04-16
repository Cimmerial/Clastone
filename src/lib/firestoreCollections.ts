import { collection, doc, getDocs, setDoc, deleteDoc, type Firestore } from 'firebase/firestore';

export type CollectionEntry = {
  tmdbId: number;
  mediaType: 'movie' | 'tv';
  position: number;
  title?: string;
  posterPath?: string;
  releaseDate?: string;
};

export type GlobalCollection = {
  id: string;
  name: string;
  summary?: string;
  color?: string;
  mediaType: 'movie' | 'tv' | 'both';
  entries: CollectionEntry[];
  hidden?: boolean;
  updatedAt: string;
};

const COLLECTIONS_ROOT = 'globalCollections';
const COLLECTIONS_META_DOC = 'meta';

export async function loadGlobalCollections(db: Firestore): Promise<GlobalCollection[]> {
  const col = collection(db, COLLECTIONS_ROOT);
  const snap = await getDocs(col);
  if (snap.empty) return [];

  const collections: GlobalCollection[] = [];
  let order: string[] = [];
  snap.forEach((d) => {
    if (d.id === COLLECTIONS_META_DOC) {
      order = ((d.data().order as string[] | undefined) ?? []).filter(Boolean);
      return;
    }
    const data = d.data();
    collections.push({
      id: d.id,
      name: String(data.name ?? d.id),
      summary: typeof data.summary === 'string' ? data.summary : undefined,
      color: typeof data.color === 'string' ? data.color : undefined,
      mediaType: (data.mediaType as 'movie' | 'tv' | 'both') ?? 'both',
      hidden: Boolean(data.hidden),
      updatedAt: String(data.updatedAt ?? new Date(0).toISOString()),
      entries: ((data.entries as CollectionEntry[] | undefined) ?? [])
        .slice()
        .sort((a, b) => a.position - b.position)
        .map((entry, idx) => ({ ...entry, position: idx })),
    });
  });

  const byId = new Map(collections.map((item) => [item.id, item]));
  const ordered = order.map((id) => byId.get(id)).filter((item): item is GlobalCollection => Boolean(item));
  const missing = collections.filter((item) => !order.includes(item.id)).sort((a, b) => a.name.localeCompare(b.name));
  return [...ordered, ...missing];
}

export async function upsertGlobalCollection(db: Firestore, collectionData: GlobalCollection): Promise<void> {
  const ref = doc(db, COLLECTIONS_ROOT, collectionData.id);
  await setDoc(ref, {
    name: collectionData.name,
    summary: typeof collectionData.summary === 'string' ? collectionData.summary : null,
    color: collectionData.color ?? null,
    mediaType: collectionData.mediaType,
    hidden: Boolean(collectionData.hidden),
    updatedAt: collectionData.updatedAt,
    entries: collectionData.entries.map((entry, idx) => ({ ...entry, position: idx })),
  });
}

export async function saveGlobalCollectionsOrder(db: Firestore, orderedIds: string[]): Promise<void> {
  const ref = doc(db, COLLECTIONS_ROOT, COLLECTIONS_META_DOC);
  await setDoc(ref, { order: orderedIds }, { merge: true });
}

export async function deleteGlobalCollection(db: Firestore, collectionId: string): Promise<void> {
  const ref = doc(db, COLLECTIONS_ROOT, collectionId);
  await deleteDoc(ref);
}
