import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  tmdbSearchMulti,
  tmdbMovieDetailsFull,
  tmdbTvDetailsFull,
  tmdbImagePath,
  type TmdbMultiResult
} from '../lib/tmdb';
import type { WatchRecord, WatchRecordType } from '../components/EntryRowMovieShow';
import { useMoviesStore } from '../state/moviesStore';
import { useTvStore } from '../state/tvStore';
import { useWatchlistStore } from '../state/watchlistStore';
import './SearchPage.css';

function resultId(r: TmdbMultiResult): string {
  return `tmdb-${r.media_type}-${r.id}`;
}

const WATCH_TYPES: { value: WatchRecordType; label: string }[] = [
  { value: 'DATE', label: 'Watch date' },
  { value: 'RANGE', label: 'Start / end date' },
  { value: 'DNF', label: 'DNF' },
  { value: 'CURRENT', label: 'Currently watching' },
  { value: 'LONG_AGO', label: 'Long ago' },
  { value: 'UNKNOWN', label: 'Unknown' }
];

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
    isRankedClass,
    classOrder,
    getClassLabel
  } = useMoviesStore();
  const {
    addShowFromSearch,
    addWatchToShow,
    getShowById,
    updateShowCache,
    moveItemToClass: moveShowToClass,
    isRankedClass: isRankedShowClass,
    classOrder: tvClassOrder,
    getClassLabel: getTvClassLabel
  } = useTvStore();
  const [recordTarget, setRecordTarget] = useState<TmdbMultiResult | null>(null);
  const [recordError, setRecordError] = useState<string | null>(null);
  const [recordType, setRecordType] = useState<WatchRecordType>('DATE');
  const [recordYear, setRecordYear] = useState('');
  const [recordMonth, setRecordMonth] = useState('');
  const [recordDay, setRecordDay] = useState('');
  const [recordEndYear, setRecordEndYear] = useState('');
  const [recordEndMonth, setRecordEndMonth] = useState('');
  const [recordEndDay, setRecordEndDay] = useState('');
  const [recordDnfPercent, setRecordDnfPercent] = useState(50);
  const [recordClassKey, setRecordClassKey] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { addToWatchlist, removeFromWatchlist, isInWatchlist } = useWatchlistStore();
  const fromWatchlistIdRef = useRef<string | null>(null);

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

  // Open record modal when navigating from Watchlist (Record first/another watch).
  const fromWatchlistState = location.state as { fromWatchlistId?: string; fromWatchlistType?: 'movies' | 'tv' } | null;
  useEffect(() => {
    const fromWatchlistId = fromWatchlistState?.fromWatchlistId;
    const fromWatchlistType = fromWatchlistState?.fromWatchlistType;
    if (!fromWatchlistId || !fromWatchlistType) return;
    const match = fromWatchlistId.match(/^tmdb-(movie|tv)-(\d+)$/);
    if (!match) return;
    const [, media, idStr] = match;
    const tmdbId = parseInt(idStr, 10);
    if (Number.isNaN(tmdbId)) return;
    fromWatchlistIdRef.current = fromWatchlistId;
    const isMovie = media === 'movie';
    (async () => {
      try {
        const cache = isMovie
          ? await tmdbMovieDetailsFull(tmdbId)
          : await tmdbTvDetailsFull(tmdbId);
        if (!cache) return;
        const synthetic: TmdbMultiResult = {
          media_type: isMovie ? 'movie' : 'tv',
          id: tmdbId,
          title: cache.title ?? '',
          subtitle: cache.releaseDate ?? '',
          poster_path: cache.posterPath
        };
        setRecordTarget(synthetic);
        setRecordError(null);
        setRecordType('DATE');
        setRecordYear('');
        setRecordMonth('');
        setRecordDay('');
        setRecordEndYear('');
        setRecordEndMonth('');
        setRecordEndDay('');
        setRecordDnfPercent(50);
        setRecordClassKey('');
      } catch {
        fromWatchlistIdRef.current = null;
      }
    })();
  }, [fromWatchlistState?.fromWatchlistId, fromWatchlistState?.fromWatchlistType]);

  const handleCloseRecord = () => {
    fromWatchlistIdRef.current = null;
    setRecordTarget(null);
  };

  const handleOpenRecord = (r: TmdbMultiResult) => {
    if (r.media_type !== 'movie' && r.media_type !== 'tv') return;
    setRecordTarget(r);
    setRecordError(null);
    setRecordType('DATE');
    setRecordYear('');
    setRecordMonth('');
    setRecordDay('');
    setRecordEndYear('');
    setRecordEndMonth('');
    setRecordEndDay('');
    setRecordDnfPercent(50);
    setRecordClassKey('');
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
        .filter((k) => isRankedShowClass(k))
        .map((k) => ({ key: k, label: getTvClassLabel(k) })),
    [tvClassOrder, isRankedShowClass, getTvClassLabel]
  );

  const buildWatchRecord = (): WatchRecord | null => {
    if (recordType === 'DNF' || recordType === 'CURRENT') {
      const yearNum = Number(recordYear);
      if (!yearNum || Number.isNaN(yearNum)) return null;
      const monthNum = recordMonth ? Number(recordMonth) : undefined;
      const dayNum = recordDay ? Number(recordDay) : undefined;
      if (monthNum !== undefined && (monthNum < 1 || monthNum > 12)) return null;
      if (dayNum !== undefined && (dayNum < 1 || dayNum > 31)) return null;
      return {
        id: crypto.randomUUID(),
        type: recordType,
        year: yearNum,
        month: monthNum,
        day: dayNum,
        dnfPercent: Math.min(100, Math.max(0, recordDnfPercent))
      };
    }
    if (recordType === 'LONG_AGO' || recordType === 'UNKNOWN') {
      return { id: crypto.randomUUID(), type: recordType };
    }
    const yearNum = Number(recordYear);
    if (!yearNum || Number.isNaN(yearNum)) return null;
    if (recordType === 'DATE') {
      const monthNum = recordMonth ? Number(recordMonth) : undefined;
      const dayNum = recordDay ? Number(recordDay) : undefined;
      if (monthNum !== undefined && (monthNum < 1 || monthNum > 12)) return null;
      if (dayNum !== undefined && (dayNum < 1 || dayNum > 31)) return null;
      return {
        id: crypto.randomUUID(),
        type: 'DATE',
        year: yearNum,
        month: monthNum,
        day: dayNum
      };
    }
    // RANGE
    const endYearNum = recordEndYear ? Number(recordEndYear) : undefined;
    const monthNum = recordMonth ? Number(recordMonth) : undefined;
    const dayNum = recordDay ? Number(recordDay) : undefined;
    const endMonthNum = recordEndMonth ? Number(recordEndMonth) : undefined;
    const endDayNum = recordEndDay ? Number(recordEndDay) : undefined;
    if (monthNum !== undefined && (monthNum < 1 || monthNum > 12)) return null;
    if (dayNum !== undefined && (dayNum < 1 || dayNum > 31)) return null;
    if (endMonthNum !== undefined && (endMonthNum < 1 || endMonthNum > 12)) return null;
    if (endDayNum !== undefined && (endDayNum < 1 || endDayNum > 31)) return null;
    return {
      id: crypto.randomUUID(),
      type: 'RANGE',
      year: yearNum,
      month: monthNum,
      day: dayNum,
      endYear: endYearNum,
      endMonth: endMonthNum,
      endDay: endDayNum
    };
  };

  const handleSaveRecord = async (options: { goToMovie: boolean }) => {
    if (!recordTarget) return;
    const isMovie = recordTarget.media_type === 'movie';
    const isTv = recordTarget.media_type === 'tv';
    if (!isMovie && !isTv) return;

    if (recordType === 'DATE' || recordType === 'RANGE') {
      const yearNum = Number(recordYear);
      if (!yearNum || Number.isNaN(yearNum)) {
        setRecordError('Please enter at least a year for this type.');
        return;
      }
    }
    if (recordType === 'DNF' || recordType === 'CURRENT') {
      const yearNum = Number(recordYear);
      if (!yearNum || Number.isNaN(yearNum)) {
        setRecordError('Please enter a start year for this type.');
        return;
      }
    }

    const watch = buildWatchRecord();
    if (!watch) {
      setRecordError('Invalid date fields.');
      return;
    }

    if (isMovie) {
      const id = resultId(recordTarget);
      const existing = getMovieById(id);
      const existingIsUnranked = existing?.classKey === 'UNRANKED';

      if (existingIsUnranked) {
        if (!recordClassKey || !isRankedClass(recordClassKey)) {
          setRecordError('Pick a ranked class to place this entry into.');
          return;
        }
      }

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
          moveItemToClass(id, recordClassKey, { toTop: true });
        }
      } else {
        if (!recordClassKey || !isRankedClass(recordClassKey)) {
          setRecordError('Pick a ranked class for this new entry.');
          return;
        }
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
          cache: cache ?? undefined
        });
        setIsSaving(false);
      }

      const wasFromWatchlist = !!fromWatchlistIdRef.current;
      if (fromWatchlistIdRef.current) {
        removeFromWatchlist(fromWatchlistIdRef.current);
        fromWatchlistIdRef.current = null;
      }
      setRecordTarget(null);
      setRecordError(null);
      if (options.goToMovie) {
        navigate('/movies', { replace: true, state: { scrollToId: id } });
      } else if (wasFromWatchlist) {
        navigate('/search', { replace: true, state: {} });
      }
      return;
    }

    // TV
    const tvId = recordTarget.id;
    const id = `tmdb-tv-${tvId}`;
    const existing = getShowById(id);
    const existingIsUnranked = existing?.classKey === 'UNRANKED';

    if (existingIsUnranked) {
      if (!recordClassKey || !isRankedShowClass(recordClassKey)) {
        setRecordError('Pick a ranked class to place this entry into.');
        return;
      }
    }

    setIsSaving(true);
    let cache = null;
    try {
      cache = await tmdbTvDetailsFull(tvId);
    } catch {
      /* ignore */
    }
    setIsSaving(false);
    if (!cache) {
      setRecordError('Unable to fetch TMDB details for this show.');
      return;
    }

    if (existing) {
      if (existing.tmdbId == null || existing.overview == null) {
        updateShowCache(id, cache);
      }
      addWatchToShow(id, watch, { posterPath: cache.posterPath ?? existing.posterPath });
      if (existingIsUnranked && recordClassKey) {
        moveShowToClass(id, recordClassKey, { toTop: true });
      }
    } else {
      if (!recordClassKey || !isRankedShowClass(recordClassKey)) {
        setRecordError('Pick a ranked class for this new entry.');
        return;
      }
      addShowFromSearch({
        id,
        title: cache.title,
        subtitle: recordTarget.subtitle,
        classKey: recordClassKey,
        firstWatch: watch,
        cache
      });
    }

    const wasFromWatchlistTv = !!fromWatchlistIdRef.current;
    if (fromWatchlistIdRef.current) {
      removeFromWatchlist(fromWatchlistIdRef.current);
      fromWatchlistIdRef.current = null;
    }
    setRecordTarget(null);
    setRecordError(null);
    if (options.goToMovie) {
      navigate('/tv', { replace: true, state: { scrollToId: id } });
    } else if (wasFromWatchlistTv) {
      navigate('/search', { replace: true, state: {} });
    }
  };

  return (
    <section>
      <header className="page-heading">
        <div>
          <h1 className="page-title">Search</h1>
          <p className="page-tagline">TMDB WIRED</p>
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
          <div className="chip chip-accent">
            <span>{isLoading ? 'Searching…' : 'TMDB'}</span>
          </div>
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

      {recordTarget && (recordTarget.media_type === 'movie' || recordTarget.media_type === 'tv') && (
        <div className="record-modal-backdrop" onClick={handleCloseRecord}>
          <div className="record-modal" onClick={(e) => e.stopPropagation()}>
            <header className="record-modal-header">
              <h2>Record watch</h2>
              <button
                type="button"
                className="record-modal-close"
                onClick={handleCloseRecord}
                aria-label="Close record watch"
              >
                ✕
              </button>
            </header>
            <p className="record-modal-title">{recordTarget.title}</p>

            <div className="record-modal-fields">
              <div className="record-modal-field-row">
                <label className="record-modal-class-label">
                  <span>Type</span>
                  <select
                    value={recordType}
                    onChange={(e) => setRecordType(e.target.value as WatchRecordType)}
                  >
                    {WATCH_TYPES.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {(recordType === 'DATE' || recordType === 'RANGE') && (
                <div className="record-modal-field-row">
                  <label>
                    <span>{recordType === 'RANGE' ? 'Start year*' : 'Year*'}</span>
                    <input
                      type="number"
                      value={recordYear}
                      onChange={(e) => setRecordYear(e.target.value)}
                      placeholder="2024"
                    />
                  </label>
                  <label>
                    <span>Month</span>
                    <input
                      type="number"
                      value={recordMonth}
                      onChange={(e) => setRecordMonth(e.target.value)}
                      placeholder="—"
                      min={1}
                      max={12}
                    />
                  </label>
                  <label>
                    <span>Day</span>
                    <input
                      type="number"
                      value={recordDay}
                      onChange={(e) => setRecordDay(e.target.value)}
                      placeholder="—"
                      min={1}
                      max={31}
                    />
                  </label>
                </div>
              )}

              {recordType === 'RANGE' && (
                <div className="record-modal-field-row">
                  <label>
                    <span>End year</span>
                    <input
                      type="number"
                      value={recordEndYear}
                      onChange={(e) => setRecordEndYear(e.target.value)}
                      placeholder="—"
                    />
                  </label>
                  <label>
                    <span>Month</span>
                    <input
                      type="number"
                      value={recordEndMonth}
                      onChange={(e) => setRecordEndMonth(e.target.value)}
                      placeholder="—"
                      min={1}
                      max={12}
                    />
                  </label>
                  <label>
                    <span>Day</span>
                    <input
                      type="number"
                      value={recordEndDay}
                      onChange={(e) => setRecordEndDay(e.target.value)}
                      placeholder="—"
                      min={1}
                      max={31}
                    />
                  </label>
                </div>
              )}

              {(recordType === 'DNF' || recordType === 'CURRENT') && (
                <>
                  <div className="record-modal-field-row">
                    <label>
                      <span>Started year*</span>
                      <input
                        type="number"
                        value={recordYear}
                        onChange={(e) => setRecordYear(e.target.value)}
                        placeholder="2024"
                      />
                    </label>
                    <label>
                      <span>Month</span>
                      <input
                        type="number"
                        value={recordMonth}
                        onChange={(e) => setRecordMonth(e.target.value)}
                        placeholder="—"
                        min={1}
                        max={12}
                      />
                    </label>
                    <label>
                      <span>Day</span>
                      <input
                        type="number"
                        value={recordDay}
                        onChange={(e) => setRecordDay(e.target.value)}
                        placeholder="—"
                        min={1}
                        max={31}
                      />
                    </label>
                  </div>
                  <div className="record-modal-field-row">
                    <label className="record-modal-field-slider">
                      <span>
                        {recordType === 'DNF' ? 'Got through' : 'Current progress'}: {recordDnfPercent}%
                      </span>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={recordDnfPercent}
                        onChange={(e) => setRecordDnfPercent(Number(e.target.value))}
                      />
                    </label>
                  </div>
                </>
              )}

              {((recordTarget.media_type === 'movie' &&
                (!getMovieById(resultId(recordTarget)) ||
                  getMovieById(resultId(recordTarget))?.classKey === 'UNRANKED')) ||
                (recordTarget.media_type === 'tv' &&
                  (!getShowById(`tmdb-tv-${recordTarget.id}`) ||
                    getShowById(`tmdb-tv-${recordTarget.id}`)?.classKey === 'UNRANKED'))) && (
                <div className="record-modal-field-row">
                  <label className="record-modal-class-label">
                    <span>Ranked class*</span>
                    <select
                      value={recordClassKey}
                      onChange={(e) => setRecordClassKey(e.target.value)}
                    >
                      <option value="">Pick a class…</option>
                      {(recordTarget.media_type === 'movie'
                        ? classOrder.filter((k) => isRankedClass(k)).map((k) => ({ key: k, label: getClassLabel(k) }))
                        : tvRankedClasses
                      ).map((c) => (
                        <option key={c.key} value={c.key}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              )}
            </div>

            {recordError && <div className="record-modal-error">{recordError}</div>}

            <footer className="record-modal-footer">
              <button
                type="button"
                className="record-modal-btn record-modal-btn-secondary"
                onClick={() => void handleSaveRecord({ goToMovie: false })}
                disabled={isSaving}
              >
                {isSaving ? 'Saving…' : 'Save and close'}
              </button>
              <button
                type="button"
                className="record-modal-btn"
                onClick={() => void handleSaveRecord({ goToMovie: true })}
                disabled={isSaving}
              >
                {isSaving
                  ? 'Saving…'
                  : recordTarget?.media_type === 'tv'
                    ? 'Save and go to show'
                    : 'Save and go to movie'}
              </button>
            </footer>
          </div>
        </div>
      )}
    </section>
  );
}
