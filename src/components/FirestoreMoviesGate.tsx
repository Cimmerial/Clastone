import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../lib/firebase';
import { loadMovies, saveMovies } from '../lib/firestoreMovies';
import type { ClassKey } from './RankedList';
import type { MovieShowItem } from './EntryRowMovieShow';
import { MoviesProvider } from '../state/moviesStore';
import { useSyncStatus } from '../context/SyncStatusContext';
import type { MovieClassDef } from '../mock/movies';
import { AppLoading } from './AppLoading';

type Props = { children: React.ReactNode };

export function FirestoreMoviesGate({ children }: Props) {
  const { user } = useAuth();
  const { updateStatus } = useSyncStatus();
  const [initialByClass, setInitialByClass] = useState<
    Record<ClassKey, MovieShowItem[]> | null
  >(null);
  const [initialClasses, setInitialClasses] = useState<MovieClassDef[] | null>(null);
  const didLogLoadRef = useRef(false);

  useEffect(() => {
    if (!user || !db) {
      setInitialByClass(null);
      setInitialClasses(null);
      return;
    }
    loadMovies(db, user.uid).then((data) => {
      const total = Object.values(data.byClass).reduce((acc, list) => acc + list.length, 0);
      if (!didLogLoadRef.current) {
        didLogLoadRef.current = true;
        console.info('[Clastone] Loaded movies from Firestore', {
          uid: user.uid,
          totalEntries: total
        });
      }
      setInitialByClass(data.byClass);
      setInitialClasses(data.classes);
      updateStatus('movies', 'idle', { isMigrated: data.isMigrated });
      updateStatus('classes', 'idle', { isMigrated: data.isMigrated });
    });
  }, [user?.uid, updateStatus]);


  const onPersist = useCallback(
    async (payload: {
      byClass: Record<ClassKey, MovieShowItem[]>;
      classes: MovieClassDef[];
      pendingCount?: number;
      dirtyClasses?: ClassKey[];
      classesMetadataChanged?: boolean;
    }) => {
      if (!user || !db) return;
      const count = payload.pendingCount ?? 0;
      updateStatus('movies', 'saving', { pendingCount: count });
      updateStatus('classes', 'saving', { pendingCount: count });

      try {
        await saveMovies(db, user.uid, payload);
        updateStatus('movies', 'idle', { label: `Saved ${count} movie changes` });
        updateStatus('classes', 'idle', { label: `Saved ${count} class changes` });
      } catch (err: any) {
        updateStatus('movies', 'error', { error: err.message });
        updateStatus('classes', 'error', { error: err.message });
        throw err; // Re-throw so forceSync can catch it
      }
    },
    [user?.uid, updateStatus]
  );

  if ((initialByClass === null || initialClasses === null) && user) {
    return (
      <AppLoading message="Loading your list..." />
    );
  }

  return (
    <MoviesProvider
      initialByClass={initialByClass ?? undefined}
      initialClasses={initialClasses ?? undefined}
      onPersist={user && db ? onPersist : undefined}
    >
      {children}
    </MoviesProvider>
  );
}
