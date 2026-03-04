import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../lib/firebase';
import { loadMovies, saveMovies } from '../lib/firestoreMovies';
import type { ClassKey } from './RankedList';
import type { MovieShowItem } from './EntryRowMovieShow';
import { MoviesProvider } from '../state/moviesStore';

type Props = { children: React.ReactNode };

export function FirestoreMoviesGate({ children }: Props) {
  const { user } = useAuth();
  const [initialByClass, setInitialByClass] = useState<
    Record<ClassKey, MovieShowItem[]> | null
  >(null);

  useEffect(() => {
    if (!user || !db) {
      setInitialByClass(null);
      return;
    }
    loadMovies(db, user.uid).then((data) => {
      const total = Object.values(data).reduce((acc, list) => acc + list.length, 0);
      console.info('[Clastone] Loaded movies from Firestore', {
        uid: user.uid,
        totalEntries: total
      });
      setInitialByClass(data);
    });
  }, [user?.uid]);

  const onPersist = useCallback(
    (byClass: Record<ClassKey, MovieShowItem[]>) => {
      if (!user || !db) return;
      saveMovies(db, user.uid, byClass).catch(console.error);
    },
    [user?.uid]
  );

  if (initialByClass === null && user) {
    return (
      <div className="app-loading">
        <p>Loading your list…</p>
      </div>
    );
  }

  return (
    <MoviesProvider
      initialByClass={initialByClass ?? undefined}
      onPersist={user && db ? onPersist : undefined}
    >
      {children}
    </MoviesProvider>
  );
}
