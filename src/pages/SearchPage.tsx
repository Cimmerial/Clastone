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
import { usePeopleStore } from '../state/peopleStore';
import { useDirectorsStore } from '../state/directorsStore';
import { RecordWatchModal, type RecordWatchTarget, type RecordWatchSaveParams } from '../components/RecordWatchModal';
import { SearchResultExtendedInfo } from '../components/SearchResultExtendedInfo';
import './SearchPage.css';

function resultId(r: TmdbMultiResult): string {
  return `tmdb-${r.media_type}-${r.id}`;
}

export function SearchPage() {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [remoteResults, setRemoteResults] = useState<TmdbMultiResult[]>([]);

  const [showMovies, setShowMovies] = useState(() => {
    const s = sessionStorage.getItem('search_movies');
    return s ? JSON.parse(s) : true;
  });
  const [showTv, setShowTv] = useState(() => {
    const s = sessionStorage.getItem('search_tv');
    return s ? JSON.parse(s) : true;
  });
  const [showPeople, setShowPeople] = useState(() => {
    const s = sessionStorage.getItem('search_people');
    return s ? JSON.parse(s) : true;
  });

  useEffect(() => { sessionStorage.setItem('search_movies', JSON.stringify(showMovies)); }, [showMovies]);
  useEffect(() => { sessionStorage.setItem('search_tv', JSON.stringify(showTv)); }, [showTv]);
  useEffect(() => { sessionStorage.setItem('search_people', JSON.stringify(showPeople)); }, [showPeople]);

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
    getClassTagline,
    removeMovieEntry
  } = useMoviesStore();
  const {
    addShowFromSearch,
    addWatchToShow,
    getShowById,
    updateShowCache,
    moveItemToClass: moveShowToClass,
    classOrder: tvClassOrder,
    getClassLabel: getTvClassLabel,
    getClassTagline: getTvClassTagline,
    removeShowEntry
  } = useTvStore();
  const {
    addPersonFromSearch,
    getPersonById,
    updatePersonCache,
    moveItemToClass: movePersonToClass,
    classOrder: peopleClassOrder,
    classes: peopleClasses,
    removePersonEntry
  } = usePeopleStore();
  const {
    addDirectorFromSearch,
    getDirectorById,
    updateDirectorCache,
    moveItemToClass: moveDirectorToClass,
    classOrder: directorsClassOrder,
    classes: directorsClasses,
    removeDirectorEntry
  } = useDirectorsStore();
  const [recordTarget, setRecordTarget] = useState<TmdbMultiResult | null>(null);
  const [personSaveType, setPersonSaveType] = useState<'actor' | 'director' | null>(null);
  const [recordDetails, setRecordDetails] = useState<any | null>(null);
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

        let results: any[] = [];
        if (showMovies && showTv && showPeople) {
          results = await tmdbSearchMulti(trimmed, controller.signal);
        } else {
          // If toggles are off, individually fetch the ones that are ON
          const promises = [];
          if (showMovies) promises.push(import('../lib/tmdb').then(m => m.tmdbSearchMovies(trimmed, controller.signal)));
          if (showTv) promises.push(import('../lib/tmdb').then(m => m.tmdbSearchTv(trimmed, controller.signal)));
          if (showPeople) promises.push(import('../lib/tmdb').then(m => m.tmdbSearchPeople(trimmed, controller.signal)));

          const responses = await Promise.all(promises);
          // Flatten results and sort by popularity
          results = responses.flat().sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
        }

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

  const handleCloseRecord = () => {
    setRecordTarget(null);
    setPersonSaveType(null);
  };

  const handleOpenRecord = async (r: TmdbMultiResult, type?: 'actor' | 'director') => {
    if (r.media_type !== 'movie' && r.media_type !== 'tv' && r.media_type !== 'person') return;
    setRecordTarget(r);
    if (type) setPersonSaveType(type);
    setIsSaving(true);
    try {
      const cache = r.media_type === 'movie'
        ? await tmdbMovieDetailsFull(r.id)
        : r.media_type === 'tv'
          ? await tmdbTvDetailsFull(r.id)
          : await import('../lib/tmdb').then(m => m.tmdbPersonDetailsFull(r.id));
      if (cache) {
        setRecordDetails(cache);
      }
    } catch {
      /* ignore */
    } finally {
      setIsLoading(false);
      setIsSaving(false);
    }
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

  const handleAddPersonToUnranked = async (r: TmdbMultiResult, type: 'actor' | 'director') => {
    if (r.media_type !== 'person') return;
    const id = resultId(r);
    const existing = type === 'actor' ? getPersonById(id) : getDirectorById(id);
    if (existing) return;
    setIsSaving(true);
    let cache = null;
    try {
      cache = await import('../lib/tmdb').then(m => m.tmdbPersonDetailsFull(r.id));
    } catch {
      /* ignore */
    }
    if (type === 'actor') {
      addPersonFromSearch({
        id,
        title: r.title,
        profilePath: r.profile_path ?? cache?.profilePath,
        classKey: 'UNRANKED',
        cache: cache ?? undefined
      });
    } else {
      addDirectorFromSearch({
        id,
        title: r.title,
        profilePath: r.profile_path ?? cache?.profilePath,
        classKey: 'UNRANKED',
        cache: cache ?? undefined
      });
    }
    setIsSaving(false);
  };

  const tvRankedClasses = useMemo(
    () =>
      tvClassOrder.map((k) => ({
        key: k,
        label: getTvClassLabel(k),
        tagline: getTvClassTagline(k),
        isRanked: k !== 'UNRANKED' && k !== 'DONT_REMEMBER' && k !== 'BABY' && k !== 'DELICIOUS_GARBAGE' // Approximation, or use store.isRanked
      })),
    [tvClassOrder, getTvClassLabel, getTvClassTagline]
  );

  const movieRankedClasses = useMemo(
    () =>
      classOrder.map((k) => ({
        key: k,
        label: getClassLabel(k),
        tagline: getClassTagline(k),
        isRanked: k !== 'UNRANKED' && k !== 'DONT_REMEMBER' && k !== 'BABY' && k !== 'DELICIOUS_GARBAGE'
      })),
    [classOrder, getClassLabel, getClassTagline]
  );

  const peopleRankedClasses = useMemo(
    () =>
      peopleClassOrder.map((k) => {
        const c = peopleClasses.find(c => c.key === k);
        return { key: k, label: c?.label ?? k.replace(/_/g, ' '), tagline: c?.tagline ?? '' };
      }),
    [peopleClassOrder, peopleClasses]
  );

  const directorsRankedClasses = useMemo(
    () =>
      directorsClassOrder.map((k) => {
        const c = directorsClasses.find(c => c.key === k);
        return { key: k, label: c?.label ?? k.replace(/_/g, ' '), tagline: c?.tagline ?? '' };
      }),
    [directorsClassOrder, directorsClasses]
  );

  const handleRecordSave = async (params: RecordWatchSaveParams, goToMovie: boolean) => {
    if (!recordTarget) return;
    const { watches, classKey: recordClassKey, position } = params;
    const toTop = position === 'top';
    const toMiddle = position === 'middle';
    const id = resultId(recordTarget);

    if (recordTarget.media_type === 'movie') {
      const existing = getMovieById(id);
      const existingIsUnranked = existing?.classKey === 'UNRANKED';

      if (existing) {
        if (existing.tmdbId == null || existing.overview == null) {
          try {
            const cache = await tmdbMovieDetailsFull(recordTarget.id);
            if (cache) updateMovieCache(id, cache);
          } catch { /* ignore */ }
        }
        for (const w of watches) {
          addWatchToMovie(id, w, { posterPath: recordTarget.poster_path ?? existing.posterPath });
        }
        // Move item if class changed or if position is specified for the same class
        if (recordClassKey && (existingIsUnranked || existing.classKey !== recordClassKey || position)) {
          moveItemToClass(id, recordClassKey, { toTop, toMiddle });
        }
      } else {
        if (!recordClassKey || recordClassKey === 'UNRANKED') return;
        setIsSaving(true);
        let cache = null;
        try {
          cache = await tmdbMovieDetailsFull(recordTarget.id);
        } catch { /* ignore */ }
        addMovieFromSearch({
          id,
          title: recordTarget.title,
          subtitle: recordTarget.subtitle,
          classKey: recordClassKey,
          firstWatch: watches[0],
          runtimeMinutes: cache?.runtimeMinutes,
          posterPath: recordTarget.poster_path ?? cache?.posterPath,
          cache: cache ?? undefined,
          toTop,
          toMiddle
        });
        for (let i = 1; i < watches.length; i++) addWatchToMovie(id, watches[i]);
        setIsSaving(false);
      }
      setRecordTarget(null);
      if (goToMovie) navigate('/movies', { replace: true, state: { scrollToId: id } });
      return;
    }

    if (recordTarget.media_type === 'tv') {
      const tvId = recordTarget.id;
      const existing = getShowById(id);
      const existingIsUnranked = existing?.classKey === 'UNRANKED';

      setIsSaving(true);
      let cache = null;
      try {
        cache = await tmdbTvDetailsFull(tvId);
      } catch { /* ignore */ }
      setIsSaving(false);
      if (!cache) return;

      if (existing) {
        if (existing.tmdbId == null || existing.overview == null) updateShowCache(id, cache);
        for (const w of watches) addWatchToShow(id, w, { posterPath: cache.posterPath ?? existing.posterPath });
        // Move item if class changed or if position is specified for the same class
        if (recordClassKey && (existingIsUnranked || existing.classKey !== recordClassKey || position)) {
          moveShowToClass(id, recordClassKey, { toTop, toMiddle });
        }
      } else {
        if (!recordClassKey || recordClassKey === 'UNRANKED') return;
        addShowFromSearch({
          id,
          title: cache.title,
          subtitle: recordTarget.subtitle,
          classKey: recordClassKey,
          firstWatch: watches[0],
          cache,
          toTop,
          toMiddle
        });
        for (let i = 1; i < watches.length; i++) addWatchToShow(id, watches[i]);
      }
      setRecordTarget(null);
      if (goToMovie) navigate('/tv', { replace: true, state: { scrollToId: id } });
      return;
    }

    if (recordTarget.media_type === 'person') {
      const type = personSaveType || 'actor';
      const isActor = type === 'actor';
      const existing = isActor ? getPersonById(id) : getDirectorById(id);

      if (existing) {
        // Move person if class changed or if position is specified for the same class
        if (recordClassKey && (existing.classKey !== recordClassKey || position)) {
          if (isActor) movePersonToClass(id, recordClassKey, { toTop, toMiddle });
          else moveDirectorToClass(id, recordClassKey, { toTop, toMiddle });
        }
      } else {
        if (!recordClassKey || recordClassKey === 'UNRANKED') return;
        setIsSaving(true);
        let cache = null;
        try {
          cache = await import('../lib/tmdb').then(m => m.tmdbPersonDetailsFull(recordTarget.id));
        } catch { /* ignore */ }

        if (isActor) {
          addPersonFromSearch({
            id,
            title: recordTarget.title,
            profilePath: recordTarget.poster_path,
            classKey: recordClassKey,
            cache: cache ?? undefined,
            position
          });
        } else {
          addDirectorFromSearch({
            id,
            title: recordTarget.title,
            profilePath: recordTarget.poster_path,
            classKey: recordClassKey,
            cache: cache ?? undefined,
            position
          });
        }

        setIsSaving(false);
      }
      setRecordTarget(null);
      setPersonSaveType(null);
      if (goToMovie) navigate(isActor ? '/actors' : '/directors', { replace: true, state: { scrollToId: id } });
      return;
    }
  };

  const recordWatchTarget = useMemo<RecordWatchTarget | null>(() => {
    if (!recordTarget) return null;
    return {
      id: recordTarget.id,
      title: recordTarget.title,
      poster_path: recordTarget.poster_path,
      media_type: recordTarget.media_type as 'movie' | 'tv' | 'person',
      subtitle: recordTarget.subtitle,
      releaseDate: recordTarget.release_date,
      runtimeMinutes: recordDetails?.runtimeMinutes,
      totalEpisodes: recordDetails?.totalEpisodes
    };
  }, [recordTarget, recordDetails]);

  const filteredResults = useMemo(() => {
    return remoteResults.filter(r => {
      if (r.media_type === 'movie') return showMovies;
      if (r.media_type === 'tv') return showTv;
      if (r.media_type === 'person') return showPeople;
      return false;
    });
  }, [remoteResults, showMovies, showTv, showPeople]);

  const placeholderText = useMemo(() => {
    if (showMovies && showTv && showPeople) return 'Try “Arcane”, “La La Land”, “Emma Stone”…';
    if (showMovies && !showTv && !showPeople) return 'Try “La La Land”, “The Matrix”…';
    if (!showMovies && showTv && !showPeople) return 'Try “Arcane”, “Game of Thrones”…';
    if (!showMovies && !showTv && showPeople) return 'Try “Emma Stone”, “Steven Spielberg”…';
    if (showMovies && showTv && !showPeople) return 'Try “La La Land”, “Arcane”…';
    if (showMovies && !showTv && showPeople) return 'Try “La La Land”, “Emma Stone”…';
    if (!showMovies && showTv && showPeople) return 'Try “Arcane”, “Emma Stone”…';
    return 'Search for something…';
  }, [showMovies, showTv, showPeople]);

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
              placeholder={placeholderText}
              className="search-input"
            />
          </label>
          <div className="search-filters">
            <button
              type="button"
              className={`search-filter-btn ${showMovies ? 'active' : ''}`}
              onClick={() => setShowMovies(!showMovies)}
            >
              Movies
            </button>
            <button
              type="button"
              className={`search-filter-btn ${showTv ? 'active' : ''}`}
              onClick={() => setShowTv(!showTv)}
            >
              TV Shows
            </button>
            <button
              type="button"
              className={`search-filter-btn ${showPeople ? 'active' : ''}`}
              onClick={() => setShowPeople(!showPeople)}
            >
              People
            </button>
          </div>
        </div>

        {error && <div className="search-error">{error}</div>}

        <div className="search-results">
          {filteredResults.map((r) => {
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
                  <div className="search-card-subtitle">
                    {r.subtitle}
                    {(isMovie || isTv) && (
                      <SearchResultExtendedInfo id={r.id} mediaType={r.media_type as 'movie' | 'tv'} />
                    )}
                  </div>
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
                ) : r.media_type === 'person' ? (
                  <div className="search-card-actions search-card-actions-person">
                    <div className="search-card-action-group">
                      <span className="search-card-action-label">Actor</span>
                      <button
                        type="button"
                        className="search-card-action"
                        disabled={isSaving}
                        onClick={() => handleOpenRecord(r, 'actor')}
                      >
                        {getPersonById(id) && getPersonById(id)?.classKey !== 'UNRANKED' ? 'Edit' : 'Add'}
                      </button>
                      {!getPersonById(id) && (
                        <button
                          type="button"
                          className="search-card-action search-card-action-subtle"
                          disabled={isSaving}
                          onClick={() => void handleAddPersonToUnranked(r, 'actor')}
                        >
                          Unranked
                        </button>
                      )}
                      {getPersonById(id)?.classKey === 'UNRANKED' && (
                        <span className="search-card-status">IN UNRANKED</span>
                      )}
                    </div>

                    <div className="search-card-action-group">
                      <span className="search-card-action-label">Director</span>
                      <button
                        type="button"
                        className="search-card-action"
                        disabled={isSaving}
                        onClick={() => handleOpenRecord(r, 'director')}
                      >
                        {getDirectorById(id) && getDirectorById(id)?.classKey !== 'UNRANKED' ? 'Edit' : 'Add'}
                      </button>
                      {!getDirectorById(id) && (
                        <button
                          type="button"
                          className="search-card-action search-card-action-subtle"
                          disabled={isSaving}
                          onClick={() => void handleAddPersonToUnranked(r, 'director')}
                        >
                          Unranked
                        </button>
                      )}
                      {getDirectorById(id)?.classKey === 'UNRANKED' && (
                        <span className="search-card-status">IN UNRANKED</span>
                      )}
                    </div>
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
          rankedClasses={
            recordTarget.media_type === 'movie'
              ? movieRankedClasses
              : recordTarget.media_type === 'tv'
                ? tvRankedClasses
                : personSaveType === 'director'
                  ? directorsRankedClasses
                  : peopleRankedClasses
          }
          mode={
            recordTarget.media_type === 'person'
              ? 'person'
              : recordTarget.media_type === 'movie'
                ? (getMovieById(resultId(recordTarget)) && getMovieById(resultId(recordTarget))?.classKey !== 'UNRANKED'
                  ? 'edit-watch'
                  : 'first-watch')
                : (getShowById(`tmdb-tv-${recordTarget.id}`) && getShowById(`tmdb-tv-${recordTarget.id}`)?.classKey !== 'UNRANKED'
                  ? 'edit-watch'
                  : 'first-watch')
          }
          currentClassKey={
            recordTarget.media_type === 'movie'
              ? getMovieById(resultId(recordTarget))?.classKey
              : recordTarget.media_type === 'tv'
                ? getShowById(`tmdb-tv-${recordTarget.id}`)?.classKey
                : undefined
          }
          currentClassLabel={
            recordTarget.media_type === 'movie'
              ? getClassLabel(getMovieById(resultId(recordTarget))?.classKey ?? '')
              : recordTarget.media_type === 'tv'
                ? getTvClassLabel(getShowById(`tmdb-tv-${recordTarget.id}`)?.classKey ?? '')
                : undefined
          }
          onSave={handleRecordSave}
          onClose={handleCloseRecord}
          onRemoveEntry={(id) => {
            if (recordTarget.media_type === 'movie') removeMovieEntry(id);
            else if (recordTarget.media_type === 'tv') removeShowEntry(id);
            else if (personSaveType === 'director') removeDirectorEntry(id);
            else removePersonEntry(id);
            handleCloseRecord();
          }}
          isSaving={isSaving}
          onAddToUnranked={() => {
            const id = resultId(recordTarget);
            if (recordTarget.media_type === 'movie') moveItemToClass(id, 'UNRANKED');
            else if (recordTarget.media_type === 'tv') moveShowToClass(id, 'UNRANKED');
            handleCloseRecord();
          }}
        />
      )}
    </section>
  );
}
