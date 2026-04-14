import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../lib/firebase';
import { loadGlobalCollections } from '../lib/firestoreCollections';
import { loadUserLists, saveUserLists } from '../lib/firestoreLists';
import { ListsProvider } from '../state/listsStore';
import { useSyncStatus } from '../context/SyncStatusContext';

type Props = { children: React.ReactNode };

export function FirestoreListsGate({ children }: Props) {
  const { user } = useAuth();
  const { updateStatus } = useSyncStatus();
  const [initialLoaded, setInitialLoaded] = useState(false);
  const [initialData, setInitialData] = useState({
    lists: [] as Awaited<ReturnType<typeof loadUserLists>>['lists'],
    order: [] as string[],
    entriesByListId: {} as Awaited<ReturnType<typeof loadUserLists>>['entriesByListId'],
    globalCollections: [] as Awaited<ReturnType<typeof loadGlobalCollections>>,
  });

  useEffect(() => {
    if (!db || !user) {
      setInitialLoaded(true);
      return;
    }
    Promise.all([loadUserLists(db, user.uid), loadGlobalCollections(db)]).then(([userLists, globalCollections]) => {
      setInitialData({
        lists: userLists.lists,
        order: userLists.order,
        entriesByListId: userLists.entriesByListId,
        globalCollections,
      });
      updateStatus('classes', 'idle', { label: 'Lists loaded' });
      setInitialLoaded(true);
    });
  }, [user?.uid, updateStatus]);

  const onPersist = useCallback(async (payload: { lists: Awaited<ReturnType<typeof loadUserLists>>['lists']; order: string[]; entriesByListId: Awaited<ReturnType<typeof loadUserLists>>['entriesByListId']; pendingCount?: number }) => {
    if (!db || !user) return;
    updateStatus('classes', 'saving', { pendingCount: payload.pendingCount ?? 1 });
    await saveUserLists(db, user.uid, { lists: payload.lists, order: payload.order, entriesByListId: payload.entriesByListId });
    updateStatus('classes', 'idle', { label: 'Lists saved' });
  }, [user?.uid, updateStatus]);

  if (user && !initialLoaded) {
    return (
      <div className="app-loading">
        <p>Loading your lists...</p>
      </div>
    );
  }

  return (
    <ListsProvider
      initialLists={initialData.lists}
      initialOrder={initialData.order}
      initialEntriesByListId={initialData.entriesByListId}
      initialGlobalCollections={initialData.globalCollections}
      onPersist={user && db ? onPersist : undefined}
    >
      {children}
    </ListsProvider>
  );
}
