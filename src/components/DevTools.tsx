import { useMemo, useState } from 'react';
import {
  tmdbMovieDetailsFull,
  tmdbTvDetailsFull,
  type TmdbMovieCache,
  type TmdbTvCache,
  needsMovieRefresh,
  needsTvRefresh
} from '../lib/tmdb';
import { useMoviesStore } from '../state/moviesStore';
import { useTvStore } from '../state/tvStore';
import { usePeopleStore } from '../state/peopleStore';
import { tmdbPersonDetailsFull } from '../lib/tmdb';
import type { MovieShowItem } from './EntryRowMovieShow';
import type { ClassKey } from './RankedList';
import { useAuth } from '../context/AuthContext';
import { db } from '../lib/firebase';
import './DevTools.css';
import { collection, doc, getDoc, getDocs } from 'firebase/firestore';
import { useListsStore } from '../state/listsStore';

export function DevTools() {
  const { isAdmin, user } = useAuth();
  const { byClass: moviesByClass, classOrder: movieClassOrder, updateBatchMovieCache, classes: movieClasses } = useMoviesStore();
  const { byClass: tvByClass, classOrder: tvClassOrder, updateBatchShowCache, classes: tvClasses } = useTvStore();
  const { byClass: peopleByClass, forceRefreshPerson } = usePeopleStore();
  const [open, setOpen] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [isDumping, setIsDumping] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const { globalCollections } = useListsStore();
  const [quickCollectionId, setQuickCollectionId] = useState<string>(() => localStorage.getItem('dev_quick_collection_id') ?? '');
  const [quickAddDirection, setQuickAddDirection] = useState<'top' | 'bottom'>(() => {
    const saved = localStorage.getItem('dev_quick_collection_direction');
    return saved === 'bottom' ? 'bottom' : 'top';
  });

  const quickCollectionOptions = useMemo(
    () => globalCollections.map((collection) => ({ id: collection.id, name: collection.name })),
    [globalCollections]
  );

  const movieItems = useMemo(() => {
    const out: Array<{ classKey: ClassKey; item: MovieShowItem }> = [];
    for (const classKey of movieClassOrder) {
      const list = moviesByClass[classKey] ?? [];
      for (const item of list) out.push({ classKey, item });
    }
    return out;
  }, [moviesByClass, movieClassOrder]);

  const tvItems = useMemo(() => {
    const out: Array<{ classKey: ClassKey; item: MovieShowItem }> = [];
    for (const classKey of tvClassOrder) {
      const list = tvByClass[classKey] ?? [];
      for (const item of list) out.push({ classKey, item });
    }
    return out;
  }, [tvByClass, tvClassOrder]);

  const peopleCount = useMemo(() => Object.values(peopleByClass).flat().length, [peopleByClass]);

  const refreshableMovies = useMemo(
    () => movieItems.filter(({ item }) => needsMovieRefresh(item)),
    [movieItems]
  );
  const refreshableTv = useMemo(
    () => tvItems.filter(({ item }) => needsTvRefresh(item)),
    [tvItems]
  );
  const totalRefresh = refreshableMovies.length + refreshableTv.length;

  const handleRefresh = async (force: boolean = false) => {
    setIsRunning(true);
    setLastError(null);
    const moviesToProcess = force ? movieItems : refreshableMovies;
    const tvToProcess = force ? tvItems : refreshableTv;
    const totalCount = moviesToProcess.length + tvToProcess.length;
    setProgress({ done: 0, total: totalCount });

    console.info('[Clastone] DEV refresh start', {
      movies: moviesToProcess.length,
      tv: tvToProcess.length,
      total: totalCount,
      force
    });
    try {
      let done = 0;
      const CHUNK_SIZE = 25;

      // 1. Process Movies
      let movieBatch: Record<string, Partial<TmdbMovieCache>> = {};
      for (const { item } of moviesToProcess) {
        const tmdbId = item.tmdbId;
        let cache: TmdbMovieCache | null = null;
        if (tmdbId == null) {
          const m = item.id.match(/^tmdb-movie-(\d+)$/);
          if (m) {
            const parsed = Number(m[1]);
            cache = await tmdbMovieDetailsFull(parsed);
          }
        } else {
          cache = await tmdbMovieDetailsFull(tmdbId);
        }

        if (cache) {
          movieBatch[item.id] = cache;
        }

        done += 1;
        if (done % CHUNK_SIZE === 0 || done === moviesToProcess.length) {
          if (Object.keys(movieBatch).length > 0) {
            updateBatchMovieCache(movieBatch);
            movieBatch = {};
          }
          setProgress({ done, total: totalCount });
        }
      }

      // 2. Process TV
      let tvBatch: Record<string, Partial<TmdbTvCache>> = {};
      const tvStartDone = done;
      for (const { item } of tvToProcess) {
        const tmdbId = item.tmdbId;
        let parsed: number | null = tmdbId ?? null;
        if (parsed == null) {
          const m = item.id.match(/^tmdb-tv-(\d+)$/);
          parsed = m ? Number(m[1]) : null;
        }
        const id = parsed != null && !Number.isNaN(parsed) ? parsed : undefined;
        let cache: TmdbTvCache | null = null;
        if (id !== undefined) {
          cache = await tmdbTvDetailsFull(id);
        }

        if (cache) {
          tvBatch[item.id] = cache;
        }

        done += 1;
        const tvDoneCount = done - tvStartDone;
        if (tvDoneCount % CHUNK_SIZE === 0 || tvDoneCount === tvToProcess.length) {
          if (Object.keys(tvBatch).length > 0) {
            updateBatchShowCache(tvBatch);
            tvBatch = {};
          }
          setProgress({ done, total: totalCount });
        }
      }
    } catch (e) {
      setLastError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsRunning(false);
      console.info('[Clastone] DEV refresh end');
    }
  };

  const handleRefreshPeople = async () => {
    setIsRunning(true);
    setLastError(null);
    const people = Object.values(peopleByClass).flat();
    setProgress({ done: 0, total: people.length });

    try {
      let done = 0;
      for (const p of people) {
        if (!p.tmdbId) {
          done++;
          continue;
        }
        await forceRefreshPerson(p.id);
        done += 1;
        setProgress({ done, total: people.length });
      }
    } catch (e) {
      setLastError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsRunning(false);
    }
  };

  const dumpClassPersistence = async () => {
    const firestoreDb = db;
    if (!user?.uid || !firestoreDb) return;
    setIsDumping(true);
    try {
      const uid = user.uid;

      const summarizeLocal = (name: string, classes: any[], byClass: Record<string, MovieShowItem[]>, classOrder: string[]) => {
        const byClassKeys = Object.keys(byClass);
        const emptyKeys = byClassKeys.filter((k) => (byClass[k] ?? []).length === 0);
        const nonEmptyKeys = byClassKeys.filter((k) => (byClass[k] ?? []).length > 0);
        const labelGroups = classes.reduce<Record<string, number>>((acc, c) => {
          const label = c?.label ?? '';
          acc[label] = (acc[label] ?? 0) + 1;
          return acc;
        }, {});
        const dupLabels = Object.entries(labelGroups)
          .filter(([, count]) => count > 1)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 20);

        console.info(`[DEV dump] ${name} local summary`, {
          classesCount: classes.length,
          classesKeys: classes.map((c) => c.key),
          classOrder,
          byClassKeysCount: byClassKeys.length,
          nonEmptyKeysCount: nonEmptyKeys.length,
          emptyKeysCount: emptyKeys.length,
          emptyKeys: emptyKeys.slice(0, 100),
          dupLabels
        });
      };

      summarizeLocal('movies', movieClasses, moviesByClass, movieClassOrder);
      summarizeLocal('tv', tvClasses, tvByClass, tvClassOrder);

      const dumpFirestoreStore = async (label: string, rootCollection: string) => {
        // rootCollection examples: "movieData" and "tvData"
        const metadataRef = doc(firestoreDb, 'users', uid, rootCollection, 'metadata');
        const metadataSnap = await getDoc(metadataRef);
        const metadata = metadataSnap.exists() ? (metadataSnap.data() as any) : null;
        console.info(`[DEV dump] ${label} firestore metadata`, {
          exists: metadataSnap.exists(),
          classes: metadata?.classes?.map((c: any) => ({ key: c.key, label: c.label, isRanked: c.isRanked })) ?? []
        });

        const colRef = collection(firestoreDb, 'users', uid, rootCollection);
        const docsSnap = await getDocs(colRef);
        const classDocs = docsSnap.docs
          .filter((d) => d.id.startsWith('class_'))
          .map((d) => ({
            id: d.id,
            key: d.id.replace('class_', ''),
            itemsCount: (d.data() as any)?.items?.length ?? 0
          }))
          .sort((a, b) => b.itemsCount - a.itemsCount);

        console.info(`[DEV dump] ${label} firestore class_* docs`, {
          totalClassDocs: classDocs.length,
          topByItemsCount: classDocs.slice(0, 50),
          emptyClassDocs: classDocs.filter((x) => x.itemsCount === 0).slice(0, 200),
          hint: 'If you deleted a class in UI but it still appears on reload, it is likely because class_* docs still exist in Firestore.'
        });
      };

      await dumpFirestoreStore('movies', 'movieData');
      await dumpFirestoreStore('tv', 'tvData');
    } catch (e) {
      console.error('[DEV dump] Failed', e);
    } finally {
      setIsDumping(false);
    }
  };

  if (!import.meta.env.DEV || !isAdmin) return null;

  return (
    <>
      <button type="button" className="dev-fab" onClick={() => setOpen(true)} aria-label="Dev tools">
        DEV
      </button>
      {open && (
        <div className="dev-modal-overlay" role="dialog" aria-modal="true">
          <div className="dev-modal card-surface">
            <div className="dev-modal-header">
              <h2 className="dev-modal-title">Dev tools</h2>
              <button type="button" className="dev-modal-close" onClick={() => setOpen(false)}>
                ✕
              </button>
            </div>
            <div className="dev-modal-body">
              <div className="dev-row">
                <span className="dev-label">Entries</span>
                <span className="dev-value">{movieItems.length + tvItems.length + peopleCount}</span>
              </div>
              <div className="dev-row">
                <span className="dev-label">Missing cached fields</span>
                <span className="dev-value">{totalRefresh}</span>
              </div>

              <div className="dev-actions">
                <button
                  type="button"
                  className="dev-primary"
                  disabled={isRunning || totalRefresh === 0}
                  onClick={() => handleRefresh(false)}
                >
                  Refresh missing
                </button>
                <button
                  type="button"
                  className="dev-secondary"
                  disabled={isRunning}
                  onClick={() => handleRefresh(true)}
                >
                  Force refresh all
                </button>
                <button
                  type="button"
                  className="dev-secondary"
                  disabled={isRunning || peopleCount === 0}
                  onClick={handleRefreshPeople}
                >
                  Force refresh actors
                </button>
                <button
                  type="button"
                  className="dev-secondary"
                  disabled={isRunning || isDumping || !user?.uid}
                  onClick={() => void dumpClassPersistence()}
                >
                  Dump class persistence
                </button>
              </div>

              <h3 className="dev-modal-title" style={{ fontSize: 14, marginTop: 12 }}>Global collection editor</h3>
              <div className="dev-row">
                <label className="dev-label">Collection to add to with quick button</label>
              </div>
              <div className="dev-row">
                <select
                  className="dev-input"
                  value={quickCollectionId}
                  onChange={(e) => {
                    const value = e.target.value;
                    setQuickCollectionId(value);
                    localStorage.setItem('dev_quick_collection_id', value);
                    window.dispatchEvent(new Event('quick-collection-config-changed'));
                  }}
                >
                  <option value="">Select collection...</option>
                  {quickCollectionOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="dev-row">
                <label className="dev-label">Add direction</label>
              </div>
              <div className="dev-actions">
                <button
                  type="button"
                  className={`dev-secondary ${quickAddDirection === 'top' ? 'dev-secondary--active' : ''}`}
                  onClick={() => {
                    setQuickAddDirection('top');
                    localStorage.setItem('dev_quick_collection_direction', 'top');
                    window.dispatchEvent(new Event('quick-collection-config-changed'));
                  }}
                >
                  Top
                </button>
                <button
                  type="button"
                  className={`dev-secondary ${quickAddDirection === 'bottom' ? 'dev-secondary--active' : ''}`}
                  onClick={() => {
                    setQuickAddDirection('bottom');
                    localStorage.setItem('dev_quick_collection_direction', 'bottom');
                    window.dispatchEvent(new Event('quick-collection-config-changed'));
                  }}
                >
                  Bottom
                </button>
              </div>
              {progress && (
                <p className="dev-progress">
                  {isRunning ? 'Refreshing…' : 'Done.'} {progress.done}/{progress.total}
                </p>
              )}
              {lastError && <p className="dev-error">{lastError}</p>}

              <p className="dev-note">
                This will call TMDB for any entry missing cached data and write it into your Firestore list.
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
