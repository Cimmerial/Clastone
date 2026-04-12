import { useCallback, useEffect, useRef, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { db } from '../lib/firebase';
import { loadWatchlist, saveWatchlist } from '../lib/firestoreWatchlist';
import {
  deleteIncomingRecommendationsForMedia,
  loadIncomingRecommendations,
  parseIncomingRecommendationDoc
} from '../lib/firestoreWatchRecommendations';
import { mergeWatchlistWithIncoming } from '../lib/mergeWatchlistRecommendations';
import type { WatchlistEntry } from '../state/watchlistStore';
import { useWatchlistStore, WatchlistProvider } from '../state/watchlistStore';
import { useSyncStatus } from '../context/SyncStatusContext';

type Props = { children: React.ReactNode };

function WatchlistIncomingRecommendationsSync({ userId }: { userId: string }) {
  const { applyIncomingRecommendations } = useWatchlistStore();

  useEffect(() => {
    if (!db) return;
    const col = collection(db, 'users', userId, 'incomingWatchRecommendations');
    const unsub = onSnapshot(col, (snap) => {
      const incoming = snap.docs
        .map((d) => parseIncomingRecommendationDoc(d))
        .filter((x): x is NonNullable<typeof x> => x != null);
      applyIncomingRecommendations(incoming);
    });
    return () => unsub();
  }, [userId, applyIncomingRecommendations]);

  return null;
}

export function FirestoreWatchlistGate({ children }: Props) {
  const { user } = useAuth();
  const [initialMovies, setInitialMovies] = useState<WatchlistEntry[] | null>(null);
  const [initialTv, setInitialTv] = useState<WatchlistEntry[] | null>(null);
  const { updateStatus } = useSyncStatus();
  const didLogLoadRef = useRef(false);

  useEffect(() => {
    if (!user || !db) {
      setInitialMovies(null);
      setInitialTv(null);
      return;
    }
    Promise.all([loadWatchlist(db, user.uid), loadIncomingRecommendations(db, user.uid)]).then(
      ([data, incoming]) => {
        const merged = mergeWatchlistWithIncoming(data.movies, data.tv, incoming);
        if (!didLogLoadRef.current) {
          didLogLoadRef.current = true;
          console.info('[Clastone] Loaded watchlist from Firestore', {
            uid: user.uid,
            movies: merged.movies.length,
            tv: merged.tv.length
          });
        }
        setInitialMovies(merged.movies);
        setInitialTv(merged.tv);
        updateStatus('watchlist', 'idle', { isMigrated: data.isMigrated });
      }
    );
  }, [user?.uid, updateStatus]);


  const onPersist = useCallback(
    async (payload: {
      movies: WatchlistEntry[];
      tv: WatchlistEntry[];
      pendingCount?: number;
      dirtyMovies?: boolean;
      dirtyTv?: boolean;
    }) => {
      if (!user || !db) return;
      updateStatus('watchlist', 'saving', { pendingCount: payload.pendingCount });
      try {
        await saveWatchlist(db, user.uid, payload);
        updateStatus('watchlist', 'idle', { label: `Saved ${payload.pendingCount ?? 0} watchlist changes` });
      } catch (err: any) {
        updateStatus('watchlist', 'error', { error: err.message });
        throw err;
      }
    },
    [user?.uid, updateStatus]
  );

  const onBeforeRemoveFromWatchlist = useCallback(
    async ({ id }: { id: string; entry: WatchlistEntry | null }) => {
      if (!user || !db) return;
      await deleteIncomingRecommendationsForMedia(db, user.uid, id);
    },
    [user?.uid]
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
      onBeforeRemoveFromWatchlist={user && db ? onBeforeRemoveFromWatchlist : undefined}
    >
      {user && db ? <WatchlistIncomingRecommendationsSync userId={user.uid} /> : null}
      {children}
    </WatchlistProvider>
  );
}
