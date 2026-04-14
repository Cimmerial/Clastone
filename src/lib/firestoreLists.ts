import { collection, doc, getDocs, type Firestore } from 'firebase/firestore';
import { throttledWriteBatch } from './firebaseThrottler';

export type ListMediaType = 'movie' | 'tv' | 'both';
export type ListMode = 'list' | 'collection';

export type ListEntryRef = {
  entryId: string;
  mediaType: 'movie' | 'tv';
  position: number;
};

export type UserListDoc = {
  id: string;
  name: string;
  color?: string;
  mediaType: ListMediaType;
  mode: ListMode;
  createdAt: string;
  updatedAt: string;
  hidden?: boolean;
};

export type UserListState = {
  lists: UserListDoc[];
  order: string[];
  entriesByListId: Record<string, ListEntryRef[]>;
};

const ROOT = 'users';
const LISTS_COLLECTION = 'listsData';
const LISTS_META_DOC = 'lists_meta';

export async function loadUserLists(db: Firestore, userId: string): Promise<UserListState> {
  const listsCol = collection(db, ROOT, userId, LISTS_COLLECTION);
  const snap = await getDocs(listsCol);

  if (snap.empty) {
    return { lists: [], order: [], entriesByListId: {} };
  }

  const lists: UserListDoc[] = [];
  const entriesByListId: Record<string, ListEntryRef[]> = {};
  let order: string[] = [];

  snap.forEach((d) => {
    if (d.id === LISTS_META_DOC) {
      order = ((d.data().order as string[] | undefined) ?? []).filter(Boolean);
      return;
    }
    const data = d.data();
    const entries = ((data.entries as ListEntryRef[] | undefined) ?? [])
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((entry, idx) => ({ ...entry, position: idx }));
    entriesByListId[d.id] = entries;
    lists.push({
      id: d.id,
      name: String(data.name ?? 'Untitled List'),
      color: typeof data.color === 'string' ? data.color : undefined,
      mediaType: (data.mediaType as ListMediaType) ?? 'both',
      mode: (data.mode as ListMode) ?? 'list',
      createdAt: String(data.createdAt ?? new Date(0).toISOString()),
      updatedAt: String(data.updatedAt ?? new Date(0).toISOString()),
      hidden: Boolean(data.hidden),
    });
  });

  const known = new Set(lists.map((list) => list.id));
  const safeOrder = order.filter((id) => known.has(id));
  const missing = lists.map((l) => l.id).filter((id) => !safeOrder.includes(id));
  return { lists, order: [...safeOrder, ...missing], entriesByListId };
}

export async function saveUserLists(db: Firestore, userId: string, state: UserListState): Promise<void> {
  const batch = throttledWriteBatch(db, { storeName: 'lists' });
  const listsColPath = [ROOT, userId, LISTS_COLLECTION] as const;

  const metaRef = doc(db, ...listsColPath, LISTS_META_DOC);
  batch.set(metaRef, { order: state.order });

  const keep = new Set(state.lists.map((list) => list.id));
  for (const list of state.lists) {
    const listRef = doc(db, ...listsColPath, list.id);
    const entries = (state.entriesByListId[list.id] ?? []).map((entry, idx) => ({
      ...entry,
      position: idx,
    }));
    batch.set(listRef, {
      name: list.name,
      color: list.color ?? null,
      mediaType: list.mediaType,
      mode: list.mode,
      hidden: Boolean(list.hidden),
      createdAt: list.createdAt,
      updatedAt: list.updatedAt,
      entries,
    });
  }

  const existing = await getDocs(collection(db, ...listsColPath));
  existing.forEach((docSnap) => {
    if (docSnap.id === LISTS_META_DOC) return;
    if (!keep.has(docSnap.id)) {
      batch.delete(docSnap.ref);
    }
  });

  await batch.commit();
}
