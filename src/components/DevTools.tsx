import { useMemo, useState } from 'react';
import { tmdbMovieDetailsFull, tmdbTvDetailsFull } from '../lib/tmdb';
import { useMoviesStore } from '../state/moviesStore';
import { useTvStore } from '../state/tvStore';
import type { MovieShowItem } from './EntryRowMovieShow';
import type { ClassKey } from './RankedList';
import './DevTools.css';

function needsMovieRefresh(item: MovieShowItem): boolean {
  // Minimal fields we consider "cached enough" for now.
  return (
    item.tmdbId == null ||
    item.releaseDate == null ||
    item.runtimeMinutes == null ||
    item.posterPath == null ||
    item.overview == null ||
    item.cast == null ||
    item.directors == null
  );
}

function needsTvRefresh(item: MovieShowItem): boolean {
  // TV runtime is often missing; include it explicitly.
  return (
    item.tmdbId == null ||
    item.releaseDate == null ||
    item.posterPath == null ||
    item.overview == null ||
    item.cast == null ||
    item.directors == null ||
    item.totalEpisodes == null ||
    item.totalSeasons == null ||
    item.runtimeMinutes == null
  );
}

export function DevTools() {
  const { byClass: moviesByClass, classOrder: movieClassOrder, updateMovieCache } = useMoviesStore();
  const { byClass: tvByClass, classOrder: tvClassOrder, updateShowCache } = useTvStore();
  const [open, setOpen] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);

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

  const refreshableMovies = useMemo(
    () => movieItems.filter(({ item }) => needsMovieRefresh(item)),
    [movieItems]
  );
  const refreshableTv = useMemo(
    () => tvItems.filter(({ item }) => needsTvRefresh(item)),
    [tvItems]
  );
  const totalRefresh = refreshableMovies.length + refreshableTv.length;

  const handleRefresh = async () => {
    setIsRunning(true);
    setLastError(null);
    setProgress({ done: 0, total: totalRefresh });
    console.info('[Clastone] DEV refresh start', {
      movies: refreshableMovies.length,
      tv: refreshableTv.length,
      total: totalRefresh
    });
    try {
      let done = 0;
      for (const { item } of refreshableMovies) {
        const tmdbId = item.tmdbId;
        if (tmdbId == null) {
          // Our item ids are "tmdb-movie-123" – parse when needed.
          const m = item.id.match(/^tmdb-movie-(\d+)$/);
          if (!m) {
            done += 1;
            setProgress({ done, total: refreshable.length });
            continue;
          }
          const parsed = Number(m[1]);
          const cache = await tmdbMovieDetailsFull(parsed);
          if (cache) updateMovieCache(item.id, cache);
        } else {
          const cache = await tmdbMovieDetailsFull(tmdbId);
          if (cache) updateMovieCache(item.id, cache);
        }
        done += 1;
        setProgress({ done, total: totalRefresh });
      }

      for (const { item } of refreshableTv) {
        const tmdbId = item.tmdbId;
        let parsed = tmdbId;
        if (parsed == null) {
          const m = item.id.match(/^tmdb-tv-(\d+)$/);
          parsed = m ? Number(m[1]) : null;
        }
        if (parsed != null) {
          const cache = await tmdbTvDetailsFull(parsed);
          if (cache) updateShowCache(item.id, cache);
        }
        done += 1;
        setProgress({ done, total: totalRefresh });
      }
    } catch (e) {
      setLastError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsRunning(false);
      console.info('[Clastone] DEV refresh end');
    }
  };

  if (!import.meta.env.DEV) return null;

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
                <span className="dev-value">{movieItems.length + tvItems.length}</span>
              </div>
              <div className="dev-row">
                <span className="dev-label">Missing cached fields</span>
                <span className="dev-value">{totalRefresh}</span>
              </div>

              <button
                type="button"
                className="dev-primary"
                disabled={isRunning || totalRefresh === 0}
                onClick={handleRefresh}
              >
                Refresh entry details
              </button>

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

