import { useMemo, useState } from 'react';
import { tmdbMovieDetailsFull, tmdbTvDetailsFull, type TmdbMovieCache, type TmdbTvCache } from '../lib/tmdb';
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
  const { byClass: moviesByClass, classOrder: movieClassOrder, updateBatchMovieCache } = useMoviesStore();
  const { byClass: tvByClass, classOrder: tvClassOrder, updateBatchShowCache } = useTvStore();
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

