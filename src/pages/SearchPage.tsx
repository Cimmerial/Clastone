import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RandomQuote } from '../components/RandomQuote';
import {
  tmdbSearchMulti,
  tmdbMovieDetailsFull,
  tmdbTvDetailsFull,
  tmdbImagePath,
  tmdbDiscoverMoviesByYear,
  tmdbDiscoverTvByYear,
  type TmdbMultiResult
} from '../lib/tmdb';
import { useMoviesStore } from '../state/moviesStore';
import { useTvStore } from '../state/tvStore';
import { useWatchlistStore } from '../state/watchlistStore';
import { usePeopleStore } from '../state/peopleStore';
import { useDirectorsStore } from '../state/directorsStore';
import { UniversalEditModal, type UniversalEditTarget, type UniversalEditSaveParams } from '../components/UniversalEditModal';
import { PersonRankingModal, type PersonRankingTarget, type PersonRankingSaveParams } from '../components/PersonRankingModal';
import { GenreEditModal } from '../components/GenreEditModal';
import type { WatchRecord } from '../components/EntryRowMovieShow';
import { SearchResultExtendedInfo } from '../components/SearchResultExtendedInfo';
import { SearchPersonProjects } from '../components/SearchPersonProjects';
import './SearchPage.css';

function resultId(r: TmdbMultiResult): string {
  return `tmdb-${r.media_type}-${r.id}`;
}

export function SearchPage() {
  // Persist search query and results
  const [query, setQuery] = useState(() => {
    const saved = sessionStorage.getItem('search_query');
    return saved || '';
  });
  const [remoteResults, setRemoteResults] = useState<TmdbMultiResult[]>(() => {
    const saved = sessionStorage.getItem('search_results');
    return saved ? JSON.parse(saved) : [];
  });
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Query type toggles (allow multiple)
  const [showMovies, setShowMovies] = useState(() => {
    const saved = sessionStorage.getItem('search_movies');
    return saved ? JSON.parse(saved) : true;
  });
  const [showTv, setShowTv] = useState(() => {
    const saved = sessionStorage.getItem('search_tv');
    return saved ? JSON.parse(saved) : true;
  });
  const [showPeople, setShowPeople] = useState(() => {
    const saved = sessionStorage.getItem('search_people');
    return saved ? JSON.parse(saved) : true;
  });
  
  // Search depth toggle
  const [searchDepth, setSearchDepth] = useState<'simple' | 'extensive'>(() => {
    const saved = sessionStorage.getItem('search_depth');
    return (saved as any) || 'simple';
  });

  // Tab selection
  const [activeTab, setActiveTab] = useState<'search' | 'wander'>(() => {
    const saved = sessionStorage.getItem('search_active_tab');
    return (saved as any) || 'search';
  });

  // Wander state
  const [wanderYear, setWanderYear] = useState(new Date().getFullYear());
  const [wanderMediaType, setWanderMediaType] = useState<'movies' | 'shows'>('movies');
  const [wanderResults, setWanderResults] = useState<TmdbMultiResult[]>([]);
  const [wanderPage, setWanderPage] = useState(1);
  const [wanderLoading, setWanderLoading] = useState(false);
  const [wanderError, setWanderError] = useState<string | null>(null);
  const [lastPageWasFull, setLastPageWasFull] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [wanderColumnCount, setWanderColumnCount] = useState<1 | 2 | 3>(() => {
    const saved = sessionStorage.getItem('wander_column_count');
    return saved ? (parseInt(saved) as 1 | 2 | 3) : 2;
  });
  
  // Genre filter state
  const [wanderSelectedGenres, setWanderSelectedGenres] = useState<string[]>(() => {
    const saved = sessionStorage.getItem('wander_selected_genres');
    return saved ? JSON.parse(saved) : [];
  });
  const [isGenreModalOpen, setIsGenreModalOpen] = useState(false);

  useEffect(() => { sessionStorage.setItem('search_movies', JSON.stringify(showMovies)); }, [showMovies]);
  useEffect(() => { sessionStorage.setItem('search_tv', JSON.stringify(showTv)); }, [showTv]);
  useEffect(() => { sessionStorage.setItem('search_people', JSON.stringify(showPeople)); }, [showPeople]);
  useEffect(() => { sessionStorage.setItem('search_depth', searchDepth); }, [searchDepth]);
  useEffect(() => { sessionStorage.setItem('search_active_tab', activeTab); }, [activeTab]);
  useEffect(() => { sessionStorage.setItem('wander_column_count', wanderColumnCount.toString()); }, [wanderColumnCount]);
  useEffect(() => { sessionStorage.setItem('wander_selected_genres', JSON.stringify(wanderSelectedGenres)); }, [wanderSelectedGenres]);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const {
    addMovieFromSearch,
    addWatchToMovie,
    getMovieById,
    updateMovieCache,
    updateMovieWatchRecords,
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
    updateShowWatchRecords,
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
  const { addToWatchlist, isInWatchlist, removeFromWatchlist } = useWatchlistStore();

  const trimmed = useMemo(() => query.trim(), [query]);

  // Save query and results to sessionStorage when they change
  useEffect(() => {
    sessionStorage.setItem('search_query', query);
  }, [query]);

  useEffect(() => {
    sessionStorage.setItem('search_results', JSON.stringify(remoteResults));
  }, [remoteResults]);

  // Clear search function
  const clearSearch = () => {
    setQuery('');
    setRemoteResults([]);
    sessionStorage.removeItem('search_query');
    sessionStorage.removeItem('search_results');
  };

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

  // Handle save from UniversalEditModal for movies/TV
  const handleMediaSave = async (params: UniversalEditSaveParams, goToMedia: boolean, targetId: string, mediaType: 'movie' | 'tv') => {
    const { watches, classKey: recordClassKey, position } = params;
    const toTop = position === 'top';
    const toMiddle = position === 'middle';

    // Convert WatchMatrixEntry[] to WatchRecord[]
    const watchRecords = watches.map((w) => {
      let type: WatchRecord['type'] = 'DATE';
      if (w.watchType === 'DATE_RANGE') type = 'RANGE';
      else if (w.watchType === 'LONG_AGO') {
        type = w.watchStatus === 'DNF' ? 'DNF_LONG_AGO' : 'LONG_AGO';
      }
      
      if (w.watchStatus === 'WATCHING' && w.watchType !== 'LONG_AGO') type = 'CURRENT';
      else if (w.watchStatus === 'DNF' && w.watchType !== 'LONG_AGO') type = 'DNF';
      
      return {
        id: w.id,
        type,
        year: w.year,
        month: w.month,
        day: w.day,
        endYear: w.endYear,
        endMonth: w.endMonth,
        endDay: w.endDay,
        dnfPercent: w.watchPercent < 100 ? w.watchPercent : undefined,
      };
    });

    if (mediaType === 'movie') {
      const existing = getMovieById(targetId);
      if (existing) {
        if (existing.tmdbId == null || existing.overview == null) {
          try {
            const tmdbId = parseInt(targetId.replace(/\D/g, ''), 10);
            const cache = await tmdbMovieDetailsFull(tmdbId);
            if (cache) updateMovieCache(targetId, cache);
          } catch { /* ignore */ }
        }
        updateMovieWatchRecords(targetId, watchRecords);
        if (recordClassKey && (existing.classKey !== recordClassKey || position)) {
          moveItemToClass(targetId, recordClassKey, { toTop, toMiddle });
        }
      } else {
        // Add new movie (including UNRANKED)
        setIsSaving(true);
        let cache = null;
        try {
          const tmdbId = parseInt(targetId.replace(/\D/g, ''), 10);
          cache = await tmdbMovieDetailsFull(tmdbId);
        } catch { /* ignore */ }
        addMovieFromSearch({
          id: targetId,
          title: recordTarget?.title ?? '',
          subtitle: recordTarget?.subtitle,
          classKey: recordClassKey || 'UNRANKED',
          firstWatch: watchRecords[0],
          runtimeMinutes: cache?.runtimeMinutes,
          posterPath: recordTarget?.poster_path ?? cache?.posterPath,
          cache: cache ?? undefined,
          toTop,
          toMiddle
        });
        for (let i = 1; i < watchRecords.length; i++) addWatchToMovie(targetId, watchRecords[i]);
        setIsSaving(false);
      }
      setRecordTarget(null);
      if (goToMedia) navigate('/movies', { replace: true, state: { scrollToId: targetId } });
    } else {
      const existing = getShowById(targetId);
      setIsSaving(true);
      let cache = null;
      try {
        const tmdbId = parseInt(targetId.replace(/\D/g, ''), 10);
        cache = await tmdbTvDetailsFull(tmdbId);
      } catch { /* ignore */ }
      setIsSaving(false);
      if (!cache) return;

      if (existing) {
        if (existing.tmdbId == null || existing.overview == null) updateShowCache(targetId, cache);
        updateShowWatchRecords(targetId, watchRecords);
        if (recordClassKey && (existing.classKey !== recordClassKey || position)) {
          moveShowToClass(targetId, recordClassKey, { toTop, toMiddle });
        }
      } else {
        // Add new TV show (including UNRANKED)
        addShowFromSearch({
          id: targetId,
          title: cache.title,
          subtitle: recordTarget?.subtitle,
          classKey: recordClassKey || 'UNRANKED',
          firstWatch: watchRecords[0],
          cache,
          toTop,
          toMiddle
        });
        for (let i = 1; i < watchRecords.length; i++) addWatchToShow(targetId, watchRecords[i]);
      }
      setRecordTarget(null);
      if (goToMedia) navigate('/tv', { replace: true, state: { scrollToId: targetId } });
    }
  };

  // Handle save from PersonRankingModal
  const handlePersonSave = async (params: PersonRankingSaveParams, goToList: boolean) => {
    if (!recordTarget || recordTarget.media_type !== 'person') return;
    
    const type = personSaveType || 'actor';
    const isActor = type === 'actor';
    const id = resultId(recordTarget);
    const { classKey: recordClassKey, position } = params;
    const toTop = position === 'top';
    const toMiddle = position === 'middle';

    const existing = isActor ? getPersonById(id) : getDirectorById(id);

    if (existing) {
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
    if (goToList) navigate(isActor ? '/actors' : '/directors', { replace: true, state: { scrollToId: id } });
  };

  // Wander functionality
  const loadWanderContent = async (reset: boolean = false) => {
    if (wanderLoading || isLoadingMore) return;
    
    const page = reset ? 1 : wanderPage + 1;
    const isLoadMore = !reset;
    
    if (isLoadMore) {
      setIsLoadingMore(true);
    } else {
      setWanderLoading(true);
    }
    setWanderError(null);
    
    try {
      console.log(`Loading ${wanderMediaType} for year ${wanderYear}, page ${page}, reset=${reset}, genres=${wanderSelectedGenres.length > 0 ? wanderSelectedGenres.join(' OR ') : 'none (all)'}`);
      
      // Calculate how many pages to load based on media type
      const targetItemsPerLoad = wanderMediaType === 'movies' ? 50 : 26;
      const pagesToLoad = Math.ceil(targetItemsPerLoad / 20); // TMDB returns 20 per page
      
      let allResults: TmdbMultiResult[] = [];
      
      // Load multiple pages at once
      for (let i = 0; i < pagesToLoad; i++) {
        const currentPage = page + i;
        console.log(`Fetching page ${currentPage} of ${pagesToLoad}`);
        
        const results = wanderMediaType === 'movies' 
          ? await tmdbDiscoverMoviesByYear(wanderYear, currentPage, undefined, wanderSelectedGenres)
          : await tmdbDiscoverTvByYear(wanderYear, currentPage, undefined, wanderSelectedGenres);
        
        console.log(`API returned ${results.length} results for page ${currentPage}`);
        
        if (results.length === 0) break; // No more results
        
        allResults = [...allResults, ...results];
        
        // If we didn't get a full page, this might be the last page
        if (results.length < 20) {
          break;
        }
      }
      
      console.log(`Total fetched: ${allResults.length} results`);
      
      // Track if the last page was full
      const lastPageWasFull = allResults.length >= 20 && allResults.length % 20 === 0;
      setLastPageWasFull(lastPageWasFull);
      
      if (reset) {
        // Ensure uniqueness even on reset
        const uniqueResults = allResults.filter((item, index, self) => 
          index === self.findIndex((t) => `${t.media_type}-${t.id}` === `${item.media_type}-${item.id}`)
        );
        setWanderResults(uniqueResults);
        setWanderPage(pagesToLoad);
        console.log(`Reset: set ${uniqueResults.length} results (was ${allResults.length})`);
      } else {
        // Prevent duplicates by filtering out existing IDs
        const existingIds = new Set(wanderResults.map(r => `${r.media_type}-${r.id}`));
        console.log(`Existing IDs count: ${existingIds.size}`);
        
        const newResults = allResults.filter(r => {
          const key = `${r.media_type}-${r.id}`;
          const isDuplicate = existingIds.has(key);
          if (isDuplicate) {
            console.log(`Duplicate found: ${key} - ${r.title}`);
          }
          return !isDuplicate;
        });
        
        console.log(`Filtered duplicates: ${newResults.length} new results out of ${allResults.length}`);
        
        // Additional safety: dedupe the final array
        const finalResults = [...wanderResults, ...newResults];
        const uniqueResults = finalResults.filter((item, index, self) => 
          index === self.findIndex((t) => `${t.media_type}-${t.id}` === `${item.media_type}-${item.id}`)
        );
        
        console.log(`Final unique count: ${uniqueResults.length} (was ${finalResults.length})`);
        
        setWanderResults(uniqueResults);
        setWanderPage(page + pagesToLoad - 1);
      }
    } catch (err) {
      console.error('Error loading wander content:', err);
      setWanderError(err instanceof Error ? err.message : String(err));
      setLastPageWasFull(false);
    } finally {
      setWanderLoading(false);
      setIsLoadingMore(false);
    }
  };

  // Scroll to top function
  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Calculate if we should show load more button - use a simple approach without useMemo to avoid re-render issues
  const shouldShowLoadMore = wanderResults.length > 0 && lastPageWasFull && !isLoadingMore;
  
  // Debug logging
  console.log(`State: total=${wanderResults.length}, page=${wanderPage}, lastPageWasFull=${lastPageWasFull}, isLoadingMore=${isLoadingMore}, shouldShow=${shouldShowLoadMore}`);

  // Generate year options for dropdown (current year - 50 to current year)
  const currentYear = new Date().getFullYear();
  const yearOptions = useMemo(() => {
    const years = [];
    for (let year = currentYear - 50; year <= currentYear; year++) {
      years.push(year);
    }
    return years.reverse(); // Most recent first
  }, [currentYear]);

  const handleYearIncrement = () => {
    if (wanderYear < currentYear) {
      handleWanderYearChange(wanderYear + 1);
    }
  };

  const handleYearDecrement = () => {
    if (wanderYear > currentYear - 50) {
      handleWanderYearChange(wanderYear - 1);
    }
  };

  const handleWanderYearChange = (newYear: number) => {
    setWanderYear(newYear);
    setWanderResults([]);
    setWanderPage(1);
    setLastPageWasFull(false); // Don't assume full page until we load
    setWanderError(null);
  };

  const handleWanderMediaTypeChange = (mediaType: 'movies' | 'shows') => {
    setWanderMediaType(mediaType);
    setWanderResults([]);
    setWanderPage(1);
    setLastPageWasFull(false); // Don't assume full page until we load
    setWanderError(null);
  };

  const handleWanderGenresChange = (genres: string[]) => {
    setWanderSelectedGenres(genres);
    setWanderResults([]);
    setWanderPage(1);
    setLastPageWasFull(false);
    setWanderError(null);
  };

  // Load initial wander content when media type, year, or genres change
  useEffect(() => {
    if (activeTab === 'wander' && wanderResults.length === 0) {
      loadWanderContent(true);
    }
  }, [wanderYear, wanderMediaType, wanderSelectedGenres, activeTab]);

  const filteredResults = useMemo(() => {
    return remoteResults.filter(r => {
      if (r.media_type === 'movie') return showMovies;
      if (r.media_type === 'tv') return showTv;
      if (r.media_type === 'person') return showPeople;
      return false;
    });
  }, [remoteResults, showMovies, showTv, showPeople]);

  const placeholderText = useMemo(() => {
    if (showMovies && showTv && showPeople) return 'Try "Arcane", "La La Land", "Emma Stone"…';
    if (showMovies && !showTv && !showPeople) return 'Try "La La Land", "The Matrix"…';
    if (!showMovies && showTv && !showPeople) return 'Try "Arcane", "Game of Thrones"…';
    if (!showMovies && !showTv && showPeople) return 'Try "Emma Stone", "Steven Spielberg"…';
    if (showMovies && showTv && !showPeople) return 'Try "La La Land", "Arcane"…';
    if (showMovies && !showTv && showPeople) return 'Try "La La Land", "Emma Stone"…';
    if (!showMovies && showTv && showPeople) return 'Try "Arcane", "Emma Stone"…';
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
        {/* Tab Selection */}
        <div className="search-tabs">
          <button
            type="button"
            className={`search-tab ${activeTab === 'search' ? 'active' : ''}`}
            onClick={() => setActiveTab('search')}
          >
            Search
          </button>
          <button
            type="button"
            className={`search-tab ${activeTab === 'wander' ? 'active' : ''}`}
            onClick={() => setActiveTab('wander')}
          >
            Wander
          </button>
        </div>

        {/* Search Controls */}
        {activeTab === 'search' && (
          <div className="search-controls">
            <label className="search-label">
              <span>Search</span>
              <div className="search-input-wrapper">
                <input
                  ref={inputRef}
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={placeholderText}
                  className="search-input"
                />
                {query && (
                  <button 
                    type="button" 
                    className="search-clear-btn"
                    onClick={clearSearch}
                    title="Clear search"
                  >
                    ×
                  </button>
                )}
              </div>
            </label>
            <div className="search-toggles">
              <div className="search-toggle-group">
                <span className="search-toggle-label">Query</span>
                <div className="search-toggle-buttons">
                  <button
                    type="button"
                    className={`search-toggle-btn ${showMovies ? 'active' : ''}`}
                    onClick={() => setShowMovies(!showMovies)}
                  >
                    Movies
                  </button>
                  <button
                    type="button"
                    className={`search-toggle-btn ${showTv ? 'active' : ''}`}
                    onClick={() => setShowTv(!showTv)}
                  >
                    TV Shows
                  </button>
                  <button
                    type="button"
                    className={`search-toggle-btn ${showPeople ? 'active' : ''}`}
                    onClick={() => setShowPeople(!showPeople)}
                  >
                    People
                  </button>
                </div>
              </div>
              <div className="search-toggle-group">
                <span className="search-toggle-label">Depth</span>
                <div className="search-toggle-buttons">
                  <button
                    type="button"
                    className={`search-toggle-btn ${searchDepth === 'simple' ? 'active' : ''}`}
                    onClick={() => setSearchDepth('simple')}
                  >
                    Simple
                  </button>
                  <button
                    type="button"
                    className={`search-toggle-btn ${searchDepth === 'extensive' ? 'active' : ''}`}
                    onClick={() => setSearchDepth('extensive')}
                  >
                    Extensive
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Wander Controls */}
        {activeTab === 'wander' && (
          <div className="wander-controls">
            <div className="wander-toggles">
              <div className="wander-toggle-group">
                <span className="wander-toggle-label">Type</span>
                <div className="wander-toggle-buttons wander-type-toggle">
                  <button
                    type="button"
                    className={`wander-toggle-btn ${wanderMediaType === 'movies' ? 'active' : ''}`}
                    onClick={() => handleWanderMediaTypeChange('movies')}
                  >
                    Movies
                  </button>
                  <button
                    type="button"
                    className={`wander-toggle-btn ${wanderMediaType === 'shows' ? 'active' : ''}`}
                    onClick={() => handleWanderMediaTypeChange('shows')}
                  >
                    TV Shows
                  </button>
                </div>
              </div>
              <div className="wander-year-group">
                <span className="wander-toggle-label">Year</span>
                <div className="wander-year-selector">
                  <button
                    type="button"
                    className="wander-year-btn wander-year-decrement"
                    onClick={handleYearDecrement}
                    disabled={wanderYear <= currentYear - 50}
                    aria-label="Previous year"
                  >
                    ‹
                  </button>
                  <div className="wander-year-dropdown">
                    <select
                      value={wanderYear}
                      onChange={(e) => handleWanderYearChange(parseInt(e.target.value, 10))}
                      className="wander-year-select"
                    >
                      {yearOptions.map(year => (
                        <option key={year} value={year}>
                          {year}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    type="button"
                    className="wander-year-btn wander-year-increment"
                    onClick={handleYearIncrement}
                    disabled={wanderYear >= currentYear}
                    aria-label="Next year"
                  >
                    ›
                  </button>
                </div>
              </div>
              <div className="wander-toggle-group">
                <span className="wander-toggle-label">Columns</span>
                <div className="wander-toggle-buttons wander-type-toggle">
                  <button
                    type="button"
                    className={`wander-toggle-btn ${wanderColumnCount === 1 ? 'active' : ''}`}
                    onClick={() => setWanderColumnCount(1)}
                  >
                    1
                  </button>
                  <button
                    type="button"
                    className={`wander-toggle-btn ${wanderColumnCount === 2 ? 'active' : ''}`}
                    onClick={() => setWanderColumnCount(2)}
                  >
                    2
                  </button>
                  <button
                    type="button"
                    className={`wander-toggle-btn ${wanderColumnCount === 3 ? 'active' : ''}`}
                    onClick={() => setWanderColumnCount(3)}
                  >
                    3
                  </button>
                </div>
              </div>
              <div className="wander-toggle-group">
                <span className="wander-toggle-label">Genre</span>
                <button
                  type="button"
                  className={`wander-genre-btn ${wanderSelectedGenres.length > 0 ? 'active' : ''}`}
                  onClick={() => setIsGenreModalOpen(true)}
                >
                  {wanderSelectedGenres.length === 0 
                    ? 'Filter Disabled' 
                    : `${wanderSelectedGenres.length} Selected`
                  }
                </button>
              </div>
            </div>
          </div>
        )}

        {error && <div className="search-error">{error}</div>}
        {wanderError && <div className="search-error">{wanderError}</div>}

        {/* Search Results */}
        {activeTab === 'search' && (
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
                <article key={`${r.media_type}-${r.id}`} className={`search-card ${r.media_type === 'person' ? 'search-card-person' : ''}`}>
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
                    <div className="search-card-info">
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
                        {(isMovie || isTv) && searchDepth === 'extensive' && (
                          <SearchResultExtendedInfo id={r.id} mediaType={r.media_type as 'movie' | 'tv'} />
                        )}
                      </div>
                    </div>
                    {r.media_type === 'person' && searchDepth === 'extensive' && (
                      <SearchPersonProjects 
                        personId={r.id} 
                        onRecordMedia={(media) => {
                          // Create a TmdbMultiResult from the media to reuse existing handlers
                          const mediaResult: TmdbMultiResult = {
                            id: media.id,
                            title: media.title,
                            subtitle: media.releaseDate ? String(media.releaseDate.slice(0, 4)) : '',
                            poster_path: media.posterPath,
                            media_type: media.mediaType,
                            release_date: media.releaseDate,
                            popularity: 0
                          };
                          
                          // Check if item exists and open appropriate modal
                          const checkId = resultId(mediaResult);
                          const existing = media.mediaType === 'movie' ? getMovieById(checkId) : getShowById(checkId);
                          
                          if (existing) {
                            // Open edit modal - convert to TmdbMultiResult format
                            const editTarget: TmdbMultiResult = {
                              id: media.id,
                              title: media.title,
                              subtitle: media.releaseDate ? String(media.releaseDate.slice(0, 4)) : '',
                              poster_path: media.posterPath,
                              media_type: media.mediaType,
                              release_date: media.releaseDate,
                              popularity: 0
                            };
                            setRecordTarget(editTarget);
                            setRecordDetails(existing);
                          } else {
                            // Open regular add modal
                            handleOpenRecord(mediaResult);
                          }
                        }}
                      />
                    )}
                  </div>
                  {isMovie ? (
                    <div className="search-card-actions">
                      <button
                        type="button"
                        className={`search-card-action ${existingMovie && !inUnrankedMovie ? 'search-card-action-blue' : 'search-card-action-green'}`}
                        disabled={isSaving}
                        onClick={() => handleOpenRecord(r)}
                      >
                        {existingMovie && !inUnrankedMovie ? 'EDIT WATCHES' : 'RANK'}
                      </button>
                      {!existingMovie && (
                        <button
                          type="button"
                          className="search-card-action search-card-action-dim-green"
                          disabled={isSaving}
                          onClick={() => void handleAddToUnranked(r)}
                        >
                          ADD UNRANKED
                        </button>
                      )}
                      {existingMovie && existingMovie.classKey === 'UNRANKED' && (
                        <button
                          type="button"
                          className="search-card-action search-card-action-red"
                          disabled={isSaving}
                          onClick={() => {
                            console.log('Removing movie from unranked:', id);
                            removeMovieEntry(id);
                          }}
                        >
                          REMOVE UNRANKED
                        </button>
                      )}
                      {inWatchlist ? (
                        <button 
                          type="button" 
                          className="search-card-action search-card-action-red"
                          disabled={isSaving}
                          onClick={() => {
                            console.log('Removing from watchlist:', id);
                            removeFromWatchlist(id);
                          }}
                        >
                          REMOVE WATCHLIST
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="search-card-action search-card-action-dim-yellow"
                          disabled={isSaving}
                          onClick={handleAddToWatchlist}
                        >
                          ADD WATCHLIST
                        </button>
                      )}
                    </div>
                  ) : isTv ? (
                    <div className="search-card-actions">
                      <button
                        type="button"
                        className={`search-card-action ${existingTv && existingTv.classKey !== 'UNRANKED' ? 'search-card-action-blue' : 'search-card-action-green'}`}
                        disabled={isSaving}
                        onClick={() => handleOpenRecord(r)}
                      >
                        {existingTv && existingTv.classKey !== 'UNRANKED' ? 'EDIT WATCHES' : 'RANK'}
                      </button>
                      {!existingTv && (
                        <button
                          type="button"
                          className="search-card-action search-card-action-dim-green"
                          disabled={isSaving}
                          onClick={() => void handleAddTvToUnranked(r)}
                        >
                          ADD UNRANKED
                        </button>
                      )}
                      {existingTv && existingTv.classKey === 'UNRANKED' && (
                        <button
                          type="button"
                          className="search-card-action search-card-action-red"
                          disabled={isSaving}
                          onClick={() => {
                            console.log('Removing TV show from unranked:', `tmdb-tv-${r.id}`);
                            removeShowEntry(`tmdb-tv-${r.id}`);
                          }}
                        >
                          REMOVE UNRANKED
                        </button>
                      )}
                      {inWatchlist ? (
                        <button 
                          type="button" 
                          className="search-card-action search-card-action-red"
                          disabled={isSaving}
                          onClick={() => {
                            console.log('Removing TV show from watchlist:', `tmdb-tv-${r.id}`);
                            removeFromWatchlist(`tmdb-tv-${r.id}`);
                          }}
                        >
                          REMOVE WATCHLIST
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="search-card-action search-card-action-dim-yellow"
                          disabled={isSaving}
                          onClick={handleAddToWatchlist}
                        >
                          ADD WATCHLIST
                        </button>
                      )}
                    </div>
                  ) : r.media_type === 'person' ? (
                    <div className="search-card-actions search-card-actions-person">
                      <div className="search-card-action-group">
                        <span className="search-card-action-label">Actor</span>
                        <button
                          type="button"
                          className={`search-card-action ${getPersonById(id) && getPersonById(id)?.classKey !== 'UNRANKED' ? 'search-card-action-blue' : 'search-card-action-green'}`}
                          disabled={isSaving}
                          onClick={() => handleOpenRecord(r, 'actor')}
                        >
                          {getPersonById(id) && getPersonById(id)?.classKey !== 'UNRANKED' ? 'MOVE' : 'ADD'}
                        </button>
                        {!getPersonById(id) && (
                          <button
                            type="button"
                            className="search-card-action search-card-action-dim-green"
                            disabled={isSaving}
                            onClick={() => void handleAddPersonToUnranked(r, 'actor')}
                          >
                            ADD UNRANKED
                          </button>
                        )}
                        {getPersonById(id) && getPersonById(id)?.classKey === 'UNRANKED' && (
                          <button
                            type="button"
                            className="search-card-action search-card-action-red"
                            disabled={isSaving}
                            onClick={() => {
                              console.log('Removing person from unranked:', id);
                              removePersonEntry(id);
                            }}
                          >
                            REMOVE UNRANKED
                          </button>
                        )}
                      </div>

                      <div className="search-card-action-group">
                        <span className="search-card-action-label">Director</span>
                        <button
                          type="button"
                          className={`search-card-action ${getDirectorById(id) && getDirectorById(id)?.classKey !== 'UNRANKED' ? 'search-card-action-blue' : 'search-card-action-green'}`}
                          disabled={isSaving}
                          onClick={() => handleOpenRecord(r, 'director')}
                        >
                          {getDirectorById(id) && getDirectorById(id)?.classKey !== 'UNRANKED' ? 'MOVE' : 'ADD'}
                        </button>
                        {!getDirectorById(id) && (
                          <button
                            type="button"
                            className="search-card-action search-card-action-dim-green"
                            disabled={isSaving}
                            onClick={() => void handleAddPersonToUnranked(r, 'director')}
                          >
                            ADD UNRANKED
                          </button>
                        )}
                        {getDirectorById(id) && getDirectorById(id)?.classKey === 'UNRANKED' && (
                          <button
                            type="button"
                            className="search-card-action search-card-action-red"
                            disabled={isSaving}
                            onClick={() => {
                              console.log('Removing director from unranked:', id);
                              removeDirectorEntry(id);
                            }}
                          >
                            REMOVE UNRANKED
                          </button>
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
        )}

        {/* Wander Results */}
        {activeTab === 'wander' && (
          <div className="wander-results">
            <div className={`wander-grid wander-grid-${wanderColumnCount}-columns`}>
              {wanderResults.map((r) => {
                const id = resultId(r);
                const isMovie = r.media_type === 'movie';
                const isTv = r.media_type === 'tv';
                const imgPath = r.poster_path;
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
                  <article key={`${r.media_type}-${r.id}`} className={`search-card wander-card ${wanderMediaType === 'shows' ? 'wander-show-card' : ''}`}>
                    <div className="search-card-poster">
                      {imgUrl ? (
                        <img src={imgUrl} alt={r.title} />
                      ) : (
                        <div className="search-card-poster-fallback">
                          🎬
                        </div>
                      )}
                    </div>
                    <div className="search-card-main">
                      <div className="search-card-info">
                        <div className="search-card-badge">
                          {r.media_type === 'movie' ? 'MOVIE' : 'TV'}
                        </div>
                        <div className="search-card-title">{r.title}</div>
                        <div className="search-card-subtitle">
                          {r.subtitle}
                        </div>
                      </div>
                    </div>
                    {isMovie ? (
                      <div className="search-card-actions">
                        <button
                          type="button"
                          className={`search-card-action ${existingMovie && !inUnrankedMovie ? 'search-card-action-blue' : 'search-card-action-green'}`}
                          disabled={isSaving}
                          onClick={() => handleOpenRecord(r)}
                        >
                          {existingMovie && !inUnrankedMovie ? 'EDIT WATCHES' : 'RANK'}
                        </button>
                        {!existingMovie && (
                          <button
                            type="button"
                            className="search-card-action search-card-action-dim-green"
                            disabled={isSaving}
                            onClick={() => void handleAddToUnranked(r)}
                          >
                            ADD UNRANKED
                          </button>
                        )}
                        {existingMovie && existingMovie.classKey === 'UNRANKED' && (
                          <button
                            type="button"
                            className="search-card-action search-card-action-red"
                            disabled={isSaving}
                            onClick={() => {
                              console.log('Removing movie from unranked:', id);
                              removeMovieEntry(id);
                            }}
                          >
                            REMOVE UNRANKED
                          </button>
                        )}
                        {inWatchlist ? (
                          <button 
                            type="button" 
                            className="search-card-action search-card-action-red"
                            disabled={isSaving}
                            onClick={() => {
                              console.log('Removing from watchlist:', id);
                              removeFromWatchlist(id);
                            }}
                          >
                            REMOVE WATCHLIST
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="search-card-action search-card-action-dim-yellow"
                            disabled={isSaving}
                            onClick={handleAddToWatchlist}
                          >
                            ADD WATCHLIST
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="search-card-actions">
                        <button
                          type="button"
                          className={`search-card-action ${existingTv && existingTv.classKey !== 'UNRANKED' ? 'search-card-action-blue' : 'search-card-action-green'}`}
                          disabled={isSaving}
                          onClick={() => handleOpenRecord(r)}
                        >
                          {existingTv && existingTv.classKey !== 'UNRANKED' ? 'EDIT WATCHES' : 'RANK'}
                        </button>
                        {!existingTv && (
                          <button
                            type="button"
                            className="search-card-action search-card-action-dim-green"
                            disabled={isSaving}
                            onClick={() => void handleAddTvToUnranked(r)}
                          >
                            ADD UNRANKED
                          </button>
                        )}
                        {existingTv && existingTv.classKey === 'UNRANKED' && (
                          <button
                            type="button"
                            className="search-card-action search-card-action-red"
                            disabled={isSaving}
                            onClick={() => {
                              console.log('Removing TV show from unranked:', `tmdb-tv-${r.id}`);
                              removeShowEntry(`tmdb-tv-${r.id}`);
                            }}
                          >
                            REMOVE UNRANKED
                          </button>
                        )}
                        {inWatchlist ? (
                          <button 
                            type="button" 
                            className="search-card-action search-card-action-red"
                            disabled={isSaving}
                            onClick={() => {
                              console.log('Removing TV show from watchlist:', `tmdb-tv-${r.id}`);
                              removeFromWatchlist(`tmdb-tv-${r.id}`);
                            }}
                          >
                            REMOVE WATCHLIST
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="search-card-action search-card-action-dim-yellow"
                            disabled={isSaving}
                            onClick={handleAddToWatchlist}
                          >
                            ADD WATCHLIST
                          </button>
                        )}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
            
            {/* Load More Button */}
            {shouldShowLoadMore && (
              <div className="wander-load-more">
                <button
                  type="button"
                  className="wander-load-more-btn"
                  onClick={() => loadWanderContent(false)}
                  disabled={isLoadingMore}
                >
                  {isLoadingMore ? 'Loading...' : `Load More ${wanderMediaType === 'movies' ? 'Movies' : 'Shows'}`}
                </button>
              </div>
            )}
            
            {wanderResults.length === 0 && !wanderLoading && !wanderError && (
              <div className="wander-empty">
                {wanderMediaType === 'movies' 
                  ? `No movies found for ${wanderYear}. Try a different year.`
                  : `No TV shows found for ${wanderYear}. Try a different year.`
                }
              </div>
            )}
            
            {/* To Top Button - only show when there are results and user has scrolled */}
            {wanderResults.length > 0 && (
              <button
                type="button"
                className="wander-to-top-btn"
                onClick={scrollToTop}
                aria-label="Scroll to top"
              >
                ↑ Top
              </button>
            )}
          </div>
        )}
      </div>

      {/* Universal Edit Modal for Movies/TV */}
      {recordTarget && (recordTarget.media_type === 'movie' || recordTarget.media_type === 'tv') && (
        <UniversalEditModal
          target={{
            id: resultId(recordTarget),
            tmdbId: recordTarget.id,
            title: recordTarget.title,
            posterPath: recordTarget.poster_path,
            mediaType: recordTarget.media_type,
            subtitle: recordTarget.subtitle,
            releaseDate: recordTarget.release_date,
            runtimeMinutes: recordDetails?.runtimeMinutes,
            totalEpisodes: recordDetails?.totalEpisodes,
            existingClassKey: recordTarget.media_type === 'movie' 
              ? getMovieById(resultId(recordTarget))?.classKey 
              : getShowById(resultId(recordTarget))?.classKey,
          }}
          initialWatches={
            recordTarget.media_type === 'movie'
              ? getMovieById(resultId(recordTarget))?.watchRecords
              : getShowById(resultId(recordTarget))?.watchRecords
          }
          currentClassKey={
            recordTarget.media_type === 'movie'
              ? getMovieById(resultId(recordTarget))?.classKey
              : getShowById(resultId(recordTarget))?.classKey
          }
          currentClassLabel={
            recordTarget.media_type === 'movie'
              ? getClassLabel(getMovieById(resultId(recordTarget))?.classKey ?? '')
              : getTvClassLabel(getShowById(resultId(recordTarget))?.classKey ?? '')
          }
          isWatchlistItem={isInWatchlist(resultId(recordTarget))}
          rankedClasses={
            recordTarget.media_type === 'movie'
              ? movieRankedClasses
              : tvRankedClasses
          }
          isSaving={isSaving}
          onClose={handleCloseRecord}
          onRemoveEntry={(id: string) => {
            if (recordTarget.media_type === 'movie') removeMovieEntry(id);
            else removeShowEntry(id);
            handleCloseRecord();
          }}
          onSave={(params, goToMedia) => handleMediaSave(params, goToMedia, resultId(recordTarget), recordTarget.media_type as 'movie' | 'tv')}
          onAddToWatchlist={() => {
            addToWatchlist(
              { 
                id: resultId(recordTarget), 
                title: recordTarget.title, 
                posterPath: recordTarget.poster_path, 
                releaseDate: recordTarget.release_date 
              },
              recordTarget.media_type as 'movies' | 'tv'
            );
          }}
          onRemoveFromWatchlist={() => {
            removeFromWatchlist(resultId(recordTarget));
          }}
          onGoToWatchlist={() => {
            navigate('/watchlist');
          }}
        />
      )}

      {/* Person Ranking Modal */}
      {recordTarget && recordTarget.media_type === 'person' && (
        <PersonRankingModal
          target={{
            id: resultId(recordTarget),
            tmdbId: recordTarget.id,
            name: recordTarget.title,
            profilePath: recordTarget.poster_path,
            mediaType: (personSaveType || 'actor') as 'actor' | 'director',
            existingClassKey: (personSaveType || 'actor') === 'actor'
              ? getPersonById(resultId(recordTarget))?.classKey
              : getDirectorById(resultId(recordTarget))?.classKey,
          }}
          currentClassKey={
            (personSaveType || 'actor') === 'actor'
              ? getPersonById(resultId(recordTarget))?.classKey
              : getDirectorById(resultId(recordTarget))?.classKey
          }
          currentClassLabel={
            (personSaveType || 'actor') === 'actor'
              ? peopleClasses.find(c => c.key === getPersonById(resultId(recordTarget))?.classKey)?.label
              : directorsClasses.find(c => c.key === getDirectorById(resultId(recordTarget))?.classKey)?.label
          }
          rankedClasses={
            (personSaveType || 'actor') === 'director'
              ? directorsRankedClasses
              : peopleRankedClasses
          }
          isSaving={isSaving}
          onClose={handleCloseRecord}
          onRemoveEntry={(id: string) => {
            if (personSaveType === 'director') removeDirectorEntry(id);
            else removePersonEntry(id);
            handleCloseRecord();
          }}
          onSave={handlePersonSave}
        />
      )}

      {/* Genre Edit Modal */}
      <GenreEditModal
        isOpen={isGenreModalOpen}
        onClose={() => setIsGenreModalOpen(false)}
        selectedGenres={wanderSelectedGenres}
        onGenresChange={handleWanderGenresChange}
      />
    </section>
  );
}
