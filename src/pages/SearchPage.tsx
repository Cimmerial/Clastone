import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Info, User, Film, ArrowUp, Clapperboard } from 'lucide-react';
import { RandomQuote } from '../components/RandomQuote';
import {
  tmdbSearchMovies,
  tmdbSearchTv,
  tmdbSearchPeople,
  tmdbMovieDetailsFull,
  tmdbTvDetailsFull,
  tmdbImagePath,
  tmdbDiscoverMoviesByYear,
  tmdbDiscoverTvByYear,
  tmdbDiscoverMoviesByReleaseYearRange,
  tmdbDiscoverTvByFirstAirYearRange,
  tmdbDiscoverUnreleasedMovies,
  tmdbDiscoverUnreleasedTv,
  type TmdbMultiResult
} from '../lib/tmdb';
import { useMoviesStore } from '../state/moviesStore';
import { useTvStore } from '../state/tvStore';
import { useWatchlistStore } from '../state/watchlistStore';
import { usePeopleStore } from '../state/peopleStore';
import { useDirectorsStore } from '../state/directorsStore';
import { useListsStore } from '../state/listsStore';
import { UniversalEditModal, type UniversalEditTarget, type UniversalEditSaveParams } from '../components/UniversalEditModal';
import { PersonRankingModal, type PersonRankingTarget, type PersonRankingSaveParams } from '../components/PersonRankingModal';
import { watchMatrixEntriesToWatchRecords } from '../lib/watchMatrixMapping';
import { prepareWatchRecordsForSave } from '../lib/watchDayOrderUtils';
import { SearchResultExtendedInfo } from '../components/SearchResultExtendedInfo';
import { SearchPersonProjects } from '../components/SearchPersonProjects';
import { InfoModal } from '../components/InfoModal';
import { PersonInfoModal } from '../components/PersonInfoModal';
import { useAuth } from '../context/AuthContext';
import { db } from '../lib/firebase';
import { upsertGlobalCollection } from '../lib/firestoreCollections';
import './SearchPage.css';

function resultId(r: TmdbMultiResult): string {
  return `tmdb-${r.media_type}-${r.id}`;
}

const SEARCH_INITIAL_RESULT_LIMIT = 12;
const SEARCH_LOAD_MORE_INCREMENT = 12;
const SEARCH_MAX_LOAD_MORE_CLICKS = 2;
const SEARCH_FETCH_LIMIT =
  SEARCH_INITIAL_RESULT_LIMIT + SEARCH_LOAD_MORE_INCREMENT * SEARCH_MAX_LOAD_MORE_CLICKS;
function parseQueryWithOptionalYear(raw: string): { textQuery: string; yearHint?: number } {
  const trimmed = raw.trim();
  const match = trimmed.match(/^(.*?)(?:\s+)(19\d{2}|20\d{2})$/);
  if (!match) return { textQuery: trimmed };
  const textQuery = match[1].trim();
  const yearHint = Number(match[2]);
  if (!textQuery) return { textQuery: trimmed };
  return { textQuery, yearHint };
}

function extractYearFromResult(result: TmdbMultiResult): number | null {
  const source = result.release_date || result.subtitle || '';
  const m = source.match(/(19\d{2}|20\d{2})/);
  return m ? Number(m[1]) : null;
}

function normalizeSearchText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function levenshteinWithinLimit(a: string, b: string, maxDistance: number): number {
  if (a === b) return 0;
  const aLen = a.length;
  const bLen = b.length;
  if (Math.abs(aLen - bLen) > maxDistance) return maxDistance + 1;
  if (aLen === 0) return bLen <= maxDistance ? bLen : maxDistance + 1;
  if (bLen === 0) return aLen <= maxDistance ? aLen : maxDistance + 1;

  let prev = Array.from({ length: bLen + 1 }, (_, i) => i);
  let curr = new Array<number>(bLen + 1);

  for (let i = 1; i <= aLen; i++) {
    curr[0] = i;
    let rowMin = curr[0];
    for (let j = 1; j <= bLen; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + cost
      );
      if (curr[j] < rowMin) rowMin = curr[j];
    }
    if (rowMin > maxDistance) return maxDistance + 1;
    [prev, curr] = [curr, prev];
  }

  return prev[bLen];
}

function isFuzzyQueryMatch(normalizedTitle: string, normalizedQuery: string): boolean {
  if (!normalizedQuery || normalizedQuery.length < 4) return false;
  const maxDistance = normalizedQuery.length >= 8 ? 2 : 1;

  const words = normalizedTitle.split(' ').filter(Boolean);
  for (const word of words) {
    if (Math.abs(word.length - normalizedQuery.length) > maxDistance) continue;
    if (levenshteinWithinLimit(word, normalizedQuery, maxDistance) <= maxDistance) return true;
  }

  const titleCollapsed = normalizedTitle.replace(/\s+/g, '');
  const queryCollapsed = normalizedQuery.replace(/\s+/g, '');
  if (Math.abs(titleCollapsed.length - queryCollapsed.length) <= maxDistance) {
    if (levenshteinWithinLimit(titleCollapsed, queryCollapsed, maxDistance) <= maxDistance) return true;
  }

  return false;
}

function rankResultsByQueryAndPopularity(results: TmdbMultiResult[], queryText: string): TmdbMultiResult[] {
  const normalizedQuery = normalizeSearchText(queryText);
  if (!normalizedQuery) return results;

  const scored = results.map((result, index) => {
    const normalizedTitle = normalizeSearchText(result.title);
    const popularity = result.popularity ?? 0;

    // Strongly prioritize titles that start with the query (IMDb-like behavior for short partial input).
    const isExact = normalizedTitle === normalizedQuery;
    const startsWith = normalizedTitle.startsWith(normalizedQuery);
    const wordPrefix = !startsWith && normalizedTitle.split(' ').some((word) => word.startsWith(normalizedQuery));
    const fuzzyMatch = !startsWith && !wordPrefix && isFuzzyQueryMatch(normalizedTitle, normalizedQuery);
    const includes = !startsWith && !wordPrefix && !fuzzyMatch && normalizedTitle.includes(normalizedQuery);

    const tier = isExact ? 0 : startsWith ? 1 : wordPrefix ? 2 : fuzzyMatch ? 3 : includes ? 4 : 5;
    return { result, tier, popularity, index };
  });

  scored.sort((a, b) => {
    if (a.tier !== b.tier) return a.tier - b.tier;
    if (b.popularity !== a.popularity) return b.popularity - a.popularity;
    return a.index - b.index;
  });

  return scored.map((entry) => entry.result);
}

function rankResultsWithYearHint(results: TmdbMultiResult[], yearHint?: number, titleHint?: string): TmdbMultiResult[] {
  if (!yearHint) return rankResultsByQueryAndPopularity(results, titleHint ?? '');
  const normalizedTitleHint = (titleHint ?? '').toLowerCase().trim();
  const scored = results.map((result, index) => {
    const y = extractYearFromResult(result);
    const normalizedTitle = normalizeSearchText(result.title);
    const exactTitle = normalizedTitleHint.length > 0 && normalizedTitle === normalizeSearchText(normalizedTitleHint);
    const startsWithTitle = normalizedTitleHint.length > 0 && normalizedTitle.startsWith(normalizeSearchText(normalizedTitleHint));
    const containsTitle = normalizedTitleHint.length > 0 && normalizedTitle.includes(normalizeSearchText(normalizedTitleHint));
    const yearScore = y === yearHint ? 100000 : 0;
    const textScore = exactTitle ? 20000 : startsWithTitle ? 12000 : containsTitle ? 4000 : 0;
    const score = yearScore + textScore;
    const popularity = result.popularity ?? 0;
    return { result, score, popularity, index };
  });
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.popularity !== a.popularity) return b.popularity - a.popularity;
    return a.index - b.index;
  });
  return scored.map((entry) => entry.result);
}

const MIN_DOOMSCROLL_YEAR = 1900;

export type DoomscrollYearFilter =
  | { mode: 'all' }
  | { mode: 'single'; year: number }
  | { mode: 'range'; fromYear: number; toYear: number };

function parseDoomscrollYearFilter(): DoomscrollYearFilter {
  try {
    const raw = sessionStorage.getItem('doomscroll_year_filter');
    if (!raw) return { mode: 'all' };
    const o = JSON.parse(raw) as Record<string, unknown>;
    if (o.mode === 'single' && typeof o.year === 'number' && Number.isFinite(o.year)) {
      return { mode: 'single', year: Math.floor(o.year) };
    }
    if (
      o.mode === 'range' &&
      typeof o.fromYear === 'number' &&
      typeof o.toYear === 'number' &&
      Number.isFinite(o.fromYear) &&
      Number.isFinite(o.toYear)
    ) {
      return { mode: 'range', fromYear: Math.floor(o.fromYear), toYear: Math.floor(o.toYear) };
    }
  } catch {
    /* ignore */
  }
  return { mode: 'all' };
}

/** Movies only: UI "Popularity" → vote_count; "Box office" → revenue. TV always uses vote_count in fetch. */
function doomscrollMovieSortBy(mode: 'popularity' | 'box_office'): string {
  return mode === 'box_office' ? 'revenue.desc' : 'vote_count.desc';
}

function formatDoomscrollYearFilterLabel(f: DoomscrollYearFilter): string {
  if (f.mode === 'all') return 'All years';
  if (f.mode === 'single') return `Year ${f.year}`;
  const lo = Math.min(f.fromYear, f.toYear);
  const hi = Math.max(f.fromYear, f.toYear);
  return lo === hi ? `${lo}` : `${lo}–${hi}`;
}

function DoomscrollYearModal({
  open,
  onClose,
  initialValue,
  maxYear,
  onApply
}: {
  open: boolean;
  onClose: () => void;
  initialValue: DoomscrollYearFilter;
  maxYear: number;
  onApply: (value: DoomscrollYearFilter) => void;
}) {
  const [mode, setMode] = useState<'all' | 'single' | 'range'>('all');
  const [singleYear, setSingleYear] = useState(maxYear);
  const [fromYear, setFromYear] = useState(maxYear - 5);
  const [toYear, setToYear] = useState(maxYear);

  useEffect(() => {
    if (!open) return;
    if (initialValue.mode === 'all') {
      setMode('all');
    } else if (initialValue.mode === 'single') {
      setMode('single');
      setSingleYear(initialValue.year);
    } else {
      setMode('range');
      setFromYear(initialValue.fromYear);
      setToYear(initialValue.toYear);
    }
  }, [open, initialValue]);

  const yearOptionsDesc = useMemo(
    () => Array.from({ length: maxYear - MIN_DOOMSCROLL_YEAR + 1 }, (_, i) => maxYear - i),
    [maxYear]
  );

  if (!open) return null;

  const handleApply = () => {
    if (mode === 'all') {
      onApply({ mode: 'all' });
      return;
    }
    if (mode === 'single') {
      const y = Math.min(maxYear, Math.max(MIN_DOOMSCROLL_YEAR, singleYear));
      onApply({ mode: 'single', year: y });
      return;
    }
    const lo = Math.min(fromYear, toYear);
    const hi = Math.max(fromYear, toYear);
    const a = Math.min(maxYear, Math.max(MIN_DOOMSCROLL_YEAR, lo));
    const b = Math.min(maxYear, Math.max(MIN_DOOMSCROLL_YEAR, hi));
    onApply({ mode: 'range', fromYear: a, toYear: b });
  };

  return (
    <div className="doomscroll-year-modal-backdrop" role="presentation" onClick={onClose}>
      <div className="doomscroll-year-modal" role="dialog" aria-labelledby="doomscroll-year-modal-title" onClick={(e) => e.stopPropagation()}>
        <h3 id="doomscroll-year-modal-title" className="doomscroll-year-modal-title">
          Doomscroll years
        </h3>
        <p className="doomscroll-year-modal-sub">Choose all releases, a single year, or a range (inclusive).</p>

        <div className="doomscroll-year-modal-modes">
          <label className="doomscroll-year-modal-option">
            <input type="radio" name="doomscroll-year-mode" checked={mode === 'all'} onChange={() => setMode('all')} />
            <span>All years</span>
          </label>
          <label className="doomscroll-year-modal-option">
            <input type="radio" name="doomscroll-year-mode" checked={mode === 'single'} onChange={() => setMode('single')} />
            <span>Single year</span>
          </label>
          <label className="doomscroll-year-modal-option">
            <input type="radio" name="doomscroll-year-mode" checked={mode === 'range'} onChange={() => setMode('range')} />
            <span>Year range</span>
          </label>
        </div>

        {mode === 'single' ? (
          <div className="doomscroll-year-modal-row">
            <label className="doomscroll-year-modal-label" htmlFor="doomscroll-single-year">Year</label>
            <select
              id="doomscroll-single-year"
              className="doomscroll-year-modal-select"
              value={singleYear}
              onChange={(e) => setSingleYear(parseInt(e.target.value, 10))}
            >
              {yearOptionsDesc.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        {mode === 'range' ? (
          <div className="doomscroll-year-modal-range">
            <div className="doomscroll-year-modal-row">
              <label className="doomscroll-year-modal-label" htmlFor="doomscroll-from-year">From</label>
              <select
                id="doomscroll-from-year"
                className="doomscroll-year-modal-select"
                value={fromYear}
                onChange={(e) => setFromYear(parseInt(e.target.value, 10))}
              >
                {yearOptionsDesc.map((y) => (
                  <option key={`f-${y}`} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
            <div className="doomscroll-year-modal-row">
              <label className="doomscroll-year-modal-label" htmlFor="doomscroll-to-year">To</label>
              <select
                id="doomscroll-to-year"
                className="doomscroll-year-modal-select"
                value={toYear}
                onChange={(e) => setToYear(parseInt(e.target.value, 10))}
              >
                {yearOptionsDesc.map((y) => (
                  <option key={`t-${y}`} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ) : null}

        <div className="doomscroll-year-modal-actions">
          <button type="button" className="doomscroll-year-modal-btn doomscroll-year-modal-btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="doomscroll-year-modal-btn" onClick={handleApply}>
            Apply
          </button>
        </div>
      </div>
    </div>
  );
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
  const [searchDepth, setSearchDepth] = useState<'tile' | 'detailed'>(() => {
    const saved = sessionStorage.getItem('search_depth');
    if (saved === 'extensive') return 'detailed';
    if (saved === 'simple') return 'tile';
    return saved === 'detailed' ? 'detailed' : 'tile';
  });

  // Tab selection
  const [activeTab, setActiveTab] = useState<'search' | 'doomscroll' | 'unreleased'>(() => {
    const saved = sessionStorage.getItem('search_active_tab');
    if (saved === 'wander') return 'doomscroll';
    if (saved === 'doomscroll' || saved === 'unreleased') return saved;
    return 'search';
  });

  const [doomscrollMediaType, setDoomscrollMediaType] = useState<'movies' | 'shows'>(() => {
    const saved = sessionStorage.getItem('doomscroll_media_type');
    return saved === 'shows' ? 'shows' : 'movies';
  });
  const [doomscrollShowSeen, setDoomscrollShowSeen] = useState<boolean>(() => {
    const saved = sessionStorage.getItem('doomscroll_show_seen');
    return saved ? JSON.parse(saved) : false;
  });
  const [doomscrollShowWatchlist, setDoomscrollShowWatchlist] = useState<boolean>(() => {
    const saved = sessionStorage.getItem('doomscroll_show_watchlist');
    return saved ? JSON.parse(saved) : false;
  });
  const [doomscrollDiscoverMode, setDoomscrollDiscoverMode] = useState<'popularity' | 'box_office'>(() => {
    const saved = sessionStorage.getItem('doomscroll_discover_mode');
    return saved === 'box_office' ? 'box_office' : 'popularity';
  });
  const [doomscrollResults, setDoomscrollResults] = useState<TmdbMultiResult[]>([]);
  const [doomscrollPage, setDoomscrollPage] = useState(1);
  const [doomscrollLoading, setDoomscrollLoading] = useState(false);
  const [doomscrollError, setDoomscrollError] = useState<string | null>(null);
  const [doomscrollLastPageWasFull, setDoomscrollLastPageWasFull] = useState(true);
  const [doomscrollIsLoadingMore, setDoomscrollIsLoadingMore] = useState(false);
  const [doomscrollKeepVisibleIds, setDoomscrollKeepVisibleIds] = useState<string[]>([]);
  const [doomscrollYearFilter, setDoomscrollYearFilter] = useState<DoomscrollYearFilter>(() => parseDoomscrollYearFilter());
  const [showDoomscrollYearModal, setShowDoomscrollYearModal] = useState(false);

  const [unreleasedMediaType, setUnreleasedMediaType] = useState<'movies' | 'shows'>(() => {
    const saved = sessionStorage.getItem('unreleased_media_type');
    return saved === 'shows' ? 'shows' : 'movies';
  });
  const [unreleasedShowWatchlist, setUnreleasedShowWatchlist] = useState<boolean>(() => {
    const saved = sessionStorage.getItem('unreleased_show_watchlist');
    return saved ? JSON.parse(saved) : false;
  });
  const [unreleasedResults, setUnreleasedResults] = useState<TmdbMultiResult[]>([]);
  const [unreleasedPage, setUnreleasedPage] = useState(1);
  const [unreleasedLoading, setUnreleasedLoading] = useState(false);
  const [unreleasedError, setUnreleasedError] = useState<string | null>(null);
  const [unreleasedLastPageWasFull, setUnreleasedLastPageWasFull] = useState(true);
  const [unreleasedIsLoadingMore, setUnreleasedIsLoadingMore] = useState(false);
  const [unreleasedKeepVisibleIds, setUnreleasedKeepVisibleIds] = useState<string[]>([]);

  useEffect(() => { sessionStorage.setItem('search_movies', JSON.stringify(showMovies)); }, [showMovies]);
  useEffect(() => { sessionStorage.setItem('search_tv', JSON.stringify(showTv)); }, [showTv]);
  useEffect(() => { sessionStorage.setItem('search_people', JSON.stringify(showPeople)); }, [showPeople]);
  useEffect(() => { sessionStorage.setItem('search_depth', searchDepth); }, [searchDepth]);
  useEffect(() => { sessionStorage.setItem('search_active_tab', activeTab); }, [activeTab]);
  useEffect(() => { sessionStorage.setItem('doomscroll_media_type', doomscrollMediaType); }, [doomscrollMediaType]);
  useEffect(() => { sessionStorage.setItem('doomscroll_show_seen', JSON.stringify(doomscrollShowSeen)); }, [doomscrollShowSeen]);
  useEffect(() => { sessionStorage.setItem('doomscroll_show_watchlist', JSON.stringify(doomscrollShowWatchlist)); }, [doomscrollShowWatchlist]);
  useEffect(() => { sessionStorage.setItem('doomscroll_discover_mode', doomscrollDiscoverMode); }, [doomscrollDiscoverMode]);
  useEffect(() => { sessionStorage.setItem('unreleased_media_type', unreleasedMediaType); }, [unreleasedMediaType]);
  useEffect(() => { sessionStorage.setItem('unreleased_show_watchlist', JSON.stringify(unreleasedShowWatchlist)); }, [unreleasedShowWatchlist]);
  useEffect(() => {
    sessionStorage.setItem('doomscroll_year_filter', JSON.stringify(doomscrollYearFilter));
  }, [doomscrollYearFilter]);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchVisibleCount, setSearchVisibleCount] = useState(SEARCH_INITIAL_RESULT_LIMIT);
  const [searchLoadMoreClicks, setSearchLoadMoreClicks] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const {
    byClass: moviesByClass,
    addMovieFromSearch,
    addWatchToMovie,
    getMovieById,
    updateMovieCache,
    updateMovieWatchRecords,
    moveItemToClass,
    classOrder,
    classes: movieClassDefs,
    getClassLabel,
    getClassTagline,
    removeMovieEntry
  } = useMoviesStore();
  const {
    byClass: tvByClass,
    addShowFromSearch,
    addWatchToShow,
    getShowById,
    updateShowCache,
    updateShowWatchRecords,
    moveItemToClass: moveShowToClass,
    classOrder: tvClassOrder,
    classes: tvClassDefs,
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
  const [infoModalTarget, setInfoModalTarget] = useState<{ tmdbId: number; mediaType: 'movie' | 'tv'; title: string; posterPath?: string; releaseDate?: string } | null>(null);
  const [personInfoModalTarget, setPersonInfoModalTarget] = useState<{ tmdbId: number; name: string; profilePath?: string } | null>(null);
  const navigate = useNavigate();
  const { addToWatchlist, isInWatchlist, removeFromWatchlist } = useWatchlistStore();
  const { isAdmin } = useAuth();
  const {
    globalCollections,
    upsertGlobalCollection: upsertCollectionInStore,
    getEditableListsForMediaType,
    setEntryListMembership,
    getSelectedListIdsForEntry,
    collectionIdsByEntryId,
  } = useListsStore();
  const [quickCollectionId, setQuickCollectionId] = useState<string>(() => localStorage.getItem('dev_quick_collection_id') ?? '');
  const [quickDirection, setQuickDirection] = useState<'top' | 'bottom'>(() => {
    const saved = localStorage.getItem('dev_quick_collection_direction');
    return saved === 'bottom' ? 'bottom' : 'top';
  });

  const selectedQuickCollection = useMemo(
    () => globalCollections.find((collection) => collection.id === quickCollectionId) ?? null,
    [globalCollections, quickCollectionId]
  );
  const canUseQuickAdd = import.meta.env.DEV && isAdmin && Boolean(selectedQuickCollection) && Boolean(db);

  useEffect(() => {
    const syncQuickConfig = () => {
      setQuickCollectionId(localStorage.getItem('dev_quick_collection_id') ?? '');
      const saved = localStorage.getItem('dev_quick_collection_direction');
      setQuickDirection(saved === 'bottom' ? 'bottom' : 'top');
    };
    window.addEventListener('quick-collection-config-changed', syncQuickConfig);
    window.addEventListener('storage', syncQuickConfig);
    return () => {
      window.removeEventListener('quick-collection-config-changed', syncQuickConfig);
      window.removeEventListener('storage', syncQuickConfig);
    };
  }, []);

  const trimmed = useMemo(() => query.trim(), [query]);

  // Save query and results to sessionStorage when they change
  useEffect(() => {
    sessionStorage.setItem('search_query', query);
  }, [query]);

  useEffect(() => {
    sessionStorage.setItem('search_results', JSON.stringify(remoteResults));
  }, [remoteResults]);

  // Clear search function


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
        const { textQuery, yearHint } = parseQueryWithOptionalYear(trimmed);
        if (!textQuery) {
          setRemoteResults([]);
          setIsLoading(false);
          return;
        }

        // Always fetch by domain so ranking is stable and not dependent on TMDB multi blending.
        const promises: Promise<TmdbMultiResult[]>[] = [];
        if (showMovies) {
          promises.push(
            Promise.all([
              tmdbSearchMovies(textQuery, controller.signal, yearHint),
              tmdbSearchMovies(textQuery, controller.signal, yearHint, 2)
            ]).then(([page1, page2]) => [...page1, ...page2])
          );
        }
        if (showTv) {
          promises.push(
            Promise.all([
              tmdbSearchTv(textQuery, controller.signal, yearHint),
              tmdbSearchTv(textQuery, controller.signal, yearHint, 2)
            ]).then(([page1, page2]) => [...page1, ...page2])
          );
        }
        if (showPeople) {
          promises.push(
            Promise.all([
              tmdbSearchPeople(textQuery, controller.signal),
              tmdbSearchPeople(textQuery, controller.signal, 2)
            ]).then(([page1, page2]) => [...page1, ...page2])
          );
        }
        const responses = await Promise.all(promises);
        let results = responses.flat();

        // If user provided a year hint and exact-year search produced no movie/tv hits,
        // retry with +/-1 year to account for release year vs premiere year mismatches.
        if (yearHint && (showMovies || showTv)) {
          const hasMovieOrTv = results.some((r) => r.media_type === 'movie' || r.media_type === 'tv');
          if (!hasMovieOrTv) {
            const fallbackPromises: Promise<TmdbMultiResult[]>[] = [];
            const fallbackYears = [yearHint - 1, yearHint + 1];
            for (const fallbackYear of fallbackYears) {
              if (showMovies) {
                fallbackPromises.push(
                  Promise.all([
                    tmdbSearchMovies(textQuery, controller.signal, fallbackYear),
                    tmdbSearchMovies(textQuery, controller.signal, fallbackYear, 2)
                  ]).then(([page1, page2]) => [...page1, ...page2])
                );
              }
              if (showTv) {
                fallbackPromises.push(
                  Promise.all([
                    tmdbSearchTv(textQuery, controller.signal, fallbackYear),
                    tmdbSearchTv(textQuery, controller.signal, fallbackYear, 2)
                  ]).then(([page1, page2]) => [...page1, ...page2])
                );
              }
            }
            if (fallbackPromises.length > 0) {
              const fallbackResponses = await Promise.all(fallbackPromises);
              results = [...results, ...fallbackResponses.flat()];
            }
          }
        }

        const deduped = results.filter((item, index, self) => index === self.findIndex((candidate) => candidate.media_type === item.media_type && candidate.id === item.id));
        setRemoteResults(rankResultsWithYearHint(deduped, yearHint, textQuery).slice(0, SEARCH_FETCH_LIMIT));
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

  useEffect(() => {
    setSearchVisibleCount(SEARCH_INITIAL_RESULT_LIMIT);
    setSearchLoadMoreClicks(0);
  }, [remoteResults]);

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

  const handleQuickAddToCollection = async (r: TmdbMultiResult) => {
    if (!db || !selectedQuickCollection) return;
    if (r.media_type !== 'movie' && r.media_type !== 'tv') return;
    const mediaType = r.media_type;
    const exists = selectedQuickCollection.entries.some((entry) => entry.mediaType === mediaType && entry.tmdbId === r.id);
    if (exists) {
      const filtered = selectedQuickCollection.entries.filter((entry) => !(entry.mediaType === mediaType && entry.tmdbId === r.id));
      const normalized = filtered.map((entry, position) => ({ ...entry, position }));
      const nextCollection = { ...selectedQuickCollection, entries: normalized, updatedAt: new Date().toISOString() };
      await upsertGlobalCollection(db, nextCollection);
      upsertCollectionInStore(nextCollection);
      return;
    }
    const newEntry = {
      tmdbId: r.id,
      mediaType,
      position: 0,
      title: r.title,
      posterPath: r.poster_path ?? undefined,
      releaseDate: r.release_date,
    };
    const withEntry =
      quickDirection === 'top'
        ? [newEntry, ...selectedQuickCollection.entries]
        : [...selectedQuickCollection.entries, newEntry];
    const normalized = withEntry.map((entry, position) => ({ ...entry, position }));
    const nextCollection = { ...selectedQuickCollection, entries: normalized, updatedAt: new Date().toISOString() };
    await upsertGlobalCollection(db, nextCollection);
    upsertCollectionInStore(nextCollection);
  };

  const isInSelectedQuickCollection = (r: TmdbMultiResult): boolean => {
    if (!selectedQuickCollection) return false;
    if (r.media_type !== 'movie' && r.media_type !== 'tv') return false;
    return selectedQuickCollection.entries.some((entry) => entry.mediaType === r.media_type && entry.tmdbId === r.id);
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
      tvClassOrder
        .map((k) => {
          const c = tvClassDefs.find((x) => x.key === k);
          return c
            ? { key: c.key, label: c.label, tagline: c.tagline, isRanked: c.isRanked }
            : { key: k, label: getTvClassLabel(k), tagline: getTvClassTagline(k), isRanked: true };
        }),
    [tvClassOrder, tvClassDefs, getTvClassLabel, getTvClassTagline]
  );

  const movieRankedClasses = useMemo(
    () =>
      classOrder
        .map((k) => {
          const c = movieClassDefs.find((x) => x.key === k);
          return c
            ? { key: c.key, label: c.label, tagline: c.tagline, isRanked: c.isRanked }
            : { key: k, label: getClassLabel(k), tagline: getClassTagline(k), isRanked: true };
        }),
    [classOrder, movieClassDefs, getClassLabel, getClassTagline]
  );

  const peopleRankedClasses = useMemo(
    () =>
      peopleClassOrder.map((k) => {
        const c = peopleClasses.find(c => c.key === k);
        return { key: k, label: c?.label ?? k.replace(/_/g, ' '), tagline: c?.tagline ?? '', isRanked: c?.isRanked ?? false };
      }),
    [peopleClassOrder, peopleClasses]
  );

  const directorsRankedClasses = useMemo(
    () =>
      directorsClassOrder.map((k) => {
        const c = directorsClasses.find(c => c.key === k);
        return { key: k, label: c?.label ?? k.replace(/_/g, ' '), tagline: c?.tagline ?? '', isRanked: c?.isRanked ?? false };
      }),
    [directorsClassOrder, directorsClasses]
  );

  // Handle save from UniversalEditModal for movies/TV
  const handleMediaSave = async (params: UniversalEditSaveParams, goToMedia: boolean, targetId: string, mediaType: 'movie' | 'tv') => {
    const { watches, classKey: recordClassKey, position } = params;
    const keepModalOpen = Boolean(params.keepModalOpen);
    const toTop = position === 'top';
    const toMiddle = position === 'middle';

    const watchRecords = prepareWatchRecordsForSave(
      watchMatrixEntriesToWatchRecords(watches),
      targetId,
      moviesByClass,
      tvByClass,
      classOrder,
      tvClassOrder
    );

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
      if (params.listMemberships?.length) {
        setEntryListMembership(targetId, 'movie', params.listMemberships);
      }
      if (!keepModalOpen) {
        setRecordTarget(null);
      }
      if (goToMedia && !keepModalOpen) navigate('/movies', { replace: true, state: { scrollToId: targetId } });
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
      if (params.listMemberships?.length) {
        setEntryListMembership(targetId, 'tv', params.listMemberships);
      }
      if (!keepModalOpen) {
        setRecordTarget(null);
      }
      if (goToMedia && !keepModalOpen) navigate('/tv', { replace: true, state: { scrollToId: targetId } });
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

  const loadDoomscrollContent = async (reset: boolean = false) => {
    if (doomscrollLoading || doomscrollIsLoadingMore) return;

    const page = reset ? 1 : doomscrollPage + 1;
    const isLoadMore = !reset;

    if (isLoadMore) {
      setDoomscrollIsLoadingMore(true);
    } else {
      setDoomscrollLoading(true);
    }
    setDoomscrollError(null);

    try {
      const targetItemsPerLoad = 250;
      const pagesToLoad = Math.ceil(targetItemsPerLoad / 20);
      let fetchedPages = 0;
      let hitEnd = false;
      let lastBatchSize = 0;

      if (reset) {
        setDoomscrollResults([]);
      }

      const sortBy =
        doomscrollMediaType === 'shows' ? 'vote_count.desc' : doomscrollMovieSortBy(doomscrollDiscoverMode);
      const fetchDoomscrollPage = async (currentPage: number): Promise<TmdbMultiResult[]> => {
        if (doomscrollMediaType === 'movies') {
          if (doomscrollYearFilter.mode === 'all') {
            return tmdbDiscoverMoviesByYear(undefined, currentPage, undefined, [], sortBy);
          }
          if (doomscrollYearFilter.mode === 'single') {
            return tmdbDiscoverMoviesByYear(doomscrollYearFilter.year, currentPage, undefined, [], sortBy);
          }
          return tmdbDiscoverMoviesByReleaseYearRange(
            doomscrollYearFilter.fromYear,
            doomscrollYearFilter.toYear,
            currentPage,
            undefined,
            sortBy
          );
        }
        if (doomscrollYearFilter.mode === 'all') {
          return tmdbDiscoverTvByYear(undefined, currentPage, undefined, [], sortBy);
        }
        if (doomscrollYearFilter.mode === 'single') {
          return tmdbDiscoverTvByYear(doomscrollYearFilter.year, currentPage, undefined, [], sortBy);
        }
        return tmdbDiscoverTvByFirstAirYearRange(
          doomscrollYearFilter.fromYear,
          doomscrollYearFilter.toYear,
          currentPage,
          undefined,
          sortBy
        );
      };

      for (let i = 0; i < pagesToLoad; i++) {
        const currentPage = page + i;
        const results = await fetchDoomscrollPage(currentPage);

        if (results.length === 0) {
          hitEnd = true;
          break;
        }

        fetchedPages += 1;
        lastBatchSize = results.length;

        // Stream each fetched page into the grid so entries appear as soon as possible.
        setDoomscrollResults((prev) => {
          const existingIds = new Set(prev.map((r) => `${r.media_type}-${r.id}`));
          const dedupedIncoming = results.filter((r) => !existingIds.has(`${r.media_type}-${r.id}`));
          return [...prev, ...dedupedIncoming];
        });

        if (results.length < 20) {
          hitEnd = true;
          break;
        }
      }

      const canLoadMore = fetchedPages > 0 && !hitEnd && lastBatchSize === 20;
      setDoomscrollLastPageWasFull(canLoadMore);

      if (fetchedPages > 0) {
        setDoomscrollPage(page + fetchedPages - 1);
      } else if (reset) {
        setDoomscrollPage(1);
      }
    } catch (err) {
      setDoomscrollError(err instanceof Error ? err.message : String(err));
      setDoomscrollLastPageWasFull(false);
    } finally {
      setDoomscrollLoading(false);
      setDoomscrollIsLoadingMore(false);
    }
  };

  const loadUnreleasedContent = async (reset: boolean = false) => {
    if (unreleasedLoading || unreleasedIsLoadingMore) return;

    const page = reset ? 1 : unreleasedPage + 1;
    const isLoadMore = !reset;

    if (isLoadMore) {
      setUnreleasedIsLoadingMore(true);
    } else {
      setUnreleasedLoading(true);
    }
    setUnreleasedError(null);

    try {
      const targetItemsPerLoad = 250;
      const pagesToLoad = Math.ceil(targetItemsPerLoad / 20);
      let fetchedPages = 0;
      let hitEnd = false;
      let lastBatchSize = 0;

      if (reset) {
        setUnreleasedResults([]);
      }

      for (let i = 0; i < pagesToLoad; i++) {
        const currentPage = page + i;
        const results = unreleasedMediaType === 'movies'
          ? await tmdbDiscoverUnreleasedMovies(currentPage)
          : await tmdbDiscoverUnreleasedTv(currentPage);

        if (results.length === 0) {
          hitEnd = true;
          break;
        }

        fetchedPages += 1;
        lastBatchSize = results.length;

        setUnreleasedResults((prev) => {
          const existingIds = new Set(prev.map((r) => `${r.media_type}-${r.id}`));
          const dedupedIncoming = results.filter((r) => !existingIds.has(`${r.media_type}-${r.id}`));
          return [...prev, ...dedupedIncoming];
        });

        if (results.length < 20) {
          hitEnd = true;
          break;
        }
      }

      const canLoadMore = fetchedPages > 0 && !hitEnd && lastBatchSize === 20;
      setUnreleasedLastPageWasFull(canLoadMore);

      if (fetchedPages > 0) {
        setUnreleasedPage(page + fetchedPages - 1);
      } else if (reset) {
        setUnreleasedPage(1);
      }
    } catch (err) {
      setUnreleasedError(err instanceof Error ? err.message : String(err));
      setUnreleasedLastPageWasFull(false);
    } finally {
      setUnreleasedLoading(false);
      setUnreleasedIsLoadingMore(false);
    }
  };

  // Scroll to top function
  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const shouldLoadMoreDoomscroll = doomscrollResults.length > 0 && doomscrollLastPageWasFull && !doomscrollIsLoadingMore;
  const shouldLoadMoreUnreleased = unreleasedResults.length > 0 && unreleasedLastPageWasFull && !unreleasedIsLoadingMore;

  const currentYear = new Date().getFullYear();

  const handleDoomscrollMediaTypeChange = (mediaType: 'movies' | 'shows') => {
    setDoomscrollMediaType(mediaType);
    setDoomscrollResults([]);
    setDoomscrollPage(1);
    setDoomscrollLastPageWasFull(false);
    setDoomscrollError(null);
    setDoomscrollKeepVisibleIds([]);
  };

  const handleDoomscrollDiscoverModeChange = (mode: 'popularity' | 'box_office') => {
    setDoomscrollDiscoverMode(mode);
    setDoomscrollResults([]);
    setDoomscrollPage(1);
    setDoomscrollLastPageWasFull(false);
    setDoomscrollError(null);
    setDoomscrollKeepVisibleIds([]);
  };

  const applyDoomscrollYearFilter = (next: DoomscrollYearFilter) => {
    setDoomscrollYearFilter(next);
    setDoomscrollResults([]);
    setDoomscrollPage(1);
    setDoomscrollLastPageWasFull(false);
    setDoomscrollError(null);
    setDoomscrollKeepVisibleIds([]);
    setShowDoomscrollYearModal(false);
  };

  const handleUnreleasedMediaTypeChange = (mediaType: 'movies' | 'shows') => {
    setUnreleasedMediaType(mediaType);
    setUnreleasedResults([]);
    setUnreleasedPage(1);
    setUnreleasedLastPageWasFull(false);
    setUnreleasedError(null);
    setUnreleasedKeepVisibleIds([]);
  };

  useEffect(() => {
    if (activeTab === 'doomscroll' && doomscrollResults.length === 0) {
      loadDoomscrollContent(true);
    }
  }, [activeTab, doomscrollMediaType, doomscrollYearFilter, doomscrollDiscoverMode]);

  useEffect(() => {
    if (activeTab === 'unreleased' && unreleasedResults.length === 0) {
      void loadUnreleasedContent(true);
    }
  }, [activeTab, unreleasedMediaType]);

  useEffect(() => {
    if (activeTab !== 'doomscroll') return;
    if (!shouldLoadMoreDoomscroll) return;

    const onScroll = () => {
      if (doomscrollLoading || doomscrollIsLoadingMore || !doomscrollLastPageWasFull) return;
      const bottomOffset = document.documentElement.scrollHeight - (window.innerHeight + window.scrollY);
      if (bottomOffset < 300) {
        void loadDoomscrollContent(false);
      }
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [activeTab, shouldLoadMoreDoomscroll, doomscrollLoading, doomscrollIsLoadingMore, doomscrollLastPageWasFull, doomscrollPage, doomscrollMediaType, doomscrollResults.length]);

  useEffect(() => {
    if (activeTab !== 'unreleased') return;
    if (!shouldLoadMoreUnreleased) return;

    const onScroll = () => {
      if (unreleasedLoading || unreleasedIsLoadingMore || !unreleasedLastPageWasFull) return;
      const bottomOffset = document.documentElement.scrollHeight - (window.innerHeight + window.scrollY);
      if (bottomOffset < 300) {
        void loadUnreleasedContent(false);
      }
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [
    activeTab,
    shouldLoadMoreUnreleased,
    unreleasedLoading,
    unreleasedIsLoadingMore,
    unreleasedLastPageWasFull,
    unreleasedPage,
    unreleasedMediaType,
    unreleasedResults.length
  ]);

  const filteredResults = useMemo(() => {
    return remoteResults.filter(r => {
      if (r.media_type === 'movie') return showMovies;
      if (r.media_type === 'tv') return showTv;
      if (r.media_type === 'person') return showPeople;
      return false;
    });
  }, [remoteResults, showMovies, showTv, showPeople]);

  const filteredDoomscrollResults = useMemo(() => {
    const keepVisible = new Set(doomscrollKeepVisibleIds);
    return doomscrollResults.filter((r) => {
      const id = resultId(r);
      const isMovie = r.media_type === 'movie';
      const isTv = r.media_type === 'tv';
      const watchlistId = isMovie ? id : `tmdb-tv-${r.id}`;
      const inWatchlist = isInWatchlist(watchlistId);
      const existing = isMovie ? getMovieById(id) : isTv ? getShowById(`tmdb-tv-${r.id}`) : null;
      const seen = Boolean(existing && existing.watchRecords && existing.watchRecords.length > 0);

      if (keepVisible.has(id)) return true;

      if (!doomscrollShowSeen && seen) return false;
      if (!doomscrollShowWatchlist && inWatchlist) return false;
      return true;
    });
  }, [doomscrollResults, doomscrollKeepVisibleIds, doomscrollShowSeen, doomscrollShowWatchlist, isInWatchlist, getMovieById, getShowById]);

  const filteredUnreleasedResults = useMemo(() => {
    const keepVisible = new Set(unreleasedKeepVisibleIds);
    return unreleasedResults.filter((r) => {
      const id = resultId(r);
      const isMovie = r.media_type === 'movie';
      const isTv = r.media_type === 'tv';
      const watchlistId = isMovie ? id : `tmdb-tv-${r.id}`;
      const inWatchlist = isInWatchlist(watchlistId);

      if (keepVisible.has(id)) return true;

      if (!unreleasedShowWatchlist && inWatchlist) return false;
      return true;
    });
  }, [unreleasedResults, unreleasedKeepVisibleIds, unreleasedShowWatchlist, isInWatchlist]);

  const visibleSearchResults = useMemo(
    () => filteredResults.slice(0, searchVisibleCount),
    [filteredResults, searchVisibleCount]
  );

  const canLoadMoreSearchResults =
    activeTab === 'search' &&
    searchLoadMoreClicks < SEARCH_MAX_LOAD_MORE_CLICKS &&
    filteredResults.length > searchVisibleCount;

  const handleLoadMoreSearchResults = () => {
    setSearchVisibleCount((prev) => Math.min(prev + SEARCH_LOAD_MORE_INCREMENT, filteredResults.length));
    setSearchLoadMoreClicks((prev) => Math.min(prev + 1, SEARCH_MAX_LOAD_MORE_CLICKS));
  };

  const placeholderText = useMemo(() => {
    if (showMovies && showTv && showPeople) return 'Try "Arcane", "La La Land", "Emma Stone"…';
    if (showMovies && !showTv && !showPeople) return 'Try "La La Land", "The Matrix"…';
    if (!showMovies && showTv && !showPeople) return 'Try "Arcane", "Game of Thrones"…';
    if (!showMovies && !showTv && showPeople) return 'Try "Emma Stone", "Steven Spielberg"…';
    if (showMovies && showTv && !showPeople) return 'Try "La La Land", "Arcane"…';
    if (showMovies && !showTv && showPeople) return 'Try "La La Land", "Emma Stone"…';
    if (!showMovies && showTv && showPeople) return 'Try "Arcane", "Emma Stone"…';
    return 'Select query option(s)...';
  }, [showMovies, showTv, showPeople]);

  const actionFeedbackTimeoutsRef = useRef<number[]>([]);

  const triggerActionFeedback = useCallback((button: HTMLButtonElement) => {
    if (button.disabled) return;
    const card = button.closest('.search-card');

    button.classList.remove('search-card-action--clicked');
    void button.offsetWidth;
    button.classList.add('search-card-action--clicked');

    if (card instanceof HTMLElement) {
      card.classList.remove('search-card--action-feedback');
      void card.offsetWidth;
      card.classList.add('search-card--action-feedback');
    }

    const buttonTimeout = window.setTimeout(() => {
      button.classList.remove('search-card-action--clicked');
    }, 620);
    actionFeedbackTimeoutsRef.current.push(buttonTimeout);

    if (card instanceof HTMLElement) {
      const cardTimeout = window.setTimeout(() => {
        card.classList.remove('search-card--action-feedback');
      }, 1200);
      actionFeedbackTimeoutsRef.current.push(cardTimeout);
    }
  }, []);

  useEffect(() => {
    return () => {
      actionFeedbackTimeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
      actionFeedbackTimeoutsRef.current = [];
    };
  }, []);

  const findFeedbackButtonFromTarget = useCallback((target: EventTarget | null): HTMLButtonElement | null => {
    const element = target as HTMLElement | null;
    if (!element) return null;
    const actionButton = element.closest(
      'button.search-card-action, button.search-toggle-btn, button.search-tab, button.wander-toggle-btn, button.wander-genre-btn, button.wander-year-btn, button.search-load-more-btn, button.search-person-projects-expand'
    );
    return actionButton instanceof HTMLButtonElement ? actionButton : null;
  }, []);

  const handleActionButtonPointerDownCapture = useCallback((event: React.PointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    const actionButton = findFeedbackButtonFromTarget(event.target);
    if (!actionButton) return;
    triggerActionFeedback(actionButton);
  }, [findFeedbackButtonFromTarget, triggerActionFeedback]);

  const handleActionButtonKeyDownCapture = useCallback((event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const actionButton = findFeedbackButtonFromTarget(event.target);
    if (!actionButton) return;
    triggerActionFeedback(actionButton);
  }, [findFeedbackButtonFromTarget, triggerActionFeedback]);

  const runAfterInteractionPaint = useCallback((operation: () => void) => {
    window.requestAnimationFrame(() => {
      operation();
    });
  }, []);

  const runAfterInteractionAnimation = useCallback((operation: () => void) => {
    const FEEDBACK_PLAY_MS = 240;
    window.setTimeout(() => {
      operation();
    }, FEEDBACK_PLAY_MS);
  }, []);

  return (
    <section>
      <header className="page-heading">
        <div className="page-heading-main">
          <div>
            <h1 className="page-title">Search</h1>
            <RandomQuote />
          </div>
          {/* Tab Selection - moved to header */}
          <div className="search-tabs-header">
            <button
              type="button"
              className={`search-tab ${activeTab === 'search' ? 'active' : ''}`}
              onClick={() => setActiveTab('search')}
            >
              Search
            </button>
            <button
              type="button"
              className={`search-tab ${activeTab === 'doomscroll' ? 'active' : ''}`}
              onClick={() => setActiveTab('doomscroll')}
            >
              Doomscroll
            </button>
            <button
              type="button"
              className={`search-tab ${activeTab === 'unreleased' ? 'active' : ''}`}
              onClick={() => setActiveTab('unreleased')}
            >
              Unreleased
            </button>
          </div>
        </div>
      </header>

      <div
        className="search-shell card-surface"
        onPointerDownCapture={handleActionButtonPointerDownCapture}
        onKeyDownCapture={handleActionButtonKeyDownCapture}
      >

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

              </div>
            </label>
            <div className="search-toggles">
              <div className="search-toggle-group search-toggle-group-query">
                <span className="search-toggle-label">Query</span>
                <div className="search-toggle-buttons">
                  <button
                    type="button"
                    className={`search-toggle-btn ${showMovies ? 'active' : ''}`}
                    aria-pressed={showMovies}
                    onClick={() => setShowMovies(!showMovies)}
                  >
                    <span className="search-toggle-btn-text">Movies</span>
                    <span className="search-toggle-btn-state">{showMovies ? 'ON' : 'OFF'}</span>
                  </button>
                  <button
                    type="button"
                    className={`search-toggle-btn ${showTv ? 'active' : ''}`}
                    aria-pressed={showTv}
                    onClick={() => setShowTv(!showTv)}
                  >
                    <span className="search-toggle-btn-text">TV Shows</span>
                    <span className="search-toggle-btn-state">{showTv ? 'ON' : 'OFF'}</span>
                  </button>
                  <button
                    type="button"
                    className={`search-toggle-btn ${showPeople ? 'active' : ''}`}
                    aria-pressed={showPeople}
                    onClick={() => setShowPeople(!showPeople)}
                  >
                    <span className="search-toggle-btn-text">People</span>
                    <span className="search-toggle-btn-state">{showPeople ? 'ON' : 'OFF'}</span>
                  </button>
                </div>
              </div>
              <div className="search-toggle-group search-toggle-group-depth">
                <span className="search-toggle-label">Depth</span>
                <div className="search-toggle-buttons search-toggle-buttons-segmented">
                  <button
                    type="button"
                    className={`search-toggle-btn ${searchDepth === 'tile' ? 'active' : ''}`}
                    aria-pressed={searchDepth === 'tile'}
                    onClick={() => setSearchDepth('tile')}
                  >
                    <span className="search-toggle-btn-text">Tile</span>
                  </button>
                  <button
                    type="button"
                    className={`search-toggle-btn ${searchDepth === 'detailed' ? 'active' : ''}`}
                    aria-pressed={searchDepth === 'detailed'}
                    onClick={() => setSearchDepth('detailed')}
                  >
                    <span className="search-toggle-btn-text">Detailed</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'doomscroll' && (
          <div className="wander-controls">
            <div className="wander-toggles">
              <div className="wander-toggle-group">
                <span className="wander-toggle-label">Type</span>
                <div className="wander-toggle-buttons wander-type-toggle">
                  <button
                    type="button"
                    className={`wander-toggle-btn ${doomscrollMediaType === 'movies' ? 'active' : ''}`}
                    onClick={() => handleDoomscrollMediaTypeChange('movies')}
                  >
                    Movies
                  </button>
                  <button
                    type="button"
                    className={`wander-toggle-btn ${doomscrollMediaType === 'shows' ? 'active' : ''}`}
                    onClick={() => handleDoomscrollMediaTypeChange('shows')}
                  >
                    TV Shows
                  </button>
                </div>
              </div>
              <div className="wander-toggle-group">
                <span className="wander-toggle-label">Years</span>
                <button
                  type="button"
                  className="wander-genre-btn"
                  onClick={() => setShowDoomscrollYearModal(true)}
                >
                  {formatDoomscrollYearFilterLabel(doomscrollYearFilter)}
                </button>
              </div>
              {doomscrollMediaType === 'movies' ? (
                <div className="wander-toggle-group">
                  <span className="wander-toggle-label">Filter</span>
                  <div className="wander-toggle-buttons wander-type-toggle">
                    <button
                      type="button"
                      className={`wander-toggle-btn ${doomscrollDiscoverMode === 'popularity' ? 'active' : ''}`}
                      onClick={() => handleDoomscrollDiscoverModeChange('popularity')}
                    >
                      Popularity
                    </button>
                    <button
                      type="button"
                      className={`wander-toggle-btn ${doomscrollDiscoverMode === 'box_office' ? 'active' : ''}`}
                      onClick={() => handleDoomscrollDiscoverModeChange('box_office')}
                    >
                      Box office
                    </button>
                  </div>
                </div>
              ) : null}
              <div className="wander-toggle-group">
                <span className="wander-toggle-label">Show seen</span>
                <button
                  type="button"
                  className={`wander-genre-btn ${doomscrollShowSeen ? 'active' : ''}`}
                  onClick={() => setDoomscrollShowSeen((prev) => !prev)}
                >
                  {doomscrollShowSeen ? 'ON' : 'OFF'}
                </button>
              </div>
              <div className="wander-toggle-group">
                <span className="wander-toggle-label">Show watchlisted</span>
                <button
                  type="button"
                  className={`wander-genre-btn ${doomscrollShowWatchlist ? 'active' : ''}`}
                  onClick={() => setDoomscrollShowWatchlist((prev) => !prev)}
                >
                  {doomscrollShowWatchlist ? 'ON' : 'OFF'}
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'unreleased' && (
          <div className="wander-controls">
            <div className="wander-toggles">
              <div className="wander-toggle-group">
                <span className="wander-toggle-label">Type</span>
                <div className="wander-toggle-buttons wander-type-toggle">
                  <button
                    type="button"
                    className={`wander-toggle-btn ${unreleasedMediaType === 'movies' ? 'active' : ''}`}
                    onClick={() => handleUnreleasedMediaTypeChange('movies')}
                  >
                    Movies
                  </button>
                  <button
                    type="button"
                    className={`wander-toggle-btn ${unreleasedMediaType === 'shows' ? 'active' : ''}`}
                    onClick={() => handleUnreleasedMediaTypeChange('shows')}
                  >
                    TV Shows
                  </button>
                </div>
              </div>
              <div className="wander-toggle-group">
                <span className="wander-toggle-label">Show watchlisted</span>
                <button
                  type="button"
                  className={`wander-genre-btn ${unreleasedShowWatchlist ? 'active' : ''}`}
                  onClick={() => setUnreleasedShowWatchlist((prev) => !prev)}
                >
                  {unreleasedShowWatchlist ? 'ON' : 'OFF'}
                </button>
              </div>
            </div>
          </div>
        )}

        {error && <div className="search-error">{error}</div>}
        {doomscrollError && <div className="search-error">{doomscrollError}</div>}
        {unreleasedError && <div className="search-error">{unreleasedError}</div>}

        {/* Search Results */}
        {activeTab === 'search' && (
          <div className="search-results">
            {visibleSearchResults.map((r) => {
              const id = resultId(r);
              const isMovie = r.media_type === 'movie';
              const isTv = r.media_type === 'tv';
              const imgPath = r.media_type === 'person' ? r.profile_path : r.poster_path;
              const imgUrl = tmdbImagePath(imgPath);
              const existingMovie = isMovie ? getMovieById(id) : null;
              const inUnrankedMovie = existingMovie?.classKey === 'UNRANKED';
              const existingTv = isTv ? getShowById(`tmdb-tv-${r.id}`) : null;
              const inWatchlist = (isMovie || isTv) && isInWatchlist(id);
              const inSelectedCollection = isInSelectedQuickCollection(r);

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
                        {r.media_type === 'person' ? <User size={24} /> : <Film size={24} />}
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
                      <div className="search-card-title-row">
                        <div className="search-card-title">{r.title}</div>
                        {(isMovie || isTv) && (
                          <button
                            type="button"
                            className="search-card-info-btn"
                            onClick={() => setInfoModalTarget({
                              tmdbId: r.id,
                              mediaType: r.media_type as 'movie' | 'tv',
                              title: r.title,
                              posterPath: r.poster_path || undefined,
                              releaseDate: r.release_date || undefined
                            })}
                            title="View detailed information"
                          >
                            <Info size={16} />
                          </button>
                        )}
                        {r.media_type === 'person' && (
                          <button
                            type="button"
                            className="search-card-info-btn"
                            onClick={() => setPersonInfoModalTarget({
                              tmdbId: r.id,
                              name: r.title,
                              profilePath: r.profile_path || undefined
                            })}
                            title="View detailed information"
                          >
                            <Info size={16} />
                          </button>
                        )}
                      </div>
                      <div className="search-card-subtitle">
                        {r.subtitle}
                        {(isMovie || isTv) && searchDepth === 'detailed' && (
                          <SearchResultExtendedInfo id={r.id} mediaType={r.media_type as 'movie' | 'tv'} />
                        )}
                      </div>
                    </div>
                    {r.media_type === 'person' && searchDepth === 'detailed' && (
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
                            runAfterInteractionAnimation(() => removeMovieEntry(id));
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
                            runAfterInteractionAnimation(() => removeFromWatchlist(id));
                          }}
                        >
                          REMOVE WATCHLIST
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="search-card-action search-card-action-dim-green"
                          disabled={isSaving}
                          onClick={() => runAfterInteractionAnimation(handleAddToWatchlist)}
                        >
                          ADD WATCHLIST
                        </button>
                      )}
                      {canUseQuickAdd && (
                        <button
                          type="button"
                          className={`search-card-action ${inSelectedCollection ? 'search-card-action-red' : 'search-card-action-dim-green'}`}
                          disabled={isSaving}
                          onClick={() => void handleQuickAddToCollection(r)}
                        >
                          {inSelectedCollection
                            ? `REMOVE FROM ${selectedQuickCollection?.name.toUpperCase()}`
                            : `ADD TO ${quickDirection.toUpperCase()} OF ${selectedQuickCollection?.name.toUpperCase()}`}
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
                            runAfterInteractionAnimation(() => removeShowEntry(`tmdb-tv-${r.id}`));
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
                            runAfterInteractionAnimation(() => removeFromWatchlist(`tmdb-tv-${r.id}`));
                          }}
                        >
                          REMOVE WATCHLIST
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="search-card-action search-card-action-dim-green"
                          disabled={isSaving}
                          onClick={() => runAfterInteractionAnimation(handleAddToWatchlist)}
                        >
                          ADD WATCHLIST
                        </button>
                      )}
                      {canUseQuickAdd && (
                        <button
                          type="button"
                          className={`search-card-action ${inSelectedCollection ? 'search-card-action-red' : 'search-card-action-dim-green'}`}
                          disabled={isSaving}
                          onClick={() => void handleQuickAddToCollection(r)}
                        >
                          {inSelectedCollection
                            ? `REMOVE FROM ${selectedQuickCollection?.name.toUpperCase()}`
                            : `ADD TO ${quickDirection.toUpperCase()} OF ${selectedQuickCollection?.name.toUpperCase()}`}
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
            {canLoadMoreSearchResults && (
              <div className="search-load-more">
                <button
                  type="button"
                  className="search-load-more-btn"
                  onClick={handleLoadMoreSearchResults}
                >
                  Load More Results
                </button>
              </div>
            )}
          </div>
        )}

        {activeTab === 'doomscroll' && (
          <div className="wander-results">
            <div className="wander-grid doomscroll-grid">
              {filteredDoomscrollResults.map((r) => {
                const id = resultId(r);
                const isMovie = r.media_type === 'movie';
                const isTv = r.media_type === 'tv';
                const imgUrl = tmdbImagePath(r.poster_path);
                const existingMovie = isMovie ? getMovieById(id) : null;
                const inUnrankedMovie = existingMovie?.classKey === 'UNRANKED';
                const existingTv = isTv ? getShowById(`tmdb-tv-${r.id}`) : null;
                const inWatchlist = isMovie ? isInWatchlist(id) : isInWatchlist(`tmdb-tv-${r.id}`);
                const seen =
                  Boolean(isMovie && existingMovie?.watchRecords && existingMovie.watchRecords.length > 0) ||
                  Boolean(isTv && existingTv?.watchRecords && existingTv.watchRecords.length > 0);

                const handleAddToWatchlist = () => {
                  if (isMovie) {
                    addToWatchlist(
                      { id, title: r.title, posterPath: r.poster_path, releaseDate: r.release_date },
                      'movies'
                    );
                  } else if (isTv) {
                    addToWatchlist(
                      { id: `tmdb-tv-${r.id}`, title: r.title, posterPath: r.poster_path, releaseDate: r.release_date },
                      'tv'
                    );
                  }
                  setDoomscrollKeepVisibleIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
                };

                return (
                  <article
                    key={`${r.media_type}-${r.id}`}
                    className={`search-card wander-card doomscroll-card ${doomscrollMediaType === 'shows' ? 'wander-show-card' : ''}${doomscrollShowSeen && seen ? ' doomscroll-card--seen' : ''}`}
                  >
                    <div className="search-card-main">
                      <div className="search-card-info">
                        <div className="search-card-badge">
                          {r.media_type === 'movie' ? 'MOVIE' : 'TV'}
                        </div>
                        <div className="search-card-title">{r.title}</div>
                      </div>
                    </div>
                    <div className="search-card-poster doomscroll-poster">
                      {imgUrl ? (
                        <img src={imgUrl} alt={r.title} />
                      ) : (
                        <div className="search-card-poster-fallback">
                          <Film size={24} />
                        </div>
                      )}
                      <div className="doomscroll-poster-actions">
                        <button
                          type="button"
                          className="search-card-info-btn"
                          onClick={() => setInfoModalTarget({
                            tmdbId: r.id,
                            mediaType: r.media_type as 'movie' | 'tv',
                            title: r.title,
                            posterPath: r.poster_path,
                            releaseDate: r.release_date,
                          })}
                          title="Info"
                        >
                          <Info size={13} />
                        </button>
                        <button
                          type="button"
                          className={`search-card-action ${isMovie
                            ? (existingMovie && !inUnrankedMovie ? 'search-card-action-blue' : 'search-card-action-green')
                            : (existingTv && existingTv.classKey !== 'UNRANKED' ? 'search-card-action-blue' : 'search-card-action-green')
                            } doomscroll-rank-btn`}
                          disabled={isSaving}
                          onClick={() => handleOpenRecord(r)}
                        >
                          {isMovie
                            ? (existingMovie && !inUnrankedMovie ? 'Edit' : 'Rank')
                            : (existingTv && existingTv.classKey !== 'UNRANKED' ? 'Edit' : 'Rank')}
                        </button>
                      </div>
                    </div>
                    {isMovie ? (
                      <div className="search-card-actions">
                        {!existingMovie && (
                          <button
                            type="button"
                            className="search-card-action search-card-action-dim-green"
                            disabled={isSaving}
                            onClick={() => void handleAddToUnranked(r)}
                          >
                            Unranked+
                          </button>
                        )}
                        {existingMovie && existingMovie.classKey === 'UNRANKED' && (
                          <button
                            type="button"
                            className="search-card-action search-card-action-red"
                            disabled={isSaving}
                            onClick={() => runAfterInteractionAnimation(() => removeMovieEntry(id))}
                          >
                            Unranked-
                          </button>
                        )}
                        {inWatchlist ? (
                          <button
                            type="button"
                            className="search-card-action search-card-action-red"
                            disabled={isSaving}
                            onClick={() => runAfterInteractionAnimation(() => removeFromWatchlist(id))}
                          >
                            Watchlist-
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="search-card-action search-card-action-dim-green"
                            disabled={isSaving}
                            onClick={() => runAfterInteractionAnimation(handleAddToWatchlist)}
                          >
                            Watchlist+
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="search-card-actions">
                        {!existingTv && (
                          <button
                            type="button"
                            className="search-card-action search-card-action-dim-green"
                            disabled={isSaving}
                            onClick={() => void handleAddTvToUnranked(r)}
                          >
                            Unranked+
                          </button>
                        )}
                        {existingTv && existingTv.classKey === 'UNRANKED' && (
                          <button
                            type="button"
                            className="search-card-action search-card-action-red"
                            disabled={isSaving}
                            onClick={() => runAfterInteractionAnimation(() => removeShowEntry(`tmdb-tv-${r.id}`))}
                          >
                            Unranked-
                          </button>
                        )}
                        {inWatchlist ? (
                          <button
                            type="button"
                            className="search-card-action search-card-action-red"
                            disabled={isSaving}
                            onClick={() => runAfterInteractionAnimation(() => removeFromWatchlist(`tmdb-tv-${r.id}`))}
                          >
                            Watchlist-
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="search-card-action search-card-action-dim-green"
                            disabled={isSaving}
                            onClick={() => runAfterInteractionAnimation(handleAddToWatchlist)}
                          >
                            Watchlist+
                          </button>
                        )}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
            {doomscrollIsLoadingMore && (
              <div className="wander-empty">Loading more...</div>
            )}
            {filteredDoomscrollResults.length === 0 && !doomscrollLoading && !doomscrollError && (
              <div className="wander-empty">No results for current filters.</div>
            )}
            {doomscrollResults.length > 0 && (
              <button
                type="button"
                className="wander-to-top-btn"
                onClick={scrollToTop}
                aria-label="Scroll to top"
              >
                <ArrowUp size={14} /> Top
              </button>
            )}
          </div>
        )}

        {activeTab === 'unreleased' && (
          <div className="wander-results">
            <div className="wander-grid doomscroll-grid">
              {filteredUnreleasedResults.map((r) => {
                const id = resultId(r);
                const isMovie = r.media_type === 'movie';
                const isTv = r.media_type === 'tv';
                const imgUrl = tmdbImagePath(r.poster_path);
                const existingMovie = isMovie ? getMovieById(id) : null;
                const inUnrankedMovie = existingMovie?.classKey === 'UNRANKED';
                const existingTv = isTv ? getShowById(`tmdb-tv-${r.id}`) : null;
                const inWatchlist = isMovie ? isInWatchlist(id) : isInWatchlist(`tmdb-tv-${r.id}`);

                const handleAddToWatchlist = () => {
                  if (isMovie) {
                    addToWatchlist(
                      { id, title: r.title, posterPath: r.poster_path, releaseDate: r.release_date },
                      'movies'
                    );
                  } else if (isTv) {
                    addToWatchlist(
                      { id: `tmdb-tv-${r.id}`, title: r.title, posterPath: r.poster_path, releaseDate: r.release_date },
                      'tv'
                    );
                  }
                  setUnreleasedKeepVisibleIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
                };

                return (
                  <article key={`${r.media_type}-${r.id}`} className={`search-card wander-card doomscroll-card ${unreleasedMediaType === 'shows' ? 'wander-show-card' : ''}`}>
                    <div className="search-card-main">
                      <div className="search-card-info">
                        <div className="search-card-badge">
                          {r.media_type === 'movie' ? 'MOVIE' : 'TV'}
                        </div>
                        <div className="search-card-title">{r.title}</div>
                      </div>
                    </div>
                    <div className="search-card-poster doomscroll-poster">
                      {imgUrl ? (
                        <img src={imgUrl} alt={r.title} />
                      ) : (
                        <div className="search-card-poster-fallback">
                          <Film size={24} />
                        </div>
                      )}
                      <div className="doomscroll-poster-actions">
                        <button
                          type="button"
                          className="search-card-info-btn"
                          onClick={() => setInfoModalTarget({
                            tmdbId: r.id,
                            mediaType: r.media_type as 'movie' | 'tv',
                            title: r.title,
                            posterPath: r.poster_path,
                            releaseDate: r.release_date,
                          })}
                          title="Info"
                        >
                          <Info size={13} />
                        </button>
                        <button
                          type="button"
                          className={`search-card-action ${isMovie
                            ? (existingMovie && !inUnrankedMovie ? 'search-card-action-blue' : 'search-card-action-green')
                            : (existingTv && existingTv.classKey !== 'UNRANKED' ? 'search-card-action-blue' : 'search-card-action-green')
                            } doomscroll-rank-btn`}
                          disabled={isSaving}
                          onClick={() => handleOpenRecord(r)}
                        >
                          {isMovie
                            ? (existingMovie && !inUnrankedMovie ? 'Edit' : 'Rank')
                            : (existingTv && existingTv.classKey !== 'UNRANKED' ? 'Edit' : 'Rank')}
                        </button>
                      </div>
                    </div>
                    {isMovie ? (
                      <div className="search-card-actions">
                        {!existingMovie && (
                          <button
                            type="button"
                            className="search-card-action search-card-action-dim-green"
                            disabled={isSaving}
                            onClick={() => void handleAddToUnranked(r)}
                          >
                            Unranked+
                          </button>
                        )}
                        {existingMovie && existingMovie.classKey === 'UNRANKED' && (
                          <button
                            type="button"
                            className="search-card-action search-card-action-red"
                            disabled={isSaving}
                            onClick={() => runAfterInteractionAnimation(() => removeMovieEntry(id))}
                          >
                            Unranked-
                          </button>
                        )}
                        {inWatchlist ? (
                          <button
                            type="button"
                            className="search-card-action search-card-action-red"
                            disabled={isSaving}
                            onClick={() => runAfterInteractionAnimation(() => removeFromWatchlist(id))}
                          >
                            Watchlist-
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="search-card-action search-card-action-dim-green"
                            disabled={isSaving}
                            onClick={() => runAfterInteractionAnimation(handleAddToWatchlist)}
                          >
                            Watchlist+
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="search-card-actions">
                        {!existingTv && (
                          <button
                            type="button"
                            className="search-card-action search-card-action-dim-green"
                            disabled={isSaving}
                            onClick={() => void handleAddTvToUnranked(r)}
                          >
                            Unranked+
                          </button>
                        )}
                        {existingTv && existingTv.classKey === 'UNRANKED' && (
                          <button
                            type="button"
                            className="search-card-action search-card-action-red"
                            disabled={isSaving}
                            onClick={() => runAfterInteractionAnimation(() => removeShowEntry(`tmdb-tv-${r.id}`))}
                          >
                            Unranked-
                          </button>
                        )}
                        {inWatchlist ? (
                          <button
                            type="button"
                            className="search-card-action search-card-action-red"
                            disabled={isSaving}
                            onClick={() => runAfterInteractionAnimation(() => removeFromWatchlist(`tmdb-tv-${r.id}`))}
                          >
                            Watchlist-
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="search-card-action search-card-action-dim-green"
                            disabled={isSaving}
                            onClick={() => runAfterInteractionAnimation(handleAddToWatchlist)}
                          >
                            Watchlist+
                          </button>
                        )}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
            {unreleasedIsLoadingMore && (
              <div className="wander-empty">Loading more...</div>
            )}
            {filteredUnreleasedResults.length === 0 && !unreleasedLoading && !unreleasedError && (
              <div className="wander-empty">No upcoming titles for current filters.</div>
            )}
            {unreleasedResults.length > 0 && (
              <button
                type="button"
                className="wander-to-top-btn"
                onClick={scrollToTop}
                aria-label="Scroll to top"
              >
                <ArrowUp size={14} /> Top
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
          availableTags={getEditableListsForMediaType(recordTarget.media_type === 'movie' ? 'movie' : 'tv').map((list) => ({
            listId: list.id,
            label: list.name,
            color: list.color,
            selected: getSelectedListIdsForEntry(resultId(recordTarget)).includes(list.id),
            href: `/lists/${list.id}`,
          }))}
          collectionTags={(collectionIdsByEntryId.get(resultId(recordTarget)) ?? []).map((id) => ({
            id,
            label: globalCollections.find((c) => c.id === id)?.name ?? id,
            color: globalCollections.find((c) => c.id === id)?.color,
            href: `/lists/collection/${id}`,
          }))}
          onTagToggle={(listId, selected) => {
            setEntryListMembership(resultId(recordTarget), recordTarget.media_type === 'movie' ? 'movie' : 'tv', [{ listId, selected }]);
          }}
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
            navigate('/watchlist', { state: { scrollToId: resultId(recordTarget) } });
          }}
          onGoPickTemplate={() => {
            const mt = recordTarget.media_type;
            handleCloseRecord();
            navigate(
              mt === 'movie' ? '/movies#movie-class-templates' : '/tv#tv-class-templates',
              { replace: true }
            );
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
          onGoPickTemplate={() => {
            const dir = (personSaveType || 'actor') === 'director';
            handleCloseRecord();
            navigate(
              dir ? '/directors#directors-class-templates' : '/actors#actors-class-templates',
              { replace: true }
            );
          }}
        />
      )}

      <DoomscrollYearModal
        open={showDoomscrollYearModal}
        onClose={() => setShowDoomscrollYearModal(false)}
        initialValue={doomscrollYearFilter}
        maxYear={currentYear}
        onApply={applyDoomscrollYearFilter}
      />

      {/* Info Modal */}
      {infoModalTarget && (
        <InfoModal
          isOpen={!!infoModalTarget}
          onClose={() => setInfoModalTarget(null)}
          tmdbId={infoModalTarget.tmdbId}
          mediaType={infoModalTarget.mediaType}
          title={infoModalTarget.title}
          posterPath={infoModalTarget.posterPath}
          releaseDate={infoModalTarget.releaseDate}
          onEditWatches={() => {
            // Create a TmdbMultiResult from the info modal target to reuse existing handlers
            const editTarget: TmdbMultiResult = {
              id: infoModalTarget.tmdbId,
              title: infoModalTarget.title,
              subtitle: infoModalTarget.releaseDate ? String(infoModalTarget.releaseDate.slice(0, 4)) : '',
              poster_path: infoModalTarget.posterPath,
              media_type: infoModalTarget.mediaType,
              release_date: infoModalTarget.releaseDate,
              popularity: 0
            };
            setInfoModalTarget(null); // Close info modal first
            setRecordTarget(editTarget); // Open edit modal
          }}
        />
      )}

      {/* Person Info Modal */}
      {personInfoModalTarget && (
        <PersonInfoModal
          isOpen={!!personInfoModalTarget}
          onClose={() => setPersonInfoModalTarget(null)}
          tmdbId={personInfoModalTarget.tmdbId}
          name={personInfoModalTarget.name}
          profilePath={personInfoModalTarget.profilePath}
        />
      )}
    </section>
  );
}
