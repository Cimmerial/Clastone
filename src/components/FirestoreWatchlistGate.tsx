import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../lib/firebase';
import { loadWatchlist, saveWatchlist } from '../lib/firestoreWatchlist';
import type { WatchlistEntry } from '../state/watchlistStore';
import { WatchlistProvider } from '../state/watchlistStore';
import { useSyncStatus } from '../context/SyncStatusContext';

type Props = { children: React.ReactNode };

export function FirestoreWatchlistGate({ children }: Props) {
  const { user } = useAuth();
  const [initialMovies, setInitialMovies] = useState<WatchlistEntry[] | null>(null);
  const [initialTv, setInitialTv] = useState<WatchlistEntry[] | null>(null);
  const didLogLoadRef = useRef(false);

  useEffect(() => {
    if (!user || !db) {
      setInitialMovies(null);
      setInitialTv(null);
      return;
    }
    loadWatchlist(db, user.uid).then((data) => {
      if (!didLogLoadRef.current) {
        didLogLoadRef.current = true;
        console.info('[Clastone] Loaded watchlist from Firestore', {
          uid: user.uid,
          movies: data.movies.length,
          tv: data.tv.length
        });
      }
      setInitialMovies(data.movies);
      setInitialTv(data.tv);
    });
  }, [user?.uid]);

  const { updateStatus } = useSyncStatus();

  const onPersist = useCallback(
    (payload: { movies: WatchlistEntry[]; tv: WatchlistEntry[]; pendingCount?: number }) => {
      if (!user || !db) return;
      updateStatus('watchlist', 'saving', { pendingCount: payload.pendingCount });
      saveWatchlist(db, user.uid, payload)
        .then(() => updateStatus('watchlist', 'idle', { label: `Saved ${payload.pendingCount ?? 0} watchlist changes` }))
        .catch((err) => updateStatus('watchlist', 'error', { error: err.message }));
    },
    [user?.uid, updateStatus]
  );

  if (user && (initialMovies === null || initialTv === null)) {
    return (
      <div className="app-loading">
        <p>Loading your list…</p>
      </div>
    );
  }

  if (initialMovies === null || initialTv === null) {
    return (
      <WatchlistProvider initialMovies={[]} initialTv={[]}>
        {children}
      </WatchlistProvider>
    );
  }

  return (
    <WatchlistProvider
      initialMovies={initialMovies}
      initialTv={initialTv}
      onPersist={user && db ? onPersist : undefined}
    >
      {children}
    </WatchlistProvider>
  );
}
