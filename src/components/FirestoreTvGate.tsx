import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../lib/firebase';
import { loadTvShows, saveTvShows } from '../lib/firestoreTvShows';
import type { ClassKey } from './RankedList';
import type { MovieShowItem } from './EntryRowMovieShow';
import type { MovieClassDef } from '../mock/movies';
import { useSyncStatus } from '../context/SyncStatusContext';
import { TvProvider } from '../state/tvStore';

type Props = { children: React.ReactNode };

export function FirestoreTvGate({ children }: Props) {
  const { user } = useAuth();
  const [initialByClass, setInitialByClass] = useState<Record<ClassKey, MovieShowItem[]> | null>(
    null
  );
  const [initialClasses, setInitialClasses] = useState<MovieClassDef[] | null>(null);
  const didLogLoadRef = useRef(false);

  useEffect(() => {
    if (!user || !db) {
      setInitialByClass(null);
      setInitialClasses(null);
      return;
    }
    loadTvShows(db, user.uid).then((data) => {
      const total = Object.values(data.byClass).reduce((acc, list) => acc + list.length, 0);
      if (!didLogLoadRef.current) {
        didLogLoadRef.current = true;
        console.info('[Clastone] Loaded tv shows from Firestore', { uid: user.uid, totalEntries: total });
      }
      setInitialByClass(data.byClass);
      setInitialClasses(data.classes);
    });
  }, [user?.uid]);

  const { updateStatus } = useSyncStatus();

  const onPersist = useCallback(
    (payload: { byClass: Record<ClassKey, MovieShowItem[]>; classes: MovieClassDef[]; pendingCount?: number }) => {
      if (!user || !db) return;
      const count = payload.pendingCount ?? 0;
      updateStatus('tv', 'saving', { pendingCount: count });
      updateStatus('classes', 'saving', { pendingCount: count });
      saveTvShows(db, user.uid, payload)
        .then(() => {
          updateStatus('tv', 'idle', { label: `Saved ${count} TV changes` });
          updateStatus('classes', 'idle', { label: `Saved ${count} class changes` });
        })
        .catch((err) => {
          updateStatus('tv', 'error', { error: err.message });
          updateStatus('classes', 'error', { error: err.message });
        });
    },
    [user?.uid, updateStatus]
  );

  if ((initialByClass === null || initialClasses === null) && user) {
    return (
      <div className="app-loading">
        <p>Loading your list…</p>
      </div>
    );
  }

  return (
    <TvProvider
      initialByClass={initialByClass ?? undefined}
      initialClasses={initialClasses ?? undefined}
      onPersist={user && db ? onPersist : undefined}
    >
      {children}
    </TvProvider>
  );
}

