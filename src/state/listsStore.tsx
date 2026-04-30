import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { GlobalCollection } from '../lib/firestoreCollections';
import type { CustomListAddPosition, ListEntryRef, ListMediaType, ListSortMode, UserListDoc } from '../lib/firestoreLists';

type EntryMediaType = 'movie' | 'tv' | 'person';
const COLLECTION_ENTRY_CAP = 1000;

export type ListMembershipChange = {
  listId: string;
  selected: boolean;
};

export type ListEntryMeta = {
  title?: string;
  posterPath?: string;
  releaseDate?: string;
  rankScore?: number;
};

type ListsStore = {
  lists: UserListDoc[];
  listOrder: string[];
  entriesByListId: Record<string, ListEntryRef[]>;
  globalCollections: GlobalCollection[];
  tagsByEntryId: Map<string, string[]>;
  collectionIdsByEntryId: Map<string, string[]>;
  createList: (name: string, mediaType: ListMediaType, mode?: 'list' | 'collection', color?: string, description?: string) => string;
  updateList: (listId: string, updates: Partial<Pick<UserListDoc, 'name' | 'description' | 'mediaType' | 'hidden' | 'color' | 'showInWatchModal' | 'allowWatchModalTagEditing' | 'sortMode' | 'customAddPosition'>>) => void;
  deleteList: (listId: string) => void;
  reorderLists: (orderedIds: string[]) => void;
  reorderEntriesInList: (listId: string, orderedEntryIds: string[]) => void;
  addEntryToListTop: (listId: string, entryId: string, mediaType: EntryMediaType, meta?: ListEntryMeta) => void;
  setEntryListMembership: (entryId: string, mediaType: EntryMediaType, changes: ListMembershipChange[], meta?: ListEntryMeta) => void;
  getEditableListsForMediaType: (mediaType: EntryMediaType) => UserListDoc[];
  getSelectedListIdsForEntry: (entryId: string) => string[];
  upsertGlobalCollection: (collectionData: GlobalCollection) => void;
  reorderGlobalCollections: (orderedIds: string[]) => void;
  removeGlobalCollection: (collectionId: string) => void;
};

const ListsContext = createContext<ListsStore | null>(null);

type ListsProviderProps = {
  children: React.ReactNode;
  initialLists?: UserListDoc[];
  initialOrder?: string[];
  initialEntriesByListId?: Record<string, ListEntryRef[]>;
  initialGlobalCollections?: GlobalCollection[];
  onPersist?: (payload: {
    lists: UserListDoc[];
    order: string[];
    entriesByListId: Record<string, ListEntryRef[]>;
    pendingCount?: number;
  }) => Promise<void>;
};

function supportsMediaType(listType: ListMediaType, mediaType: EntryMediaType): boolean {
  if (mediaType === 'person') return listType === 'person';
  return listType === 'both' || listType === mediaType;
}

function parseReleaseDateTimestamp(date?: string): number {
  if (!date) return Number.MIN_SAFE_INTEGER;
  const ts = Date.parse(date);
  return Number.isFinite(ts) ? ts : Number.MIN_SAFE_INTEGER;
}

function sortEntriesForList(list: UserListDoc | undefined, entries: ListEntryRef[]): ListEntryRef[] {
  if (!list || entries.length <= 1) return entries.map((entry, position) => ({ ...entry, position }));
  const mode: ListSortMode = list.sortMode ?? 'custom';
  if (mode === 'release_date') {
    return entries
      .slice()
      .sort((a, b) => {
        const dateDelta = parseReleaseDateTimestamp(b.releaseDate) - parseReleaseDateTimestamp(a.releaseDate);
        if (dateDelta !== 0) return dateDelta;
        return a.position - b.position;
      })
      .map((entry, position) => ({ ...entry, position }));
  }
  return entries.map((entry, position) => ({ ...entry, position }));
}

export function ListsProvider({
  children,
  initialLists = [],
  initialOrder = [],
  initialEntriesByListId = {},
  initialGlobalCollections = [],
  onPersist,
}: ListsProviderProps) {
  const [lists, setLists] = useState<UserListDoc[]>(initialLists);
  const [listOrder, setListOrder] = useState<string[]>(initialOrder);
  const [entriesByListId, setEntriesByListId] = useState(initialEntriesByListId);
  const [globalCollections, setGlobalCollections] = useState<GlobalCollection[]>(initialGlobalCollections);

  const persistTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hydratedRef = useRef(false);
  const lastSavedRef = useRef({ lists: initialLists, listOrder: initialOrder, entriesByListId: initialEntriesByListId });

  useEffect(() => {
    if (!hydratedRef.current) {
      hydratedRef.current = true;
      lastSavedRef.current = { lists, listOrder, entriesByListId };
      return;
    }
    if (!onPersist) return;

    if (persistTimeoutRef.current) clearTimeout(persistTimeoutRef.current);
    const payload = { lists, order: listOrder, entriesByListId, pendingCount: 1 };
    persistTimeoutRef.current = setTimeout(() => {
      onPersist(payload);
      lastSavedRef.current = { lists, listOrder, entriesByListId };
      persistTimeoutRef.current = null;
    }, 1000);
  }, [lists, listOrder, entriesByListId, onPersist]);

  const createList = useCallback((name: string, mediaType: ListMediaType, mode: 'list' | 'collection' = 'list', color?: string, description?: string) => {
    const id = `list_${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const next: UserListDoc = {
      id,
      name: name.trim() || 'Untitled List',
      description: description?.trim() || undefined,
      mediaType,
      mode,
      color,
      createdAt: now,
      updatedAt: now,
      hidden: false,
      showInWatchModal: true,
      allowWatchModalTagEditing: true,
      sortMode: 'custom',
      customAddPosition: 'top',
    };
    setLists((prev) => [...prev, next]);
    setListOrder((prev) => [...prev, id]);
    setEntriesByListId((prev) => ({ ...prev, [id]: [] }));
    return id;
  }, []);

  const updateList = useCallback((listId: string, updates: Partial<Pick<UserListDoc, 'name' | 'description' | 'mediaType' | 'hidden' | 'color' | 'showInWatchModal' | 'allowWatchModalTagEditing' | 'sortMode' | 'customAddPosition'>>) => {
    const now = new Date().toISOString();
    const currentList = lists.find((list) => list.id === listId);
    const nextList = currentList ? { ...currentList, ...updates, updatedAt: now } : undefined;
    setLists((prev) => prev.map((list) => (list.id === listId ? { ...list, ...updates, updatedAt: now } : list)));
    if (updates.sortMode && nextList) {
      setEntriesByListId((prev) => {
        const current = prev[listId] ?? [];
        const normalized = current.map((entry, position) => ({ ...entry, position }));
        const sorted = sortEntriesForList(nextList, normalized);
        return { ...prev, [listId]: sorted };
      });
    }
  }, [lists]);

  const deleteList = useCallback((listId: string) => {
    setLists((prev) => prev.filter((list) => list.id !== listId));
    setListOrder((prev) => prev.filter((id) => id !== listId));
    setEntriesByListId((prev) => {
      const next = { ...prev };
      delete next[listId];
      return next;
    });
  }, []);

  const reorderLists = useCallback((orderedIds: string[]) => {
    setListOrder(orderedIds);
  }, []);

  const reorderEntriesInList = useCallback((listId: string, orderedEntryIds: string[]) => {
    setEntriesByListId((prev) => {
      const current = prev[listId] ?? [];
      const byId = new Map(current.map((entry) => [entry.entryId, entry]));
      const next = orderedEntryIds
        .map((entryId, position) => {
          const existing = byId.get(entryId);
          return existing ? { ...existing, position } : null;
        })
        .filter((entry): entry is ListEntryRef => entry !== null);
      return { ...prev, [listId]: next };
    });
  }, []);

  const addEntryToListTop = useCallback((listId: string, entryId: string, mediaType: EntryMediaType, meta?: ListEntryMeta) => {
    setEntriesByListId((prev) => {
      const list = lists.find((item) => item.id === listId);
      const current = prev[listId] ?? [];
      if (current.some((entry) => entry.entryId === entryId)) return prev;
      if (list?.mode === 'collection' && current.length >= COLLECTION_ENTRY_CAP) return prev;
      const customAddPosition: CustomListAddPosition = list?.customAddPosition ?? 'top';
      const insertion = { entryId, mediaType, position: 0, ...meta };
      const combined =
        (list?.sortMode ?? 'custom') === 'custom'
          ? customAddPosition === 'bottom'
            ? [...current, insertion]
            : [insertion, ...current]
          : [...current, insertion];
      const next = sortEntriesForList(list, combined);
      return { ...prev, [listId]: next };
    });
  }, [lists]);

  const setEntryListMembership = useCallback((entryId: string, mediaType: EntryMediaType, changes: ListMembershipChange[], meta?: ListEntryMeta) => {
    setEntriesByListId((prev) => {
      const next = { ...prev };
      for (const change of changes) {
        const list = lists.find((item) => item.id === change.listId);
        if (!list || list.hidden || !supportsMediaType(list.mediaType, mediaType)) continue;
        const current = next[change.listId] ?? [];
        const hasEntry = current.some((entry) => entry.entryId === entryId);
        if (change.selected && !hasEntry) {
          if (list.mode === 'collection' && current.length >= COLLECTION_ENTRY_CAP) continue;
          const customAddPosition: CustomListAddPosition = list.customAddPosition ?? 'top';
          const insertion = { entryId, mediaType, position: current.length, ...meta };
          const combined =
            (list.sortMode ?? 'custom') === 'custom'
              ? customAddPosition === 'bottom'
                ? [...current, insertion]
                : [insertion, ...current]
              : [...current, insertion];
          next[change.listId] = sortEntriesForList(list, combined);
        }
        if (!change.selected && hasEntry) {
          const filtered = current.filter((entry) => entry.entryId !== entryId).map((entry, position) => ({ ...entry, position }));
          next[change.listId] = filtered;
        }
      }
      return next;
    });
  }, [lists]);

  const getEditableListsForMediaType = useCallback((mediaType: EntryMediaType) => {
    return lists
      .filter((list) => !list.hidden && list.showInWatchModal !== false && supportsMediaType(list.mediaType, mediaType))
      .sort((a, b) => {
        const aIdx = listOrder.indexOf(a.id);
        const bIdx = listOrder.indexOf(b.id);
        return (aIdx === -1 ? Number.MAX_SAFE_INTEGER : aIdx) - (bIdx === -1 ? Number.MAX_SAFE_INTEGER : bIdx);
      });
  }, [lists, listOrder]);

  const getSelectedListIdsForEntry = useCallback((entryId: string) => {
    return Object.entries(entriesByListId)
      .filter(([, entries]) => entries.some((entry) => entry.entryId === entryId))
      .map(([listId]) => listId);
  }, [entriesByListId]);

  const tagsByEntryId = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const list of lists) {
      if (list.mode !== 'list' || list.hidden) continue;
      const entries = entriesByListId[list.id] ?? [];
      for (const entry of entries) {
        const current = map.get(entry.entryId) ?? [];
        if (!current.includes(list.name)) current.push(list.name);
        map.set(entry.entryId, current);
      }
    }
    return map;
  }, [lists, entriesByListId]);

  const collectionIdsByEntryId = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const collection of globalCollections) {
      if (collection.hidden) continue;
      for (const entry of collection.entries) {
        const entryId = `tmdb-${entry.mediaType}-${entry.tmdbId}`;
        const current = map.get(entryId) ?? [];
        current.push(collection.id);
        map.set(entryId, current);
      }
    }
    return map;
  }, [globalCollections]);

  const upsertGlobalCollectionStore = useCallback((collectionData: GlobalCollection) => {
    setGlobalCollections((prev) => {
      const idx = prev.findIndex((item) => item.id === collectionData.id);
      if (idx === -1) return [...prev, collectionData];
      const next = [...prev];
      next[idx] = collectionData;
      return next;
    });
  }, []);

  const reorderGlobalCollections = useCallback((orderedIds: string[]) => {
    setGlobalCollections((prev) => {
      const byId = new Map(prev.map((item) => [item.id, item]));
      const ordered = orderedIds.map((id) => byId.get(id)).filter((item): item is GlobalCollection => Boolean(item));
      const missing = prev.filter((item) => !orderedIds.includes(item.id));
      return [...ordered, ...missing];
    });
  }, []);

  const removeGlobalCollection = useCallback((collectionId: string) => {
    setGlobalCollections((prev) => prev.filter((item) => item.id !== collectionId));
  }, []);

  const value = useMemo<ListsStore>(() => ({
    lists,
    listOrder,
    entriesByListId,
    globalCollections,
    tagsByEntryId,
    collectionIdsByEntryId,
    createList,
    updateList,
    deleteList,
    reorderLists,
    reorderEntriesInList,
    addEntryToListTop,
    setEntryListMembership,
    getEditableListsForMediaType,
    getSelectedListIdsForEntry,
    upsertGlobalCollection: upsertGlobalCollectionStore,
    reorderGlobalCollections,
    removeGlobalCollection,
  }), [
    lists,
    listOrder,
    entriesByListId,
    globalCollections,
    tagsByEntryId,
    collectionIdsByEntryId,
    createList,
    updateList,
    deleteList,
    reorderLists,
    reorderEntriesInList,
    addEntryToListTop,
    setEntryListMembership,
    getEditableListsForMediaType,
    getSelectedListIdsForEntry,
    upsertGlobalCollectionStore,
    reorderGlobalCollections,
    removeGlobalCollection,
  ]);

  return <ListsContext.Provider value={value}>{children}</ListsContext.Provider>;
}

export function useListsStore() {
  const ctx = useContext(ListsContext);
  if (!ctx) throw new Error('useListsStore must be used within ListsProvider');
  return ctx;
}
