import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RandomQuote } from '../components/RandomQuote';
import {
  tmdbSearchMulti,
  tmdbMovieDetailsFull,
  tmdbTvDetailsFull,
  tmdbImagePath,
  type TmdbMultiResult
} from '../lib/tmdb';
import { useMoviesStore } from '../state/moviesStore';
import { useTvStore } from '../state/tvStore';
import { useWatchlistStore } from '../state/watchlistStore';
import { RecordWatchModal, type RecordWatchTarget, type RecordWatchSaveParams } from '../components/RecordWatchModal';
import './SearchPage.css';

function resultId(r: TmdbMultiResult): string {
  return `tmdb-${r.media_type}-${r.id}`;
}

export function SearchPage() {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [remoteResults, setRemoteResults] = useState<TmdbMultiResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const {
    addMovieFromSearch,
    addWatchToMovie,
    getMovieById,
    updateMovieCache,
    moveItemToClass,
    classOrder,
    getClassLabel,
    getClassTagline
  } = useMoviesStore();
  const {
    addShowFromSearch,
    addWatchToShow,
    getShowById,
    updateShowCache,
    moveItemToClass: moveShowToClass,
    classOrder: tvClassOrder,
    getClassLabel: getTvClassLabel,
    getClassTagline: getTvClassTagline
  } = useTvStore();
  const [recordTarget, setRecordTarget] = useState<TmdbMultiResult | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const navigate = useNavigate();
  const { addToWatchlist, isInWatchlist } = useWatchlistStore();

  const trimmed = useMemo(() => query.trim(), [query]);

  useEffect(() => {
    abortRef.current?.abort();
    setError(null);

    if (!trimmed) {
      setRemoteResults([]);
      setIsLoading(false);
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;

    const t = window.setTimeout(async () => {
      try {
        setIsLoading(true);
        const results = await tmdbSearchMulti(trimmed, controller.signal);
        setRemoteResults(results);
      } catch (e) {
        if (controller.signal.aborted) return;
        setRemoteResults([]);
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    }, 250);

    return () => {
      window.clearTimeout(t);
      controller.abort();
    };
  }, [trimmed]);

  // Autofocus the search input when arriving on this page.
  useEffect(() => {
    const t = window.setTimeout(() => {
      inputRef.current?.focus();
    }, 0);
    return () => window.clearTimeout(t);
  }, []);

  const handleCloseRecord = () => setRecordTarget(null);

  const handleOpenRecord = (r: TmdbMultiResult) => {
    if (r.media_type !== 'movie' && r.media_type !== 'tv') return;
    setRecordTarget(r);
  };

  const handleAddToUnranked = async (r: TmdbMultiResult) => {
    if (r.media_type !== 'movie') return;
    const id = resultId(r);
    const existing = getMovieById(id);
    if (existing) return;
    setIsSaving(true);
    let cache = null;
    try {
      cache = await tmdbMovieDetailsFull(r.id);
    } catch {
      /* ignore */
    }
    addMovieFromSearch({
      id,
      title: r.title,
      subtitle: 'Saved',
      classKey: 'UNRANKED',
      runtimeMinutes: cache?.runtimeMinutes,
      posterPath: r.poster_path ?? cache?.posterPath,
      cache: cache ?? undefined
    });
    setIsSaving(false);
  };

  const handleAddTvToUnranked = async (r: TmdbMultiResult) => {
    if (r.media_type !== 'tv') return;
    const id = `tmdb-tv-${r.id}`;
    const existing = getShowById(id);
    if (existing) return;
    setIsSaving(true);
    let cache = null;
    try {
      cache = await tmdbTvDetailsFull(r.id);
    } catch {
      /* ignore */
    }
    addShowFromSearch({
      id,
      title: cache?.title ?? r.title,
      subtitle: 'Saved',
      classKey: 'UNRANKED',
      cache: cache ?? undefined
    });
    setIsSaving(false);
  };

  const tvRankedClasses = useMemo(
    () =>
      tvClassOrder
        .filter((k) => k !== 'UNRANKED')
        .map((k) => ({ key: k, label: getTvClassLabel(k), tagline: getTvClassTagline(k) })),
    [tvClassOrder, getTvClassLabel, getTvClassTagline]
  );

  const movieRankedClasses = useMemo(
    () =>
      classOrder
        .filter((k) => k !== 'UNRANKED')
        .map((k) => ({ key: k, label: getClassLabel(k), tagline: getClassTagline(k) })),
    [classOrder, getClassLabel, getClassTagline]
  );

  const handleRecordSave = async (params: RecordWatchSaveParams, goToMovie: boolean) => {
    if (!recordTarget) return;
    const { watch, classKey: recordClassKey, position } = params;
    const toTop = position === 'top';
    const toMiddle = position === 'middle';
    const isMovie = recordTarget.media_type === 'movie';
    const isTv = recordTarget.media_type === 'tv';
    if (!isMovie && !isTv) return;

    if (isMovie) {
      const id = resultId(recordTarget);
      const existing = getMovieById(id);
      const existingIsUnranked = existing?.classKey === 'UNRANKED';

      if (existing) {
        const needsCache = existing.tmdbId == null || existing.overview == null;
        if (needsCache) {
          try {
            const cache = await tmdbMovieDetailsFull(recordTarget.id);
            if (cache) updateMovieCache(id, cache);
          } catch {
            /* ignore */
          }
        }
        addWatchToMovie(id, watch, {
          posterPath: recordTarget.poster_path ?? existing.posterPath
        });
        if (existingIsUnranked && recordClassKey) {
          moveItemToClass(id, recordClassKey, { toTop, toMiddle });
        }
      } else {
        if (!recordClassKey || recordClassKey === 'UNRANKED') return;
        setIsSaving(true);
        let cache = null;
        try {
          cache = await tmdbMovieDetailsFull(recordTarget.id);
        } catch {
          /* ignore */
        }
        addMovieFromSearch({
          id,
          title: recordTarget.title,
          subtitle: recordTarget.subtitle,
          classKey: recordClassKey,
          firstWatch: watch,
          runtimeMinutes: cache?.runtimeMinutes,
          posterPath: recordTarget.poster_path ?? cache?.posterPath,
          cache: cache ?? undefined,
          toTop
        });
        setIsSaving(false);
      }
      setRecordTarget(null);
      if (goToMovie) navigate('/movies', { replace: true, state: { scrollToId: id } });
      return;
    }

    const tvId = recordTarget.id;
    const id = `tmdb-tv-${tvId}`;
    const existing = getShowById(id);
    const existingIsUnranked = existing?.classKey === 'UNRANKED';

    setIsSaving(true);
    let cache = null;
    try {
      cache = await tmdbTvDetailsFull(tvId);
    } catch {
      /* ignore */
    }
    setIsSaving(false);
    if (!cache) return;

    if (existing) {
      if (existing.tmdbId == null || existing.overview == null) {
        updateShowCache(id, cache);
      }
      addWatchToShow(id, watch, { posterPath: cache.posterPath ?? existing.posterPath });
      if (existingIsUnranked && recordClassKey) {
        moveShowToClass(id, recordClassKey, { toTop });
      }
    } else {
      if (!recordClassKey || recordClassKey === 'UNRANKED') return;
      addShowFromSearch({
        id,
        title: cache.title,
        subtitle: recordTarget.subtitle,
        classKey: recordClassKey,
        firstWatch: watch,
        cache,
        toTop
      });
    }
    setRecordTarget(null);
    if (goToMovie) navigate('/tv', { replace: true, state: { scrollToId: id } });
  };

  const recordWatchTarget = useMemo<RecordWatchTarget | null>(() => {
    if (!recordTarget) return null;
    return {
      id: recordTarget.id,
      title: recordTarget.title,
      poster_path: recordTarget.poster_path,
      media_type: recordTarget.media_type as 'movie' | 'tv',
      subtitle: recordTarget.subtitle,
      releaseDate: recordTarget.release_date
    };
  }, [recordTarget]);

  return (
    <section>
      <header className="page-heading">
        <div>
          <h1 className="page-title">Search</h1>
          <RandomQuote />
        </div>
      </header>

      <div className="search-shell card-surface">
        <div className="search-controls">
          <label className="search-label">
            <span>Search</span>
            <input
              ref={inputRef}
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Try “Arcane”, “La La Land”, “Emma Stone”…"
              className="search-input"
            />
          </label>
        </div>

        {error && <div className="search-error">{error}</div>}

        <div className="search-results">
          {remoteResults.map((r) => {
            const id = resultId(r);
            const isMovie = r.media_type === 'movie';
            const isTv = r.media_type === 'tv';
            const imgPath = r.media_type === 'person' ? r.profile_path : r.poster_path;
            const imgUrl = tmdbImagePath(imgPath);
            const existingMovie = isMovie ? getMovieById(id) : null;
            const inUnrankedMovie = existingMovie?.classKey === 'UNRANKED';
            const existingTv = isTv ? getShowById(`tmdb-tv-${r.id}`) : null;
            const inWatchlist = (isMovie || isTv) && isInWatchlist(id);

            const handleAddToWatchlist = () => {
              if (isMovie) {
                addToWatchlist(
                  { id, title: r.title, posterPath: r.poster_path, releaseDate: r.release_date },
                  'movies'
                );
              } else if (isTv) {
                addToWatchlist(
                  { id, title: r.title, posterPath: r.poster_path, releaseDate: r.release_date },
                  'tv'
                );
              }
            };

            return (
              <article key={`${r.media_type}-${r.id}`} className="search-card">
                <div className="search-card-poster">
                  {imgUrl ? (
                    <img src={imgUrl} alt={r.title} />
                  ) : (
                    <div className="search-card-poster-fallback">
                      {r.media_type === 'person' ? '👤' : '🎬'}
                    </div>
                  )}
                </div>
                <div className="search-card-main">
                  <div className="search-card-badge">
                    {r.media_type === 'movie'
                      ? 'MOVIE'
                      : r.media_type === 'tv'
                        ? 'TV'
                        : 'PERSON'}
                  </div>
                  <div className="search-card-title">{r.title}</div>
                  <div className="search-card-subtitle">{r.subtitle}</div>
                </div>
                {isMovie ? (
                  <div className="search-card-actions">
                    <button
                      type="button"
                      className="search-card-action"
                      disabled={isSaving}
                      onClick={() => handleOpenRecord(r)}
                    >
                      {existingMovie && !inUnrankedMovie ? 'Record another watch' : 'Record Watch'}
                    </button>
                    {!existingMovie && (
                      <button
                        type="button"
                        className="search-card-action search-card-action-subtle"
                        disabled={isSaving}
                        onClick={() => void handleAddToUnranked(r)}
                      >
                        Add to unranked
                      </button>
                    )}
                    {inUnrankedMovie && (
                      <button
                        type="button"
                        className="search-card-action search-card-action-subtle"
                        disabled
                      >
                        IN UNRANKED
                      </button>
                    )}
                    {inWatchlist ? (
                      <button type="button" className="search-card-action search-card-action-subtle" disabled>
                        In watchlist
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="search-card-action search-card-action-subtle"
                        disabled={isSaving}
                        onClick={handleAddToWatchlist}
                      >
                        Add to watchlist
                      </button>
                    )}
                  </div>
                ) : isTv ? (
                  <div className="search-card-actions">
                    <button
                      type="button"
                      className="search-card-action"
                      disabled={isSaving}
                      onClick={() => handleOpenRecord(r)}
                    >
                      {existingTv && existingTv.classKey !== 'UNRANKED'
                        ? 'Record another watch'
                        : 'Record Watch'}
                    </button>
                    {!existingTv && (
                      <button
                        type="button"
                        className="search-card-action search-card-action-subtle"
                        disabled={isSaving}
                        onClick={() => void handleAddTvToUnranked(r)}
                      >
                        Add to unranked
                      </button>
                    )}
                    {existingTv?.classKey === 'UNRANKED' && (
                      <button
                        type="button"
                        className="search-card-action search-card-action-subtle"
                        disabled
                      >
                        IN UNRANKED
                      </button>
                    )}
                    {inWatchlist ? (
                      <button type="button" className="search-card-action search-card-action-subtle" disabled>
                        In watchlist
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="search-card-action search-card-action-subtle"
                        disabled={isSaving}
                        onClick={handleAddToWatchlist}
                      >
                        Add to watchlist
                      </button>
                    )}
                  </div>
                ) : (
                  <span className="search-card-no-action">—</span>
                )}
              </article>
            );
          })}
        </div>
      </div>

      {recordWatchTarget && recordTarget && (
        <RecordWatchModal
          target={recordWatchTarget}
          rankedClasses={recordTarget.media_type === 'movie' ? movieRankedClasses : tvRankedClasses}
          showClassPicker={
            recordTarget.media_type === 'movie'
              ? !getMovieById(resultId(recordTarget)) || getMovieById(resultId(recordTarget))?.classKey === 'UNRANKED'
              : !getShowById(`tmdb-tv-${recordTarget.id}`) || getShowById(`tmdb-tv-${recordTarget.id}`)?.classKey === 'UNRANKED'
          }
          onSave={handleRecordSave}
          onClose={handleCloseRecord}
          isSaving={isSaving}
          primaryButtonLabel={recordTarget.media_type === 'tv' ? 'Save and go to show' : 'Save and go to movie'}
        />
      )}
    </section>
  );
}
