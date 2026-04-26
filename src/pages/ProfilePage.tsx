import { useMemo, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { RandomQuote } from '../components/RandomQuote';
import {
  useMoviesStore,
  getTotalMinutesFromRecords,
  getTotalEpisodesFromRecords,
  formatDuration,
  formatWatchtimeHours,
  getWatchRecordSortKey,
  formatWatchLabel
} from '../state/moviesStore';
import {
  compareRecentWatchEvents,
  compareChronologicalFirstWatchList,
  getWatchRecordDayOrder,
} from '../lib/watchRecordChronology';
import { useTvStore } from '../state/tvStore';
import { useWatchlistStore } from '../state/watchlistStore';
import { usePeopleStore, type PersonItem } from '../state/peopleStore';
import { useDirectorsStore, type DirectorItem } from '../state/directorsStore';
import type { MovieShowItem, WatchRecord } from '../components/EntryRowMovieShow';
import { UniversalEditModal, type UniversalEditTarget } from '../components/UniversalEditModal';
import { PersonRankingModal, type PersonRankingTarget, type PersonRankingSaveParams } from '../components/PersonRankingModal';
import { tmdbImagePath, getMovieImageSrc } from '../lib/tmdb';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ScatterChart, Scatter } from 'recharts';
import { ProfileWatchlist } from '../components/ProfileWatchlist';
import { PageSearch } from '../components/PageSearch';
import { ProfileCopyTopRankedSection } from '../components/ProfileCopyTopRankedSection';
import { Award, Share2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useListsStore } from '../state/listsStore';
import { ThemedDropdown } from '../components/ThemedDropdown';
import {
  buildTopTenByWatchYear,
  buildBottomTenByWatchYear,
  PROFILE_MEDIA_LIST_MODE_OPTIONS,
  type ProfileMediaListMode,
  type ProfileWatchYearFilter,
} from '../lib/profileMediaListHelpers';
import {
  PROFILE_RECENT_RANGE_OPTIONS,
  percentileFillWidthFromBadge,
  type ProfileRecentRange,
} from '../lib/profileRecentWatchedOptions';
import { watchMatrixEntriesToWatchRecords } from '../lib/watchMatrixMapping';
import { prepareWatchRecordsForSave } from '../lib/watchDayOrderUtils';
import { formatProfileWatchDateLabel } from '../lib/watchProfileDateLabel';
import './ProfilePage.css';
import '../components/ProfileSplitLayout.css';

const SCATTER_CLASS_COLORS = [
  '#F4A261',
  '#E76F51',
  '#2A9D8F',
  '#264653',
  '#E9C46A',
  '#8AB17D',
  '#6D597A',
  '#B56576',
  '#4CC9F0',
  '#90BE6D',
];

const PROFILE_COLLECTION_LABEL_OVERRIDES: Record<string, string> = {
  'Best Picture Winners': 'Best Pic Win',
  'IMDB Top 250 Movies': 'IMDB 250',
  'Letterboxd Top 500': 'Letterboxd 500',
  "Palme d'Or Winners": "Palme d'Or",
  'Best Picture Nominees': 'Best Pic Nominees',
  'Studio Ghibli Movies': 'Ghibli',
  'A24 Films': 'A24',
  'Best Animated Feature Winners': 'Best Animated',
  'Golden Bear Winners': 'Golden Bear',
  'Golden Lion Winners': 'Golden Lion',
  'NEON Films': 'NEON',
};

function formatWatchRatePercent(count: number, total: number): string {
  if (total <= 0) return '0.0';
  return ((count / total) * 100).toFixed(1);
}

function stableHash(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash;
}

async function copyTextCrossPlatform(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall back to legacy copy path
  }

  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '0';
    ta.style.left = '-9999px';
    ta.style.opacity = '0';
    ta.style.fontSize = '16px';
    document.body.appendChild(ta);

    ta.focus();
    ta.select();
    ta.setSelectionRange(0, ta.value.length);

    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

function CollectionRadialProgress({
  seen,
  watchlistUnseen,
  total,
  includeWatchlistSegment
}: {
  seen: number;
  watchlistUnseen: number;
  total: number;
  includeWatchlistSegment: boolean;
}) {
  const seenPct = total > 0 ? Math.min(100, (seen / total) * 100) : 0;
  const watchlistPct = includeWatchlistSegment && total > 0 ? Math.min(100 - seenPct, (watchlistUnseen / total) * 100) : 0;
  const combinedPct = Math.min(100, seenPct + watchlistPct);
  const pct = total > 0 ? Math.round((seen / total) * 100) : 0;
  const seenColor = pct < 33 ? '#d95858' : pct < 67 ? '#d7b24f' : pct < 100 ? '#48b66e' : '#f0cf72';
  const ringStyle = {
    background: `conic-gradient(
      ${seenColor} 0% ${seenPct}%,
      #4da3ff ${seenPct}% ${combinedPct}%,
      rgba(255, 255, 255, 0.12) ${combinedPct}% 100%
    )`,
  };
  const ringClassName = `profile-collection-radial-ring${pct === 100 ? ' profile-collection-radial-ring--complete' : ''}`;

  return (
    <div className="profile-collection-radial-wrap">
      <div className={ringClassName} style={ringStyle} />
    </div>
  );
}

/** Flatten all watches with a date (excl. LONG_AGO/UNKNOWN). One row per watch; use movie vs TV class orders separately to avoid duplicates. */
function getRecentWatches(
  moviesByClass: Record<string, MovieShowItem[]>,
  tvByClass: Record<string, MovieShowItem[]>,
  movieClassOrder: string[],
  tvClassOrder: string[]
): { item: MovieShowItem; record: WatchRecord; sortKey: string; isMovie: boolean }[] {
  const out: { item: MovieShowItem; record: WatchRecord; sortKey: string; isMovie: boolean }[] = [];
  const push = (item: MovieShowItem, record: WatchRecord, isMovie: boolean) => {
    const key = getWatchRecordSortKey(record);
    if (key === '0000-00-00') return;
    out.push({ item, record, sortKey: key, isMovie });
  };
  for (const classKey of movieClassOrder) {
    for (const item of moviesByClass[classKey] ?? []) {
      for (const r of item.watchRecords ?? []) {
        push(item, r, true);
      }
    }
  }
  for (const classKey of tvClassOrder) {
    for (const item of tvByClass[classKey] ?? []) {
      for (const r of item.watchRecords ?? []) {
        push(item, r, false);
      }
    }
  }
  return out.sort(compareRecentWatchEvents);
}

/** Flatten *all* watches (includes LONG_AGO/UNKNOWN -> sortKey "0000-00-00"). */
function getAllWatches(
  moviesByClass: Record<string, MovieShowItem[]>,
  tvByClass: Record<string, MovieShowItem[]>,
  movieClassOrder: string[],
  tvClassOrder: string[]
): { item: MovieShowItem; record: WatchRecord; sortKey: string; isMovie: boolean }[] {
  const out: { item: MovieShowItem; record: WatchRecord; sortKey: string; isMovie: boolean }[] = [];
  const push = (item: MovieShowItem, record: WatchRecord, isMovie: boolean) => {
    const key = getWatchRecordSortKey(record);
    out.push({ item, record, sortKey: key, isMovie });
  };
  for (const classKey of movieClassOrder) {
    for (const item of moviesByClass[classKey] ?? []) {
      for (const r of item.watchRecords ?? []) {
        push(item, r, true);
      }
    }
  }
  for (const classKey of tvClassOrder) {
    for (const item of tvByClass[classKey] ?? []) {
      for (const r of item.watchRecords ?? []) {
        push(item, r, false);
      }
    }
  }
  return out.sort(compareRecentWatchEvents);
}

function toYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getDateRangeFilter(
  range: 'this_year' | 'last_month' | 'last_year' | 'all_time'
): { min: string; max: string } | null {
  const now = new Date();
  const y = now.getFullYear();
  if (range === 'all_time') return null;
  if (range === 'this_year') {
    return { min: `${y}-01-01`, max: toYMD(now) };
  }
  if (range === 'last_month') {
    const from = new Date(now);
    from.setDate(from.getDate() - 31);
    return { min: toYMD(from), max: toYMD(now) };
  }
  // last_year: from (today - 365 days) to today
  const from = new Date(now);
  from.setDate(from.getDate() - 365);
  return { min: toYMD(from), max: toYMD(now) };
}

function getItemReleaseYear(item: MovieShowItem): number | null {
  if (!item.releaseDate) return null;
  const year = parseInt(item.releaseDate.slice(0, 4), 10);
  if (Number.isNaN(year)) return null;
  return year;
}

function buildTopFiveByYear(items: MovieShowItem[]) {
  const byYear = new Map<number, MovieShowItem[]>();
  for (const item of items) {
    const year = getItemReleaseYear(item);
    if (year == null) continue;
    const current = byYear.get(year) ?? [];
    if (current.length < 5) {
      current.push(item);
      byYear.set(year, current);
    }
  }
  return Array.from(byYear.entries())
    .sort((a, b) => b[0] - a[0])
    .map(([year, yearItems]) => ({ year, items: yearItems }));
}

function buildBottomFiveByYear(items: MovieShowItem[]) {
  const byYear = new Map<number, MovieShowItem[]>();
  for (let idx = items.length - 1; idx >= 0; idx -= 1) {
    const item = items[idx];
    const year = getItemReleaseYear(item);
    if (year == null) continue;
    const current = byYear.get(year) ?? [];
    if (current.length < 5) {
      current.push(item);
      byYear.set(year, current);
    }
  }
  return Array.from(byYear.entries())
    .sort((a, b) => b[0] - a[0])
    .map(([year, yearItems]) => ({ year, items: yearItems }));
}

function buildTopFiveByYearWithFill(primary: MovieShowItem[], filler: MovieShowItem[]) {
  const byYear = new Map<number, MovieShowItem[]>();
  const ensure = (year: number) => {
    const current = byYear.get(year);
    if (current) return current;
    const next: MovieShowItem[] = [];
    byYear.set(year, next);
    return next;
  };

  const pushIfSpace = (item: MovieShowItem) => {
    const year = getItemReleaseYear(item);
    if (year == null) return;
    const current = ensure(year);
    if (current.length >= 5) return;
    current.push(item);
  };

  for (const item of primary) pushIfSpace(item);
  for (const item of filler) pushIfSpace(item);

  return Array.from(byYear.entries())
    .sort((a, b) => b[0] - a[0])
    .map(([year, yearItems]) => ({ year, items: yearItems }));
}

function watchEventKey(w: { item: MovieShowItem; record: WatchRecord; sortKey: string; isMovie: boolean }) {
  // Must be stable even if some old records lack an id.
  const t = w.record.type ?? 'DATE';
  const idPart = w.record.id ? `::${w.record.id}` : '';
  return `${w.item.id}::${t}::${w.sortKey}${idPart}`;
}

function buildUniqueWatchMilestoneData(
  allWatches: { item: MovieShowItem; record: WatchRecord; sortKey: string; isMovie: boolean }[],
  username: string
): {
  badgeMap: Map<string, { n: number; tooltip: string }>;
  movieMilestones: { n: number; item: MovieShowItem; sortKey: string; record: WatchRecord; recordType: string; recordId?: string; dayOrder: number }[];
  showMilestones: { n: number; item: MovieShowItem; sortKey: string; record: WatchRecord; recordType: string; recordId?: string; dayOrder: number }[];
  totalMovies: number;
  totalShows: number;
} {
  // Milestones are based on UNIQUE titles ordered by first-ever watch.
  // Badge attachment must be on that exact first-watch event only.
  const firstMovieByTitle = new Map<string, { item: MovieShowItem; record: WatchRecord; sortKey: string; isMovie: boolean }>();
  const firstShowByTitle = new Map<string, { item: MovieShowItem; record: WatchRecord; sortKey: string; isMovie: boolean }>();

  for (const w of allWatches) {
    const firstMap = w.isMovie ? firstMovieByTitle : firstShowByTitle;
    const key = w.item.id;
    const firstExisting = firstMap.get(key);

    // Earliest by sortKey (then tie-break by id) -> first watch
    if (!firstExisting) {
      firstMap.set(key, w);
    } else if (compareChronologicalFirstWatchList(w, firstExisting) < 0) {
      firstMap.set(key, w);
    }

  }

  // Order titles by first-watch ascending (oldest -> newest)
  const firstMovieEntries = Array.from(firstMovieByTitle.values()).sort(compareChronologicalFirstWatchList);
  const firstShowEntries = Array.from(firstShowByTitle.values()).sort(compareChronologicalFirstWatchList);

  const totalMovies = firstMovieEntries.length;
  const totalShows = firstShowEntries.length;

  const badgeMap = new Map<string, { n: number; tooltip: string }>();
  const movieMilestones: { n: number; item: MovieShowItem; sortKey: string; record: WatchRecord; recordType: string; recordId?: string; dayOrder: number }[] = [];
  const showMilestones: { n: number; item: MovieShowItem; sortKey: string; record: WatchRecord; recordType: string; recordId?: string; dayOrder: number }[] = [];

  // Movies: n is "first watch index" (1-based) so rewatches tomorrow don't change n.
  for (let i = 0; i < firstMovieEntries.length; i++) {
    const first = firstMovieEntries[i];
    const n = i + 1;
    if (n % 50 !== 0) continue;
    badgeMap.set(watchEventKey(first), {
      n,
      tooltip: `${username}'s ${n}th movie watch`
    });
    movieMilestones.push({
      n,
      item: first.item,
      sortKey: first.sortKey,
      record: first.record,
      recordType: first.record.type ?? 'DATE',
      recordId: first.record.id,
      dayOrder: getWatchRecordDayOrder(first.record)
    });
  }

  // Shows: milestones every 25 unique titles by first-watch ordering.
  for (let i = 0; i < firstShowEntries.length; i++) {
    const first = firstShowEntries[i];
    const n = i + 1;
    if (n % 25 !== 0) continue;
    badgeMap.set(watchEventKey(first), {
      n,
      tooltip: `${username}'s ${n}th show watch`
    });
    showMilestones.push({
      n,
      item: first.item,
      sortKey: first.sortKey,
      record: first.record,
      recordType: first.record.type ?? 'DATE',
      recordId: first.record.id,
      dayOrder: getWatchRecordDayOrder(first.record)
    });
  }

  movieMilestones.sort((a, b) => a.n - b.n);
  showMilestones.sort((a, b) => a.n - b.n);

  return { badgeMap, movieMilestones, showMilestones, totalMovies, totalShows };
}

export function ProfilePage() {
  const navigate = useNavigate();
  const { username, user } = useAuth();
  const [rankingTarget, setRankingTarget] = useState<UniversalEditTarget | null>(null);
  const [isRankingSaving, setIsRankingSaving] = useState(false);
  const [personRankingTarget, setPersonRankingTarget] = useState<PersonRankingTarget | null>(null);
  const [isPersonRankingSaving, setIsPersonRankingSaving] = useState(false);

  const {
    byClass: moviesByClass,
    classOrder: movieClassOrder,
    isRankedClass: isRankedMovieClass,
    getClassLabel: getMovieClassLabel,
    getClassTagline: getMovieClassTagline,
    classes: movieClasses,
    globalRanks: moviesGlobalRanks,
    addMovieFromSearch,
    updateMovieWatchRecords,
    moveItemToClass: moveMovieToClass,
    removeMovieEntry,
  } = useMoviesStore();
  const {
    byClass: tvByClass,
    classOrder: tvClassOrder,
    isRankedClass: isRankedTvClass,
    getClassLabel: getTvClassLabel,
    getClassTagline: getTvClassTagline,
    classes: tvClasses,
    globalRanks: tvGlobalRanks,
    addTvShowFromSearch,
    updateTvShowWatchRecords,
    moveItemToClass: moveTvToClass,
    removeTvShowEntry,
  } = useTvStore();
  const watchlist = useWatchlistStore();
  const {
    byClass: peopleByClass,
    classOrder: peopleClassOrder,
    classes: peopleClasses,
    addPersonFromSearch,
    removePersonEntry
  } = usePeopleStore();
  const {
    byClass: directorsByClass,
    classOrder: directorsClassOrder,
    classes: directorsClasses,
    addDirectorFromSearch,
    removeDirectorEntry
  } = useDirectorsStore();
  
  const { addToWatchlist, removeFromWatchlist, isInWatchlist } = useWatchlistStore();
  const {
    getEditableListsForMediaType,
    setEntryListMembership,
    getSelectedListIdsForEntry,
    collectionIdsByEntryId,
    globalCollections,
    lists,
    listOrder,
    entriesByListId,
  } = useListsStore();

  const [recentRange, setRecentRange] = useState<ProfileRecentRange>('this_year');
  const [recentViewMode, setRecentViewMode] = useState<'tile' | 'chart'>('tile');
  const [showExpandedStats, setShowExpandedStats] = useState(false);
  const [profileLinkCopied, setProfileLinkCopied] = useState(false);
  const [chartMode, setChartMode] = useState<'count' | 'time'>('count');
  const [chartScope, setChartScope] = useState<'all' | 'this_year'>('all');
  const [scatterYAxisMode, setScatterYAxisMode] = useState<'rank' | 'release_year'>('rank');
  const [pruneScatterOutliers, setPruneScatterOutliers] = useState(false);
  const [showAvgRuntimeCharts, setShowAvgRuntimeCharts] = useState(false);
  const [showCopyTools, setShowCopyTools] = useState(false);
  const [showScatterplots, setShowScatterplots] = useState(false);
  const [movieViewMode, setMovieViewMode] = useState<ProfileMediaListMode>('top10');
  const [movieWatchYearFilter, setMovieWatchYearFilter] = useState<ProfileWatchYearFilter>('all');
  const [showViewMode, setShowViewMode] = useState<ProfileMediaListMode>('top10');
  const [showWatchYearFilter, setShowWatchYearFilter] = useState<ProfileWatchYearFilter>('all');
  const [showAllActorsWithClasses, setShowAllActorsWithClasses] = useState(false);
  const [showAllDirectorsWithClasses, setShowAllDirectorsWithClasses] = useState(false);

  // On your own profile, include "unranked-but-curated" classes in top lists,
  // but never include the literal UNRANKED bucket.
  const isTopListEligibleClassKey = useCallback(
    (classKey: string, isRankedFn: (k: string) => boolean) => {
      if (classKey === 'UNRANKED') return false;
      if (isRankedFn(classKey)) return true;
      return classKey === 'DELICIOUS_GARBAGE' || classKey === 'BABY' || classKey === 'DONT_REMEMBER';
    },
    []
  );

  const movieProfileClassKeys = useMemo(() => {
    const known = movieClassOrder;
    const fromData = Object.keys(moviesByClass ?? {});
    return Array.from(new Set([...known, ...fromData])).filter((k) => k !== 'UNRANKED');
  }, [movieClassOrder, moviesByClass]);

  const tvProfileClassKeys = useMemo(() => {
    const known = tvClassOrder;
    const fromData = Object.keys(tvByClass ?? {});
    return Array.from(new Set([...known, ...fromData])).filter((k) => k !== 'UNRANKED');
  }, [tvClassOrder, tvByClass]);

  const rankedMovies = useMemo(() => {
    const list: MovieShowItem[] = [];
    for (const k of movieProfileClassKeys) {
      for (const item of moviesByClass[k] ?? []) list.push(item);
    }
    return list;
  }, [moviesByClass, movieProfileClassKeys]);

  const rankedShows = useMemo(() => {
    const list: MovieShowItem[] = [];
    for (const k of tvProfileClassKeys) {
      for (const item of tvByClass[k] ?? []) list.push(item);
    }
    return list;
  }, [tvByClass, tvProfileClassKeys]);

  const strictRankedMovies = useMemo(() => {
    const list: MovieShowItem[] = [];
    for (const k of movieClassOrder) {
      if (!isRankedMovieClass(k)) continue;
      for (const item of moviesByClass[k] ?? []) list.push(item);
    }
    return list;
  }, [movieClassOrder, moviesByClass, isRankedMovieClass]);

  const strictRankedShows = useMemo(() => {
    const list: MovieShowItem[] = [];
    for (const k of tvClassOrder) {
      if (!isRankedTvClass(k)) continue;
      for (const item of tvByClass[k] ?? []) list.push(item);
    }
    return list;
  }, [tvClassOrder, tvByClass, isRankedTvClass]);

  const profileCopyMovieClassOrder = useMemo(
    () =>
      movieClassOrder.filter(
        (k) => movieProfileClassKeys.includes(k) && (moviesByClass[k]?.length ?? 0) > 0
      ),
    [movieClassOrder, movieProfileClassKeys, moviesByClass]
  );

  const profileCopyTvClassOrder = useMemo(
    () =>
      tvClassOrder.filter(
        (k) => tvProfileClassKeys.includes(k) && (tvByClass[k]?.length ?? 0) > 0
      ),
    [tvClassOrder, tvProfileClassKeys, tvByClass]
  );

  const profileCopyPeopleClassOrder = useMemo(
    () =>
      peopleClassOrder.filter((k) => k !== 'UNRANKED' && (peopleByClass[k]?.length ?? 0) > 0),
    [peopleClassOrder, peopleByClass]
  );

  const profileCopyDirectorsClassOrder = useMemo(
    () =>
      directorsClassOrder.filter((k) => k !== 'UNRANKED' && (directorsByClass[k]?.length ?? 0) > 0),
    [directorsClassOrder, directorsByClass]
  );

  const isPeopleClassRanked = useCallback(
    (k: string) => peopleClasses.find((c) => c.key === k)?.isRanked ?? false,
    [peopleClasses]
  );

  const isDirectorClassRanked = useCallback(
    (k: string) => directorsClasses.find((c) => c.key === k)?.isRanked ?? false,
    [directorsClasses]
  );

  const stats = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const inScope = (item: MovieShowItem) => {
      if (chartScope === 'all') return true;
      return (item.watchRecords ?? []).some((r) => r.year === currentYear && (r.type ?? 'DATE') !== 'DNF');
    };

    let totalMinutes = 0;
    let moviesMinutes = 0;
    let showsMinutes = 0;
    let episodesWatched = 0;
    let moviesSeen = 0;
    let showsSeen = 0;
    const movieReleaseYears: number[] = [];
    const showReleaseYears: number[] = [];

    let movieWatches = 0; // total movie watch count (incl. rewatches), excluding DNF
    for (const k of movieClassOrder) {
      for (const item of moviesByClass[k] ?? []) {
        const mins = getTotalMinutesFromRecords(item.watchRecords ?? [], item.runtimeMinutes);
        totalMinutes += mins;
        moviesMinutes += mins;
        movieWatches += (item.watchRecords ?? []).filter((r) => (r.type ?? 'DATE') !== 'DNF').length;
        if ((item.watchRecords?.length ?? 0) > 0) {
          moviesSeen += 1;
          const y = item.releaseDate ? parseInt(item.releaseDate.slice(0, 4), 10) : NaN;
          if (!Number.isNaN(y)) movieReleaseYears.push(y);
        }
      }
    }
    for (const k of tvClassOrder) {
      for (const item of tvByClass[k] ?? []) {
        const mins = getTotalMinutesFromRecords(item.watchRecords ?? [], item.runtimeMinutes);
        totalMinutes += mins;
        showsMinutes += mins;
        episodesWatched += getTotalEpisodesFromRecords(item.watchRecords ?? [], item.totalEpisodes);
        if ((item.watchRecords?.length ?? 0) > 0) {
          showsSeen += 1;
          const y = item.releaseDate ? parseInt(item.releaseDate.slice(0, 4), 10) : NaN;
          if (!Number.isNaN(y)) showReleaseYears.push(y);
        }
      }
    }

    // Calculate actors saved (only count if more than 0)
    let actorsSaved = 0;
    for (const k of peopleClassOrder) {
      actorsSaved += (peopleByClass[k] ?? []).length;
    }

    // Calculate directors saved (only count if more than 0)
    let directorsSaved = 0;
    for (const k of directorsClassOrder) {
      directorsSaved += (directorsByClass[k] ?? []).length;
    }

    // Calculate ranked category data for bar charts
    const movieRankedCategories = movieClassOrder
      .filter(k => isRankedMovieClass(k))
      .map(k => {
        const items = (moviesByClass[k] ?? []).filter(inScope);
        const watchTime = items.reduce((sum, item) => 
          sum + getTotalMinutesFromRecords(item.watchRecords ?? [], item.runtimeMinutes), 0
        );
        return {
          key: k,
          label: getMovieClassLabel(k),
          count: items.length,
          watchTime
        };
      });

    const tvRankedCategories = tvClassOrder
      .filter(k => isRankedTvClass(k))
      .map(k => {
        const items = (tvByClass[k] ?? []).filter(inScope);
        const watchTime = items.reduce((sum, item) => 
          sum + getTotalMinutesFromRecords(item.watchRecords ?? [], item.runtimeMinutes), 0
        );
        return {
          key: k,
          label: getTvClassLabel(k),
          count: items.length,
          watchTime
        };
      });

    // Calculate release year distribution
    const movieReleaseYearData: { year: number; count: number }[] = [];
    const movieYearCounts: Record<number, number> = {};
    for (const k of movieClassOrder) {
      for (const item of (moviesByClass[k] ?? []).filter(inScope)) {
        if (item.releaseDate) {
          const year = parseInt(item.releaseDate.slice(0, 4), 10);
          if (!Number.isNaN(year)) {
            movieYearCounts[year] = (movieYearCounts[year] || 0) + 1;
          }
        }
      }
    }
    Object.entries(movieYearCounts)
      .forEach(([year, count]) => {
        movieReleaseYearData.push({ year: parseInt(year), count });
      });
    movieReleaseYearData.sort((a, b) => a.year - b.year);

    const tvReleaseYearData: { year: number; count: number }[] = [];
    const tvYearCounts: Record<number, number> = {};
    for (const k of tvClassOrder) {
      for (const item of (tvByClass[k] ?? []).filter(inScope)) {
        if (item.releaseDate) {
          const year = parseInt(item.releaseDate.slice(0, 4), 10);
          if (!Number.isNaN(year)) {
            tvYearCounts[year] = (tvYearCounts[year] || 0) + 1;
          }
        }
      }
    }
    Object.entries(tvYearCounts)
      .forEach(([year, count]) => {
        tvReleaseYearData.push({ year: parseInt(year), count });
      });
    tvReleaseYearData.sort((a, b) => a.year - b.year);

    // Calculate watch count per year
    const movieWatchYearData: { year: number; count: number; watchTime: number }[] = [];
    const movieYearWatchCounts: Record<number, { count: number; watchTime: number }> = {};
    for (const k of movieClassOrder) {
      for (const item of moviesByClass[k] ?? []) {
        for (const record of item.watchRecords ?? []) {
          if (record.year && (record.type ?? 'DATE') !== 'DNF') {
            const year = record.year;
            if (!movieYearWatchCounts[year]) {
              movieYearWatchCounts[year] = { count: 0, watchTime: 0 };
            }
            movieYearWatchCounts[year].count += 1;
            movieYearWatchCounts[year].watchTime += getTotalMinutesFromRecords([record], item.runtimeMinutes);
          }
        }
      }
    }
    Object.entries(movieYearWatchCounts)
      .forEach(([year, data]) => {
        movieWatchYearData.push({ year: parseInt(year), count: data.count, watchTime: data.watchTime });
      });
    movieWatchYearData.sort((a, b) => a.year - b.year);

    const tvWatchYearData: { year: number; count: number; watchTime: number }[] = [];
    const tvYearWatchCounts: Record<number, { count: number; watchTime: number }> = {};
    for (const k of tvClassOrder) {
      for (const item of tvByClass[k] ?? []) {
        for (const record of item.watchRecords ?? []) {
          if (record.year && (record.type ?? 'DATE') !== 'DNF') {
            const year = record.year;
            if (!tvYearWatchCounts[year]) {
              tvYearWatchCounts[year] = { count: 0, watchTime: 0 };
            }
            tvYearWatchCounts[year].count += 1;
            tvYearWatchCounts[year].watchTime += getTotalMinutesFromRecords([record], item.runtimeMinutes);
          }
        }
      }
    }
    Object.entries(tvYearWatchCounts)
      .forEach(([year, data]) => {
        tvWatchYearData.push({ year: parseInt(year), count: data.count, watchTime: data.watchTime });
      });
    tvWatchYearData.sort((a, b) => a.year - b.year);

    // Calculate DNF and rewatch stats
    let movieTotalTitles = 0;
    let movieTotalWatches = 0;
    let movieDNFCount = 0;
    let movieRewatchCount = 0;
    for (const k of movieClassOrder) {
      for (const item of moviesByClass[k] ?? []) {
        movieTotalTitles += 1;
        const watches = item.watchRecords ?? [];
        movieTotalWatches += watches.length;
        movieDNFCount += watches.filter(r => (r.type ?? 'DATE') === 'DNF').length;
        if (watches.length > 1) {
          movieRewatchCount += 1;
        }
      }
    }

    let tvTotalTitles = 0;
    let tvTotalWatches = 0;
    let tvDNFCount = 0;
    let tvRewatchCount = 0;
    let tvWatchPercentTotal = 0;
    let tvWatchPercentCount = 0;
    for (const k of tvClassOrder) {
      for (const item of tvByClass[k] ?? []) {
        tvTotalTitles += 1;
        const watches = item.watchRecords ?? [];
        tvTotalWatches += watches.length;
        tvDNFCount += watches.filter(r => (r.type ?? 'DATE') === 'DNF').length;
        for (const watch of watches) {
          const watchType = watch.type ?? 'DATE';
          const percent = (watchType === 'DNF' || watchType === 'DNF_LONG_AGO' || watchType === 'CURRENT')
            ? Math.max(0, Math.min(100, watch.dnfPercent ?? 0))
            : 100;
          tvWatchPercentTotal += percent;
          tvWatchPercentCount += 1;
        }
        if (watches.length > 1) {
          tvRewatchCount += 1;
        }
      }
    }
    const tvAverageWatchPercent = tvWatchPercentCount > 0
      ? Math.round((tvWatchPercentTotal / tvWatchPercentCount) * 10) / 10
      : 0;

    const avg = (arr: number[]) =>
      arr.length === 0 ? null : Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
    const avgMovie = avg(movieReleaseYears);
    const avgShow = avg(showReleaseYears);
    const avgBoth =
      movieReleaseYears.length + showReleaseYears.length === 0
        ? null
        : Math.round(
          [...movieReleaseYears, ...showReleaseYears].reduce((a, b) => a + b, 0) /
          (movieReleaseYears.length + showReleaseYears.length)
        );

    // Calculate average watchtime per movie and show (including rewatches)
    let totalMovieWatches = 0;
    let totalShowWatches = 0;
    for (const k of movieClassOrder) {
      for (const item of moviesByClass[k] ?? []) {
        totalMovieWatches += (item.watchRecords ?? []).filter((r) => (r.type ?? 'DATE') !== 'DNF').length;
      }
    }
    for (const k of tvClassOrder) {
      for (const item of tvByClass[k] ?? []) {
        totalShowWatches += (item.watchRecords ?? []).filter((r) => (r.type ?? 'DATE') !== 'DNF').length;
      }
    }

    const avgWatchtimePerMovie = totalMovieWatches > 0 ? Math.round(moviesMinutes / totalMovieWatches) : 0;
    const avgWatchtimePerShow = totalShowWatches > 0 ? Math.round(showsMinutes / totalShowWatches) : 0;

    // Calculate average runtime per ranked category for movies
    const movieAvgRuntimeByCategory = movieClassOrder
      .filter(k => isRankedMovieClass(k))
      .map(k => {
        const items = moviesByClass[k] ?? [];
        const runtimes = items
          .filter(item => item.runtimeMinutes && item.runtimeMinutes > 0)
          .map(item => item.runtimeMinutes!);
        const avgRuntime = runtimes.length > 0 ? Math.round(runtimes.reduce((a, b) => a + b, 0) / runtimes.length) : 0;
        return {
          key: k,
          label: getMovieClassLabel(k),
          avgRuntime,
          count: items.length
        };
      });

    // Calculate average runtime per ranked category for shows
    const showAvgRuntimeByCategory = tvClassOrder
      .filter(k => isRankedTvClass(k))
      .map(k => {
        const items = tvByClass[k] ?? [];
        const runtimes = items
          .filter(item => item.runtimeMinutes && item.runtimeMinutes > 0)
          .map(item => item.runtimeMinutes!);
        const avgRuntime = runtimes.length > 0 ? Math.round(runtimes.reduce((a, b) => a + b, 0) / runtimes.length) : 0;
        return {
          key: k,
          label: getTvClassLabel(k),
          avgRuntime,
          count: items.length
        };
      });

    const parseAbsoluteRankValue = (value?: string): number | null => {
      if (!value) return null;
      const match = value.match(/^(\d+)\s*\/\s*\d+$/);
      if (!match) return null;
      const rank = Number(match[1]);
      return Number.isFinite(rank) && rank > 0 ? rank : null;
    };
    const parseReleaseYear = (value?: string): number | null => {
      if (!value || value.length < 4) return null;
      const year = Number(value.slice(0, 4));
      return Number.isFinite(year) && year > 1800 ? year : null;
    };

    // Runtime vs absolute rank scatter data for ranked movies and shows.
    // Rank is derived from ranked list order to avoid relying on stale/missing absoluteRank values.
    const rankedMovieClassKeys = movieClassOrder.filter(k => isRankedMovieClass(k));
    const rankedShowClassKeys = tvClassOrder.filter(k => isRankedTvClass(k));
    const movieClassColorMap = new Map(
      rankedMovieClassKeys.map((classKey, index) => [classKey, SCATTER_CLASS_COLORS[index % SCATTER_CLASS_COLORS.length]])
    );
    const showClassColorMap = new Map(
      rankedShowClassKeys.map((classKey, index) => [classKey, SCATTER_CLASS_COLORS[index % SCATTER_CLASS_COLORS.length]])
    );

    const rankedMovieItems = rankedMovieClassKeys
      .flatMap(classKey => (moviesByClass[classKey] ?? []).map(item => ({ item, classKey })));
    const rankedShowItems = rankedShowClassKeys
      .flatMap(classKey => (tvByClass[classKey] ?? []).map(item => ({ item, classKey })));

    const movieRuntimeVsRankData = rankedMovieItems
      .map(({ item, classKey }, index) => {
        const runtime = item.runtimeMinutes ?? 0;
        if (runtime <= 0) return null;
        const computedRank = index + 1;
        const rank = parseAbsoluteRankValue(item.absoluteRank) ?? computedRank;
        return {
          title: item.title,
          classKey,
          classLabel: getMovieClassLabel(classKey),
          color: movieClassColorMap.get(classKey) ?? 'var(--accent-soft)',
          runtime,
          rank,
          releaseYear: parseReleaseYear(item.releaseDate),
          absoluteRank: item.absoluteRank && item.absoluteRank !== '—'
            ? item.absoluteRank
            : `${computedRank} / ${rankedMovieItems.length}`,
        };
      })
      .filter((item): item is { title: string; classKey: string; classLabel: string; color: string; runtime: number; rank: number; releaseYear: number | null; absoluteRank: string } => item !== null);

    const showRuntimeVsRankData = rankedShowItems
      .map(({ item, classKey }, index) => {
        const runtime = item.runtimeMinutes ?? 0;
        if (runtime <= 0) return null;
        const computedRank = index + 1;
        const rank = parseAbsoluteRankValue(item.absoluteRank) ?? computedRank;
        return {
          title: item.title,
          classKey,
          classLabel: getTvClassLabel(classKey),
          color: showClassColorMap.get(classKey) ?? 'var(--accent-soft)',
          runtime,
          rank,
          releaseYear: parseReleaseYear(item.releaseDate),
          absoluteRank: item.absoluteRank && item.absoluteRank !== '—'
            ? item.absoluteRank
            : `${computedRank} / ${rankedShowItems.length}`,
        };
      })
      .filter((item): item is { title: string; classKey: string; classLabel: string; color: string; runtime: number; rank: number; releaseYear: number | null; absoluteRank: string } => item !== null);

    // Calculate genre distribution
    const movieGenreCounts: Record<string, number> = {};
    for (const k of movieClassOrder) {
      for (const item of (moviesByClass[k] ?? []).filter(inScope)) {
        if (item.genres) {
          item.genres.forEach(g => {
            movieGenreCounts[g] = (movieGenreCounts[g] || 0) + 1;
          });
        }
      }
    }
    const movieGenreData = Object.entries(movieGenreCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    const tvGenreCounts: Record<string, number> = {};
    for (const k of tvClassOrder) {
      for (const item of (tvByClass[k] ?? []).filter(inScope)) {
        if (item.genres) {
          item.genres.forEach(g => {
            tvGenreCounts[g] = (tvGenreCounts[g] || 0) + 1;
          });
        }
      }
    }
    const tvGenreData = Object.entries(tvGenreCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    return {
      totalMinutes,
      moviesMinutes,
      showsMinutes,
      episodesWatched,
      movieWatches,
      moviesSeen,
      showsSeen,
      actorsSaved,
      directorsSaved,
      movieRankedCategories,
      tvRankedCategories,
      movieReleaseYearData,
      tvReleaseYearData,
      movieWatchYearData,
      tvWatchYearData,
      avgRewatchCount: movieRewatchCount, // placeholder name fix if needed
      movieTotalTitles,
      movieTotalWatches,
      movieDNFCount,
      movieRewatchCount,
      tvTotalTitles,
      tvTotalWatches,
      tvDNFCount,
      tvRewatchCount,
      tvAverageWatchPercent,
      avgWatchtimePerMovie,
      avgWatchtimePerShow,
      movieAvgRuntimeByCategory,
      showAvgRuntimeByCategory,
      movieRuntimeVsRankData,
      showRuntimeVsRankData,
      movieGenreData,
      tvGenreData
    };
  }, [moviesByClass, tvByClass, movieClassOrder, tvClassOrder, peopleByClass, peopleClassOrder, directorsByClass, directorsClassOrder, isRankedMovieClass, isRankedTvClass, chartScope]);

  const seenMovieIds = useMemo(() => {
    const ids = new Set<string>();
    for (const classKey of movieClassOrder) {
      for (const item of moviesByClass[classKey] ?? []) {
        if ((item.watchRecords?.length ?? 0) > 0) ids.add(item.id);
      }
    }
    return ids;
  }, [moviesByClass, movieClassOrder]);

  const seenShowIds = useMemo(() => {
    const ids = new Set<string>();
    for (const classKey of tvClassOrder) {
      for (const item of tvByClass[classKey] ?? []) {
        if ((item.watchRecords?.length ?? 0) > 0) ids.add(item.id);
      }
    }
    return ids;
  }, [tvByClass, tvClassOrder]);

  const globalCollectionProgress = useMemo(() => {
    return globalCollections
      .filter((collection) => !collection.hidden)
      .map((collection) => {
        const uniqueEntryIds = Array.from(
          new Set(collection.entries.map((entry) => `tmdb-${entry.mediaType}-${entry.tmdbId}`))
        );
        const total = uniqueEntryIds.length;
        let seen = 0;
        let watchlistUnseen = 0;
        for (const entryId of uniqueEntryIds) {
          const isMovieEntry = entryId.startsWith('tmdb-movie-');
          const isSeen = isMovieEntry ? seenMovieIds.has(entryId) : seenShowIds.has(entryId);
          if (isSeen) seen += 1;
          else if (isInWatchlist(entryId)) watchlistUnseen += 1;
        }
        return {
          id: collection.id,
          name: PROFILE_COLLECTION_LABEL_OVERRIDES[collection.name] ?? collection.name,
          seen,
          watchlistUnseen,
          total,
          href: `/lists/collection/${collection.id}`,
        };
      })
      .filter((item) => item.total > 0);
  }, [globalCollections, seenMovieIds, seenShowIds, isInWatchlist]);

  const customCollectionProgress = useMemo(() => {
    return listOrder
      .map((id) => lists.find((list) => list.id === id))
      .filter((list): list is NonNullable<typeof list> => Boolean(list))
      .filter((list) => list.mode === 'collection' && !list.hidden)
      .map((collection) => {
        const uniqueEntryIds = Array.from(
          new Set((entriesByListId[collection.id] ?? []).map((entry) => entry.entryId))
        ).filter((id) => id.startsWith('tmdb-movie-') || id.startsWith('tmdb-tv-'));
        const total = uniqueEntryIds.length;
        let seen = 0;
        let watchlistUnseen = 0;
        for (const entryId of uniqueEntryIds) {
          const isMovieEntry = entryId.startsWith('tmdb-movie-');
          const isSeen = isMovieEntry ? seenMovieIds.has(entryId) : seenShowIds.has(entryId);
          if (isSeen) seen += 1;
          else if (isInWatchlist(entryId)) watchlistUnseen += 1;
        }
        return {
          id: collection.id,
          name: collection.name,
          seen,
          watchlistUnseen,
          total,
          href: `/lists/${collection.id}`,
        };
      })
      .filter((item) => item.total > 0);
  }, [listOrder, lists, entriesByListId, seenMovieIds, seenShowIds, isInWatchlist]);

  const posterByEntryId = useMemo(() => {
    const map = new Map<string, string>();
    for (const classKey of movieClassOrder) {
      for (const item of moviesByClass[classKey] ?? []) {
        if (!item.posterPath) continue;
        map.set(String(item.id), item.posterPath);
      }
    }
    for (const classKey of tvClassOrder) {
      for (const item of tvByClass[classKey] ?? []) {
        if (!item.posterPath) continue;
        map.set(String(item.id), item.posterPath);
      }
    }
    return map;
  }, [movieClassOrder, moviesByClass, tvClassOrder, tvByClass]);

  const listProgress = useMemo(() => {
    return listOrder
      .map((id) => lists.find((list) => list.id === id))
      .filter((list): list is NonNullable<typeof list> => Boolean(list))
      .filter((list) => list.mode === 'list' && !list.hidden)
      .map((list) => {
        const entries = (entriesByListId[list.id] ?? []).filter((entry) => {
          const entryId = String(entry.entryId ?? '');
          return entryId.startsWith('tmdb-movie-') || entryId.startsWith('tmdb-tv-');
        });
        const posterPaths = entries
          .slice()
          .sort((a, b) => {
            const aKey = stableHash(`${list.id}:${String(a.entryId ?? '')}`);
            const bKey = stableHash(`${list.id}:${String(b.entryId ?? '')}`);
            return aKey - bKey;
          })
          .map((entry) => posterByEntryId.get(String(entry.entryId ?? '')))
          .filter((posterPath): posterPath is string => Boolean(posterPath))
          .slice(0, 6);
        return {
          id: list.id,
          name: list.name,
          href: `/lists/${list.id}`,
          count: entries.length,
          mediaType: list.mediaType,
          posterPaths,
        };
      })
      .filter((item) => item.count > 0);
  }, [listOrder, lists, entriesByListId, posterByEntryId]);

  const getQuantile = (sortedValues: number[], percentile: number) => {
    if (sortedValues.length === 0) return null;
    const index = (sortedValues.length - 1) * percentile;
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    if (lower === upper) return sortedValues[lower];
    const weight = index - lower;
    return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
  };

  type ScatterPointBase = { runtime: number; rank: number; releaseYear: number | null };

  const filterScatterOutliers = useCallback(
    <T extends ScatterPointBase>(
      points: T[],
      xKey: 'runtime' | 'releaseYear',
      yKey: 'rank' | 'releaseYear'
    ): T[] => {
      if (!pruneScatterOutliers || points.length < 4) return points;
      const yValues = points.map((p) => p[yKey]).filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
      const xValues = points.map((p) => p[xKey]).filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
      if (yValues.length < 4 || xValues.length < 4) return points;

      const sortedX = [...xValues].sort((a, b) => a - b);
      const sortedY = [...yValues].sort((a, b) => a - b);
      const q1x = getQuantile(sortedX, 0.25);
      const q3x = getQuantile(sortedX, 0.75);
      const q1y = getQuantile(sortedY, 0.25);
      const q3y = getQuantile(sortedY, 0.75);
      if (q1x == null || q3x == null || q1y == null || q3y == null) return points;

      const iqrX = q3x - q1x;
      const iqrY = q3y - q1y;
      const minX = q1x - 1.5 * iqrX;
      const maxX = q3x + 1.5 * iqrX;
      const minY = q1y - 1.5 * iqrY;
      const maxY = q3y + 1.5 * iqrY;

      return points.filter((point) => {
        const y = point[yKey];
        const x = point[xKey];
        if (typeof y !== 'number' || typeof x !== 'number') return false;
        return x >= minX && x <= maxX && y >= minY && y <= maxY;
      });
    },
    [pruneScatterOutliers]
  );

  const movieScatterData = useMemo(() => {
    if (!showScatterplots) return [];
    const base =
      scatterYAxisMode === 'release_year'
        ? stats.movieRuntimeVsRankData.filter((p) => typeof p.releaseYear === 'number')
        : stats.movieRuntimeVsRankData;
    return filterScatterOutliers(base, 'runtime', scatterYAxisMode === 'rank' ? 'rank' : 'releaseYear');
  }, [showScatterplots, stats.movieRuntimeVsRankData, scatterYAxisMode, filterScatterOutliers]);

  const showScatterData = useMemo(() => {
    if (!showScatterplots) return [];
    const base =
      scatterYAxisMode === 'release_year'
        ? stats.showRuntimeVsRankData.filter((p) => typeof p.releaseYear === 'number')
        : stats.showRuntimeVsRankData;
    return filterScatterOutliers(base, 'runtime', scatterYAxisMode === 'rank' ? 'rank' : 'releaseYear');
  }, [showScatterplots, stats.showRuntimeVsRankData, scatterYAxisMode, filterScatterOutliers]);

  const movieRankByReleaseData = useMemo(() => {
    if (!showScatterplots) return [];
    const base = stats.movieRuntimeVsRankData.filter((p) => typeof p.releaseYear === 'number');
    return filterScatterOutliers(base, 'releaseYear', 'rank');
  }, [showScatterplots, stats.movieRuntimeVsRankData, filterScatterOutliers]);

  const showRankByReleaseData = useMemo(() => {
    if (!showScatterplots) return [];
    const base = stats.showRuntimeVsRankData.filter((p) => typeof p.releaseYear === 'number');
    return filterScatterOutliers(base, 'releaseYear', 'rank');
  }, [showScatterplots, stats.showRuntimeVsRankData, filterScatterOutliers]);

  const getReleaseYearDomain = (points: Array<{ releaseYear: number | null }>): [number, number] | undefined => {
    const years = points.map((p) => p.releaseYear).filter((y): y is number => typeof y === 'number' && Number.isFinite(y));
    if (years.length === 0) return undefined;
    const minYear = Math.min(...years);
    const maxYear = Math.max(...years);
    if (minYear === maxYear) return [minYear - 1, maxYear + 1];
    return [minYear, maxYear];
  };

  const movieReleaseYearDomain = useMemo(() => getReleaseYearDomain(movieScatterData), [movieScatterData]);
  const showReleaseYearDomain = useMemo(() => getReleaseYearDomain(showScatterData), [showScatterData]);
  const movieRankByReleaseYearDomain = useMemo(() => getReleaseYearDomain(movieRankByReleaseData), [movieRankByReleaseData]);
  const showRankByReleaseYearDomain = useMemo(() => getReleaseYearDomain(showRankByReleaseData), [showRankByReleaseData]);

  const allRecentWatches = useMemo(() => {
    // Use the same "all classes except UNRANKED" behavior as the profile views,
    // so Recently watched + milestones include unranked buckets too.
    const all = getRecentWatches(moviesByClass, tvByClass, movieProfileClassKeys, tvProfileClassKeys);
    return all;
  }, [moviesByClass, tvByClass, movieProfileClassKeys, tvProfileClassKeys]);

  const allWatchesForMilestones = useMemo(() => {
    // Includes LONG_AGO/UNKNOWN so milestone numbering matches Quick stats.
    return getAllWatches(moviesByClass, tvByClass, movieProfileClassKeys, tvProfileClassKeys);
  }, [moviesByClass, tvByClass, movieProfileClassKeys, tvProfileClassKeys]);

  const recentWatches = useMemo(() => {
    if (recentRange === 'milestones') return allRecentWatches;
    const range = getDateRangeFilter(recentRange);
    if (!range) return allRecentWatches;
    return allRecentWatches.filter((w) => w.sortKey >= range.min && w.sortKey <= range.max);
  }, [allRecentWatches, recentRange]);

  const milestoneData = useMemo(() => {
    const name = username ?? 'You';
    return buildUniqueWatchMilestoneData(allWatchesForMilestones, name);
  }, [allWatchesForMilestones, username]);

  const uniqueWatchMilestones = milestoneData.badgeMap;
  const allMilestoneEvents = useMemo(() => {
    const movieRows = milestoneData.movieMilestones.map((m) => ({
      item: m.item,
      sortKey: m.sortKey,
      record: m.record,
      n: m.n,
      isMovie: true as const,
      recordType: m.recordType,
      recordId: m.recordId,
      dayOrder: m.dayOrder
    }));
    const showRows = milestoneData.showMilestones.map((m) => ({
      item: m.item,
      sortKey: m.sortKey,
      record: m.record,
      n: m.n,
      isMovie: false as const,
      recordType: m.recordType,
      recordId: m.recordId,
      dayOrder: m.dayOrder
    }));
    return [...movieRows, ...showRows].sort((a, b) => {
      if (a.isMovie !== b.isMovie) return a.isMovie ? -1 : 1;
      if (a.n !== b.n) return b.n - a.n;
      const sk = b.sortKey.localeCompare(a.sortKey);
      if (sk !== 0) return sk;
      return (b.dayOrder ?? 0) - (a.dayOrder ?? 0);
    });
  }, [milestoneData.movieMilestones, milestoneData.showMilestones]);

  const getUserMovieStatus = useCallback((tmdbId: number): { isRanked: boolean; classKey?: string; watchRecords?: WatchRecord[] } => {
    if (!tmdbId) return { isRanked: false };
    for (const classKey of movieClassOrder) {
      const items = moviesByClass[classKey] ?? [];
      const found = items.find(item => item.tmdbId === tmdbId || item.id === `movie-${tmdbId}`);
      if (found) {
        const isRankedClass = isRankedMovieClass(classKey);
        return { isRanked: isRankedClass, classKey, watchRecords: found.watchRecords };
      }
    }
    return { isRanked: false };
  }, [moviesByClass, movieClassOrder, isRankedMovieClass]);

  // Helper to check if current user has a show ranked
  const getUserShowStatus = useCallback((tmdbId: number): { isRanked: boolean; classKey?: string; watchRecords?: WatchRecord[] } => {
    if (!tmdbId) return { isRanked: false };
    for (const classKey of tvClassOrder) {
      const items = tvByClass[classKey] ?? [];
      const found = items.find(item => item.tmdbId === tmdbId || item.id === `tv-${tmdbId}`);
      if (found) {
        const isRankedClass = isRankedTvClass(classKey);
        return { isRanked: isRankedClass, classKey, watchRecords: found.watchRecords };
      }
    }
    return { isRanked: false };
  }, [tvByClass, tvClassOrder, isRankedTvClass]);

  const watchlistEntryHasBeenWatched = useCallback(
    (entry: { id: string }, media: 'movies' | 'shows') => {
      const tmdbId =
        entry.id.includes('-')
          ? parseInt(entry.id.split('-').pop() || '0', 10)
          : parseInt(entry.id.replace(/\D/g, ''), 10) || 0;
      const recs =
        media === 'movies'
          ? getUserMovieStatus(tmdbId).watchRecords
          : getUserShowStatus(tmdbId).watchRecords;
      return (recs?.length ?? 0) > 0;
    },
    [getUserMovieStatus, getUserShowStatus]
  );

  // Helper to check if current user has an actor ranked
  const getUserActorStatus = useCallback((tmdbId: number): { isRanked: boolean; classKey?: string } => {
    if (!tmdbId) return { isRanked: false };
    for (const classKey of peopleClassOrder) {
      const items = peopleByClass[classKey] ?? [];
      const found = items.find(item => item.tmdbId === tmdbId || item.id === `person-${tmdbId}`);
      if (found) {
        return { isRanked: true, classKey };
      }
    }
    return { isRanked: false };
  }, [peopleByClass, peopleClassOrder]);

  // Helper to check if current user has a director ranked
  const getUserDirectorStatus = useCallback((tmdbId: number): { isRanked: boolean; classKey?: string } => {
    if (!tmdbId) return { isRanked: false };
    for (const classKey of directorsClassOrder) {
      const items = directorsByClass[classKey] ?? [];
      const found = items.find(item => item.tmdbId === tmdbId || item.id === `director-${tmdbId}`);
      if (found) {
        return { isRanked: true, classKey };
      }
    }
    return { isRanked: false };
  }, [directorsByClass, directorsClassOrder]);

  // Create top 5 actors and directors
  const rankedActors = useMemo(() => {
    const list: PersonItem[] = [];
    for (const k of peopleClassOrder) {
      const classDef = peopleClasses.find(c => c.key === k);
      if (classDef?.isRanked) {
        for (const item of peopleByClass[k] ?? []) list.push(item);
      }
    }
    return list;
  }, [peopleByClass, peopleClassOrder, peopleClasses]);

  const rankedDirectors = useMemo(() => {
    const list: DirectorItem[] = [];
    for (const k of directorsClassOrder) {
      const classDef = directorsClasses.find(c => c.key === k);
      if (classDef?.isRanked) {
        for (const item of directorsByClass[k] ?? []) list.push(item);
      }
    }
    return list;
  }, [directorsByClass, directorsClassOrder, directorsClasses]);

  const top5Actors = useMemo(() => {
    return rankedActors.slice(0, 5);
  }, [rankedActors]);

  const top5Directors = useMemo(() => {
    return rankedDirectors.slice(0, 5);
  }, [rankedDirectors]);

  // Create top 10 movies and shows (only ranked items)
  const top10Movies = useMemo(() => {
    const list: MovieShowItem[] = [];
    for (const k of movieProfileClassKeys) {
      for (const item of moviesByClass[k] ?? []) list.push(item);
    }
    return list.slice(0, 10);
  }, [moviesByClass, movieProfileClassKeys]);

  const top10Shows = useMemo(() => {
    const list: MovieShowItem[] = [];
    for (const k of tvProfileClassKeys) {
      for (const item of tvByClass[k] ?? []) list.push(item);
    }
    return list.slice(0, 10);
  }, [tvByClass, tvProfileClassKeys]);

  const top30MostSeenMovies = useMemo(() => {
    const list: Array<{ item: MovieShowItem; watchCount: number }> = [];
    for (const k of movieProfileClassKeys) {
      for (const item of moviesByClass[k] ?? []) {
        list.push({ item, watchCount: item.watchRecords?.length ?? 0 });
      }
    }
    return list
      .filter((entry) => entry.watchCount > 0)
      .sort((a, b) => b.watchCount - a.watchCount)
      .slice(0, 30);
  }, [moviesByClass, movieProfileClassKeys]);

  const top30MostSeenShows = useMemo(() => {
    const list: Array<{ item: MovieShowItem; watchCount: number }> = [];
    for (const k of tvProfileClassKeys) {
      for (const item of tvByClass[k] ?? []) {
        list.push({ item, watchCount: item.watchRecords?.length ?? 0 });
      }
    }
    return list
      .filter((entry) => entry.watchCount > 0)
      .sort((a, b) => b.watchCount - a.watchCount)
      .slice(0, 30);
  }, [tvByClass, tvProfileClassKeys]);

  const top30MostSeenMoviesByTier = useMemo(() => {
    const tiers = new Map<number, Array<{ item: MovieShowItem; watchCount: number }>>();
    for (const entry of top30MostSeenMovies) {
      const list = tiers.get(entry.watchCount) ?? [];
      list.push(entry);
      tiers.set(entry.watchCount, list);
    }
    return Array.from(tiers.entries())
      .sort((a, b) => b[0] - a[0])
      .map(([watchCount, items]) => ({ watchCount, items }));
  }, [top30MostSeenMovies]);

  const top30MostSeenShowsByTier = useMemo(() => {
    const tiers = new Map<number, Array<{ item: MovieShowItem; watchCount: number }>>();
    for (const entry of top30MostSeenShows) {
      const list = tiers.get(entry.watchCount) ?? [];
      list.push(entry);
      tiers.set(entry.watchCount, list);
    }
    return Array.from(tiers.entries())
      .sort((a, b) => b[0] - a[0])
      .map(([watchCount, items]) => ({ watchCount, items }));
  }, [top30MostSeenShows]);
  
  const topMoviesByYear = useMemo(() => buildTopFiveByYear(rankedMovies), [rankedMovies]);
  const topShowsByYear = useMemo(() => buildTopFiveByYear(rankedShows), [rankedShows]);
  const bottomMoviesByYear = useMemo(() => buildBottomFiveByYear(strictRankedMovies), [strictRankedMovies]);
  const bottomShowsByYear = useMemo(() => buildBottomFiveByYear(strictRankedShows), [strictRankedShows]);
  const topMoviesByWatchYear = useMemo(
    () => buildTopTenByWatchYear(rankedMovies, movieWatchYearFilter),
    [rankedMovies, movieWatchYearFilter]
  );
  const bottomMoviesByWatchYear = useMemo(
    () => buildBottomTenByWatchYear(strictRankedMovies, movieWatchYearFilter),
    [strictRankedMovies, movieWatchYearFilter]
  );
  const topShowsByWatchYear = useMemo(
    () => buildTopTenByWatchYear(rankedShows, showWatchYearFilter),
    [rankedShows, showWatchYearFilter]
  );
  const bottomShowsByWatchYear = useMemo(
    () => buildBottomTenByWatchYear(strictRankedShows, showWatchYearFilter),
    [strictRankedShows, showWatchYearFilter]
  );

  const getMoviePosterSrc = useCallback(
    (item: MovieShowItem) =>
      getMovieImageSrc(item.posterPath, item.title, item.tmdbId) ??
      tmdbImagePath(item.posterPath) ??
      null,
    []
  );

  const getPercentileBadge = useCallback(
    (item: MovieShowItem, isMovie: boolean, classKey?: string, isRanked?: boolean) => {
      if (isRanked) {
        const globalRanks = isMovie ? moviesGlobalRanks : tvGlobalRanks;
        return globalRanks.get(item.id)?.percentileRank ?? null;
      }
      if (classKey === 'DELICIOUS_GARBAGE') return 'GARB';
      if (classKey === 'BABY') return 'BABY';
      return 'N/A';
    },
    [moviesGlobalRanks, tvGlobalRanks]
  );

  const hasActors = top5Actors.length > 0;
  const hasDirectors = top5Directors.length > 0;

  // Handle clicking a top 10 movie
  const handleMovieClick = (movie: MovieShowItem) => {
    const tmdbId = (movie.tmdbId ?? parseInt(movie.id.replace(/\D/g, ''), 10)) || 0;
    const status = getUserMovieStatus(tmdbId);
    const target: UniversalEditTarget = {
      id: movie.id,
      tmdbId,
      title: movie.title,
      posterPath: movie.posterPath,
      mediaType: 'movie',
      subtitle: movie.releaseDate ? String(movie.releaseDate.slice(0, 4)) : undefined,
      releaseDate: movie.releaseDate,
      runtimeMinutes: movie.runtimeMinutes,
      existingClassKey: status.classKey,
      watchlistStatus: 'not_in_watchlist',
    };
    setRankingTarget(target);
  };

  // Handle clicking a top 10 show
  const handleShowClick = (show: MovieShowItem) => {
    const tmdbId = (show.tmdbId ?? parseInt(show.id.replace(/\D/g, ''), 10)) || 0;
    const status = getUserShowStatus(tmdbId);
    const target: UniversalEditTarget = {
      id: show.id,
      tmdbId,
      title: show.title,
      posterPath: show.posterPath,
      mediaType: 'tv',
      subtitle: show.releaseDate ? String(show.releaseDate.slice(0, 4)) : undefined,
      releaseDate: show.releaseDate,
      runtimeMinutes: show.runtimeMinutes,
      totalEpisodes: show.totalEpisodes,
      totalSeasons: show.totalSeasons,
      existingClassKey: status.classKey,
      watchlistStatus: 'not_in_watchlist',
    };
    setRankingTarget(target);
  };

  // Handle clicking a top 5 actor
  const handleActorClick = (actor: PersonItem) => {
    const tmdbId = (actor.tmdbId ?? parseInt(actor.id.replace(/\D/g, ''), 10)) || 0;
    const status = getUserActorStatus(tmdbId);
    const target: PersonRankingTarget = {
      id: actor.id,
      tmdbId,
      name: actor.title,
      profilePath: actor.profilePath,
      mediaType: 'actor',
      existingClassKey: status.classKey,
    };
    setPersonRankingTarget(target);
  };

  // Handle clicking a top 5 director
  const handleDirectorClick = (director: DirectorItem) => {
    const tmdbId = (director.tmdbId ?? parseInt(director.id.replace(/\D/g, ''), 10)) || 0;
    const status = getUserDirectorStatus(tmdbId);
    const target: PersonRankingTarget = {
      id: director.id,
      tmdbId,
      name: director.title,
      profilePath: director.profilePath,
      mediaType: 'director',
      existingClassKey: status.classKey,
    };
    setPersonRankingTarget(target);
  };

  // Handle saving from the person ranking modal
  const handlePersonRankingSave = async (params: PersonRankingSaveParams, goToList: boolean) => {
    if (!personRankingTarget) return;
    setIsPersonRankingSaving(true);
    try {
      if (personRankingTarget.mediaType === 'actor') {
        if (params.classKey) {
          addPersonFromSearch({
            id: personRankingTarget.id,
            title: personRankingTarget.name,
            profilePath: personRankingTarget.profilePath,
            classKey: params.classKey,
            position: params.position ?? 'top'
          });
        }
      } else if (personRankingTarget.mediaType === 'director') {
        if (params.classKey) {
          addDirectorFromSearch({
            id: personRankingTarget.id,
            title: personRankingTarget.name,
            profilePath: personRankingTarget.profilePath,
            classKey: params.classKey,
            position: params.position ?? 'top'
          });
        }
      }
      
      setPersonRankingTarget(null);
      if (goToList) {
        // Navigate without page reload and scroll to the specific entry
        const targetUrl = personRankingTarget.mediaType === 'actor' ? '/actors' : '/directors';
        const entryId = personRankingTarget.id;
        
        window.history.pushState({}, '', targetUrl);
        window.dispatchEvent(new PopStateEvent('popstate'));
        
        // Wait a bit for the page to render, then scroll to the entry
        setTimeout(() => {
          const element = document.getElementById(`entry-${entryId}`);
          if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            // Add a highlight effect
            element.classList.add('highlighted-entry');
            setTimeout(() => {
              element.classList.remove('highlighted-entry');
            }, 2000);
          } else {
            // Fallback to top if entry not found
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }
        }, 100);
      }
    } catch (err) {
      console.error('Failed to save person ranking:', err);
    } finally {
      setIsPersonRankingSaving(false);
    }
  };

  // Handle removing person entry
  const handleRemovePersonEntry = (itemId: string) => {
    if (personRankingTarget?.mediaType === 'actor') {
      removePersonEntry(itemId);
    } else if (personRankingTarget?.mediaType === 'director') {
      removeDirectorEntry(itemId);
    }
    setPersonRankingTarget(null);
  };
  const handleRankingSave = async (params: any, goToMedia: boolean) => {
    if (!rankingTarget) return;
    setIsRankingSaving(true);
    try {
      const tmdbId = (rankingTarget.tmdbId ?? parseInt(rankingTarget.id.replace(/\D/g, ''), 10)) || 0;

      const records = prepareWatchRecordsForSave(
        watchMatrixEntriesToWatchRecords(params.watches),
        rankingTarget.id,
        moviesByClass,
        tvByClass,
        movieClassOrder,
        tvClassOrder
      );

      if (rankingTarget.mediaType === 'movie') {
        const status = getUserMovieStatus(tmdbId);

        if (status.isRanked && rankingTarget.id) {
          // Update existing
          await updateMovieWatchRecords(rankingTarget.id, records);
          
          // Move class if needed
          if (params.classKey && params.classKey !== status.classKey) {
            await moveMovieToClass(rankingTarget.id, params.classKey, {
              toTop: params.position === 'top',
              toMiddle: params.position === 'middle',
            });
          }
        } else {
          // Add new from search
          await addMovieFromSearch({
            id: rankingTarget.id,
            title: rankingTarget.title,
            posterPath: rankingTarget.posterPath,
            classKey: params.classKey || 'UNRANKED',
            toTop: params.position === 'top',
            toMiddle: params.position === 'middle',
          });
          // Add watches after adding
          if (records.length > 0 && rankingTarget.id) {
            await updateMovieWatchRecords(rankingTarget.id, records);
          }
        }
      } else {
        // TV show
        const status = getUserShowStatus(tmdbId);

        if (status.isRanked && rankingTarget.id) {
          await updateTvShowWatchRecords(rankingTarget.id, records);
          
          if (params.classKey && params.classKey !== status.classKey) {
            await moveTvToClass(rankingTarget.id, params.classKey, {
              toTop: params.position === 'top',
              toMiddle: params.position === 'middle',
            });
          }
        } else {
          await addTvShowFromSearch({
            id: rankingTarget.id,
            title: rankingTarget.title,
            posterPath: rankingTarget.posterPath,
            classKey: params.classKey || 'UNRANKED',
            position: params.position,
          });
          if (records.length > 0 && rankingTarget.id) {
            await updateTvShowWatchRecords(rankingTarget.id, records);
          }
        }
      }

      if (params.listMemberships?.length && rankingTarget.id) {
        setEntryListMembership(
          rankingTarget.id,
          rankingTarget.mediaType === 'movie' ? 'movie' : 'tv',
          params.listMemberships
        );
      }
      
      if (goToMedia) {
        // Navigate and then scroll to the item
        const targetPath = rankingTarget.mediaType === 'movie' ? '/movies' : '/tv';
        navigate(targetPath, { state: { scrollToId: rankingTarget.id } });
      }
    } finally {
      setIsRankingSaving(false);
      if (!params?.keepModalOpen) {
        setRankingTarget(null);
      }
    }
  };

  // Handle removing entry
  const handleRemoveEntry = async (itemId: string) => {
    if (!rankingTarget) return;
    if (rankingTarget.mediaType === 'movie') {
      await removeMovieEntry(itemId);
    } else {
      await removeTvShowEntry(itemId);
    }
  };

  // Custom tooltip for category charts
  const CategoryTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="profile-chart-tooltip">
          <p className="profile-chart-tooltip-category">{data.label}</p>
          <p className="profile-chart-tooltip-count">{data.count} items</p>
          <p className="profile-chart-tooltip-watchtime">{formatDuration(data.watchTime)}</p>
        </div>
      );
    }
    return null;
  };

  // Custom tooltip for release year charts
  const YearTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="profile-chart-tooltip">
          <p className="profile-chart-tooltip-year">{data.year}</p>
          <p className="profile-chart-tooltip-count">{data.count} items</p>
        </div>
      );
    }
    return null;
  };

  // Custom tooltip for watch year charts
  const WatchYearTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="profile-chart-tooltip">
          <p className="profile-chart-tooltip-year">{data.year}</p>
          <p className="profile-chart-tooltip-count">{data.count} watches</p>
          {chartMode === 'time' && (
            <p className="profile-chart-tooltip-watchtime">{formatDuration(data.watchTime)}</p>
          )}
        </div>
      );
    }
    return null;
  };

  const searchableMovies = useMemo(() => rankedMovies.map(m => ({ id: m.id, title: m.title })), [rankedMovies]);
  const searchableShows = useMemo(() => rankedShows.map(s => ({ id: s.id, title: s.title })), [rankedShows]);
  const searchableActors = useMemo(() => rankedActors.map(a => ({ id: a.id, title: a.title })), [rankedActors]);
  const searchableDirectors = useMemo(() => rankedDirectors.map(d => ({ id: d.id, title: d.title })), [rankedDirectors]);

  const handleScrollToId = useCallback((id: string) => {
    const el = document.getElementById(`profile-entry-${id}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('highlighted-entry');
      setTimeout(() => el.classList.remove('highlighted-entry'), 2000);
    }
  }, []);

  const handleCopyProfileLink = useCallback(async () => {
    const uid = user?.uid?.trim();
    if (!uid || typeof window === 'undefined') return;
    const profileUrl = `${window.location.origin}/friends/${encodeURIComponent(uid)}`;
    const ok = await copyTextCrossPlatform(profileUrl);
    if (!ok) return;
    setProfileLinkCopied(true);
    window.setTimeout(() => setProfileLinkCopied(false), 1600);
  }, [user?.uid]);

  return (
    <section>
      <div className="profile-stats profile-card card-surface">
        <div className="profile-stats-header">
          <div className="profile-stats-header-title">
            <h2 className="profile-card-title">Quick stats</h2>
            <span className="profile-stats-header-divider">|</span>
            <div className="profile-stats-header-quote">
              <RandomQuote />
            </div>
          </div>
          <div className="profile-stats-header-actions">
            {profileLinkCopied ? <span className="profile-share-feedback">Profile link copied</span> : null}
            <button
              type="button"
              className="profile-stats-expand-btn profile-stats-share-btn"
              onClick={() => void handleCopyProfileLink()}
              aria-label="Copy profile link"
              title="Copy profile link"
            >
              <Share2 size={16} aria-hidden />
            </button>
            <button
              type="button"
              className="profile-stats-expand-btn"
              onClick={() => setShowExpandedStats(!showExpandedStats)}
            >
              {showExpandedStats ? '▼' : '▶'} Detailed stats
            </button>
          </div>
        </div>
        
        <div className="profile-stats-top-row">
          {stats.totalMinutes > 0 && (
            <div className="profile-stat">
              <span className="profile-stat-value profile-stat-value--hero">{formatWatchtimeHours(stats.totalMinutes)}</span>
              <span className="profile-stat-label">Watchtime</span>
            </div>
          )}
          {stats.moviesSeen > 0 && (
            <div className="profile-stat">
              <span className="profile-stat-value profile-stat-value--hero">{stats.moviesSeen}</span>
              <span className="profile-stat-label">Movies seen</span>
            </div>
          )}
          {stats.showsSeen > 0 && (
            <div className="profile-stat">
              <span className="profile-stat-value profile-stat-value--hero">{stats.showsSeen}</span>
              <span className="profile-stat-label">Shows seen</span>
            </div>
          )}
          {stats.actorsSaved > 0 && (
            <div className="profile-stat">
              <span className="profile-stat-value profile-stat-value--hero">{stats.actorsSaved}</span>
              <span className="profile-stat-label">Actors saved</span>
            </div>
          )}
          {stats.directorsSaved > 0 && (
            <div className="profile-stat">
              <span className="profile-stat-value profile-stat-value--hero">{stats.directorsSaved}</span>
              <span className="profile-stat-label">Directors saved</span>
            </div>
          )}
          {watchlist.movies.length > 0 && (
            <div className="profile-stat">
              <span className="profile-stat-value profile-stat-value--hero">{watchlist.movies.length}</span>
              <span className="profile-stat-label">Movie watchlist</span>
            </div>
          )}
          {watchlist.tv.length > 0 && (
            <div className="profile-stat">
              <span className="profile-stat-value profile-stat-value--hero">{watchlist.tv.length}</span>
              <span className="profile-stat-label">Show watchlist</span>
            </div>
          )}
        </div>

        {showExpandedStats && (
          <div className="profile-stats-expanded">
            <div className="profile-stats-split">
              <div className="profile-stat">
                <span className="profile-stat-value profile-stat-value--sub">{formatDuration(stats.moviesMinutes)}</span>
                <span className="profile-stat-label">Movies</span>
              </div>
              <div className="profile-stat">
                <span className="profile-stat-value profile-stat-value--sub">{formatDuration(stats.showsMinutes)}</span>
                <span className="profile-stat-label">Shows</span>
              </div>
              <div className="profile-stat">
                <span className="profile-stat-value profile-stat-value--sub">{formatDuration(stats.avgWatchtimePerMovie)}</span>
                <span className="profile-stat-label">Avg per movie</span>
              </div>
              <div className="profile-stat">
                <span className="profile-stat-value profile-stat-value--sub">{formatDuration(stats.avgWatchtimePerShow)}</span>
                <span className="profile-stat-label">Avg per show</span>
              </div>
            </div>
            
            <div className="profile-stats-grid">
              <div className="profile-stat">
                <span className="profile-stat-value">{stats.episodesWatched}</span>
                <span className="profile-stat-label">Episodes watched</span>
              </div>
              <div className="profile-stat">
                <span className="profile-stat-value">{stats.movieWatches}</span>
                <span className="profile-stat-label">Total movie watches</span>
              </div>
              <div className="profile-stat">
                <span className="profile-stat-value">{formatWatchRatePercent(stats.movieDNFCount, stats.movieTotalWatches)}%</span>
                <span className="profile-stat-label">Movie DNF rate</span>
              </div>
              <div className="profile-stat">
                <span className="profile-stat-value">{formatWatchRatePercent(stats.movieRewatchCount, stats.movieTotalTitles)}%</span>
                <span className="profile-stat-label">Movie rewatch rate</span>
              </div>
              <div className="profile-stat">
                <span className="profile-stat-value">{formatWatchRatePercent(stats.tvDNFCount, stats.tvTotalWatches)}%</span>
                <span className="profile-stat-label">Show DNF rate</span>
              </div>
              <div className="profile-stat">
                <span className="profile-stat-value">{stats.tvAverageWatchPercent.toFixed(1)}%</span>
                <span className="profile-stat-label">Avg show watch %</span>
              </div>
              <div className="profile-stat">
                <span className="profile-stat-value">{formatWatchRatePercent(stats.tvRewatchCount, stats.tvTotalTitles)}%</span>
                <span className="profile-stat-label">Show rewatch rate</span>
              </div>
            </div>

            {globalCollectionProgress.length > 0 && (
              <section className="profile-collection-section">
                <h3 className="profile-collection-section-title">Clastonian Collections</h3>
                <div className="profile-stats-global-collections">
                  {globalCollectionProgress.map((collection) => (
                    <Link
                      key={collection.id}
                      to={collection.href}
                      className="profile-stat profile-stat--collection-link"
                    >
                      <CollectionRadialProgress
                        seen={collection.seen}
                        watchlistUnseen={collection.watchlistUnseen}
                        total={collection.total}
                        includeWatchlistSegment
                      />
                      <div className="profile-collection-progress-meta">
                        <span className="profile-stat-label profile-stat-label--collection-small">{collection.name}</span>
                        <span className="profile-collection-radial-frac">{collection.seen}/{collection.total}</span>
                        <span className="profile-collection-radial-pct">
                          {collection.total > 0 ? Math.round((collection.seen / collection.total) * 100) : 0}% complete
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            )}
            {customCollectionProgress.length > 0 && (
              <section className="profile-collection-section">
                <h3 className="profile-collection-section-title">{username ?? 'Your'}'s Collections</h3>
                <div className="profile-stats-global-collections">
                  {customCollectionProgress.map((collection) => (
                    <Link
                      key={`custom-${collection.id}`}
                      to={collection.href}
                      className="profile-stat profile-stat--collection-link"
                    >
                      <CollectionRadialProgress
                        seen={collection.seen}
                        watchlistUnseen={collection.watchlistUnseen}
                        total={collection.total}
                        includeWatchlistSegment
                      />
                      <div className="profile-collection-progress-meta">
                        <span className="profile-stat-label profile-stat-label--collection-small">{collection.name}</span>
                        <span className="profile-collection-radial-frac">{collection.seen}/{collection.total}</span>
                        <span className="profile-collection-radial-pct">
                          {collection.total > 0 ? Math.round((collection.seen / collection.total) * 100) : 0}% complete
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            )}
            {listProgress.length > 0 && (
              <section className="profile-collection-section">
                <h3 className="profile-collection-section-title">{username ?? 'Your'}'s Lists</h3>
                <div className="profile-stats-global-collections profile-stats-global-collections--lists">
                  {listProgress.map((list) => (
                    <Link
                      key={`list-${list.id}`}
                      to={list.href}
                      className="profile-stat profile-stat--collection-link profile-stat--friend-list-link"
                    >
                      <div className="profile-friend-list-collage profile-friend-list-collage--bg">
                        {list.posterPaths.length > 0 ? (
                          list.posterPaths.map((posterPath, idx) => (
                            <img key={`${list.id}-${idx}`} src={tmdbImagePath(posterPath) ?? ''} alt="" loading="lazy" />
                          ))
                        ) : (
                          <span className="profile-friend-list-collage-empty">No posters</span>
                        )}
                      </div>
                      <div className="profile-friend-list-content">
                        <span className="profile-stat-label profile-stat-label--collection-small">{list.name}</span>
                        <span className="profile-friend-list-meta">{list.count} items · {String(list.mediaType ?? 'mixed')}</span>
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            <div className="profile-stats-charts">
              <div className="profile-chart-section">
                <div className="profile-chart-header">
                  <h3 className="profile-chart-title">Movies Watched by Year</h3>
                  <div className="profile-chart-toggle">
                    <button
                      type="button"
                      className={`profile-chart-toggle-btn ${chartMode === 'count' ? 'active' : ''}`}
                      onClick={() => setChartMode('count')}
                    >
                      Count
                    </button>
                    <button
                      type="button"
                      className={`profile-chart-toggle-btn ${chartMode === 'time' ? 'active' : ''}`}
                      onClick={() => setChartMode('time')}
                    >
                      Time
                    </button>
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={stats.movieWatchYearData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                    <XAxis dataKey="year" stroke="rgba(255,255,255,0.5)" />
                    <YAxis stroke="rgba(255,255,255,0.5)" />
                    <Tooltip content={<WatchYearTooltip />} />
                    <Bar dataKey={chartMode === 'count' ? 'count' : 'watchTime'} fill="var(--accent)" />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="profile-chart-section">
                <div className="profile-chart-header">
                  <h3 className="profile-chart-title">Shows Watched by Year</h3>
                  <div className="profile-chart-toggle">
                    <button
                      type="button"
                      className={`profile-chart-toggle-btn ${chartMode === 'count' ? 'active' : ''}`}
                      onClick={() => setChartMode('count')}
                    >
                      Count
                    </button>
                    <button
                      type="button"
                      className={`profile-chart-toggle-btn ${chartMode === 'time' ? 'active' : ''}`}
                      onClick={() => setChartMode('time')}
                    >
                      Time
                    </button>
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={stats.tvWatchYearData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                    <XAxis dataKey="year" stroke="rgba(255,255,255,0.5)" />
                    <YAxis stroke="rgba(255,255,255,0.5)" />
                    <Tooltip content={<WatchYearTooltip />} />
                    <Bar dataKey={chartMode === 'count' ? 'count' : 'watchTime'} fill="var(--accent)" />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="profile-chart-section">
                <div className="profile-chart-header">
                  <h3 className="profile-chart-title">Movies by Ranked Category</h3>
                  <div className="profile-chart-toggle">
                    <button
                      type="button"
                      className={`profile-chart-toggle-btn ${chartScope === 'all' ? 'active' : ''}`}
                      onClick={() => setChartScope('all')}
                    >
                      All
                    </button>
                    <button
                      type="button"
                      className={`profile-chart-toggle-btn ${chartScope === 'this_year' ? 'active' : ''}`}
                      onClick={() => setChartScope('this_year')}
                    >
                      This year
                    </button>
                    <button
                      type="button"
                      className={`profile-chart-toggle-btn ${chartMode === 'count' ? 'active' : ''}`}
                      onClick={() => setChartMode('count')}
                    >
                      Count
                    </button>
                    <button
                      type="button"
                      className={`profile-chart-toggle-btn ${chartMode === 'time' ? 'active' : ''}`}
                      onClick={() => setChartMode('time')}
                    >
                      Time
                    </button>
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={stats.movieRankedCategories}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                    <XAxis dataKey="label" stroke="rgba(255,255,255,0.5)" angle={-45} textAnchor="end" height={80} />
                    <YAxis stroke="rgba(255,255,255,0.5)" />
                    <Tooltip content={<CategoryTooltip />} />
                    <Bar dataKey={chartMode === 'time' ? 'watchTime' : 'count'} fill="var(--accent)" />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="profile-chart-section">
                <div className="profile-chart-header">
                  <h3 className="profile-chart-title">Shows by Ranked Category</h3>
                  <div className="profile-chart-toggle">
                    <button
                      type="button"
                      className={`profile-chart-toggle-btn ${chartScope === 'all' ? 'active' : ''}`}
                      onClick={() => setChartScope('all')}
                    >
                      All
                    </button>
                    <button
                      type="button"
                      className={`profile-chart-toggle-btn ${chartScope === 'this_year' ? 'active' : ''}`}
                      onClick={() => setChartScope('this_year')}
                    >
                      This year
                    </button>
                    <button
                      type="button"
                      className={`profile-chart-toggle-btn ${chartMode === 'count' ? 'active' : ''}`}
                      onClick={() => setChartMode('count')}
                    >
                      Count
                    </button>
                    <button
                      type="button"
                      className={`profile-chart-toggle-btn ${chartMode === 'time' ? 'active' : ''}`}
                      onClick={() => setChartMode('time')}
                    >
                      Time
                    </button>
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={stats.tvRankedCategories}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                    <XAxis dataKey="label" stroke="rgba(255,255,255,0.5)" angle={-45} textAnchor="end" height={80} />
                    <YAxis stroke="rgba(255,255,255,0.5)" />
                    <Tooltip content={<CategoryTooltip />} />
                    <Bar dataKey={chartMode === 'time' ? 'watchTime' : 'count'} fill="var(--accent)" />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="profile-chart-section">
                <div className="profile-chart-header">
                  <h3 className="profile-chart-title">Movies by Genre</h3>
                  <div className="profile-chart-toggle">
                    <button
                      type="button"
                      className={`profile-chart-toggle-btn ${chartScope === 'all' ? 'active' : ''}`}
                      onClick={() => setChartScope('all')}
                    >
                      All
                    </button>
                    <button
                      type="button"
                      className={`profile-chart-toggle-btn ${chartScope === 'this_year' ? 'active' : ''}`}
                      onClick={() => setChartScope('this_year')}
                    >
                      This year
                    </button>
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={stats.movieGenreData} barCategoryGap={2}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                    <XAxis 
                      dataKey="name" 
                      stroke="rgba(255,255,255,0.5)" 
                      angle={-45} 
                      textAnchor="end" 
                      height={80} 
                      fontSize={10}
                    />
                    <YAxis stroke="rgba(255,255,255,0.5)" fontSize={10} />
                    <Tooltip 
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          return (
                            <div className="profile-chart-tooltip">
                              <p className="profile-chart-tooltip-category">{payload[0].payload.name}</p>
                              <p className="profile-chart-tooltip-count">{payload[0].value} movies</p>
                            </div>
                          );
                        }
                        return null;
                      }} 
                    />
                    <Bar dataKey="count" fill="var(--accent)" />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="profile-chart-section">
                <div className="profile-chart-header">
                  <h3 className="profile-chart-title">Shows by Genre</h3>
                  <div className="profile-chart-toggle">
                    <button
                      type="button"
                      className={`profile-chart-toggle-btn ${chartScope === 'all' ? 'active' : ''}`}
                      onClick={() => setChartScope('all')}
                    >
                      All
                    </button>
                    <button
                      type="button"
                      className={`profile-chart-toggle-btn ${chartScope === 'this_year' ? 'active' : ''}`}
                      onClick={() => setChartScope('this_year')}
                    >
                      This year
                    </button>
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={stats.tvGenreData} barCategoryGap={2}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                    <XAxis 
                      dataKey="name" 
                      stroke="rgba(255,255,255,0.5)" 
                      angle={-45} 
                      textAnchor="end" 
                      height={80} 
                      fontSize={10}
                    />
                    <YAxis stroke="rgba(255,255,255,0.5)" fontSize={10} />
                    <Tooltip 
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          return (
                            <div className="profile-chart-tooltip">
                              <p className="profile-chart-tooltip-category">{payload[0].payload.name}</p>
                              <p className="profile-chart-tooltip-count">{payload[0].value} shows</p>
                            </div>
                          );
                        }
                        return null;
                      }} 
                    />
                    <Bar dataKey="count" fill="var(--accent)" />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="profile-chart-section">
                <div className="profile-chart-header">
                  <h3 className="profile-chart-title">Movies by Release Year</h3>
                  <div className="profile-chart-toggle">
                    <button
                      type="button"
                      className={`profile-chart-toggle-btn ${chartScope === 'all' ? 'active' : ''}`}
                      onClick={() => setChartScope('all')}
                    >
                      All
                    </button>
                    <button
                      type="button"
                      className={`profile-chart-toggle-btn ${chartScope === 'this_year' ? 'active' : ''}`}
                      onClick={() => setChartScope('this_year')}
                    >
                      This year
                    </button>
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={stats.movieReleaseYearData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                    <XAxis dataKey="year" stroke="rgba(255,255,255,0.5)" />
                    <YAxis stroke="rgba(255,255,255,0.5)" />
                    <Tooltip content={<YearTooltip />} />
                    <Bar dataKey="count" fill="var(--accent-soft)" />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="profile-chart-section">
                <div className="profile-chart-header">
                  <h3 className="profile-chart-title">Shows by Release Year</h3>
                  <div className="profile-chart-toggle">
                    <button
                      type="button"
                      className={`profile-chart-toggle-btn ${chartScope === 'all' ? 'active' : ''}`}
                      onClick={() => setChartScope('all')}
                    >
                      All
                    </button>
                    <button
                      type="button"
                      className={`profile-chart-toggle-btn ${chartScope === 'this_year' ? 'active' : ''}`}
                      onClick={() => setChartScope('this_year')}
                    >
                      This year
                    </button>
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={stats.tvReleaseYearData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                    <XAxis dataKey="year" stroke="rgba(255,255,255,0.5)" />
                    <YAxis stroke="rgba(255,255,255,0.5)" />
                    <Tooltip content={<YearTooltip />} />
                    <Bar dataKey="count" fill="var(--accent-soft)" />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {showAvgRuntimeCharts ? (
                <>
                  <div className="profile-chart-section">
                    <h3 className="profile-chart-title">Runtime by Movie Category</h3>
                    <ResponsiveContainer width="100%" height={250}>
                      <BarChart data={stats.movieAvgRuntimeByCategory}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                        <XAxis dataKey="label" stroke="rgba(255,255,255,0.5)" angle={-45} textAnchor="end" height={80} />
                        <YAxis stroke="rgba(255,255,255,0.5)" />
                        <Tooltip content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const data = payload[0].payload;
                            return (
                              <div className="profile-chart-tooltip">
                                <p className="profile-chart-tooltip-category">{data.key}</p>
                                <p className="profile-chart-tooltip-count">{data.avgRuntime} min avg</p>
                                <p className="profile-chart-tooltip-count">{data.count} movies</p>
                              </div>
                            );
                          }
                          return null;
                        }} />
                        <Bar dataKey="avgRuntime" fill="var(--accent)" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="profile-chart-section">
                    <h3 className="profile-chart-title">Runtime by Show Category</h3>
                    <ResponsiveContainer width="100%" height={250}>
                      <BarChart data={stats.showAvgRuntimeByCategory}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                        <XAxis dataKey="label" stroke="rgba(255,255,255,0.5)" angle={-45} textAnchor="end" height={80} />
                        <YAxis stroke="rgba(255,255,255,0.5)" />
                        <Tooltip content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const data = payload[0].payload;
                            return (
                              <div className="profile-chart-tooltip">
                                <p className="profile-chart-tooltip-category">{data.key}</p>
                                <p className="profile-chart-tooltip-count">{data.avgRuntime} min avg</p>
                                <p className="profile-chart-tooltip-count">{data.count} shows</p>
                              </div>
                            );
                          }
                          return null;
                        }} />
                        <Bar dataKey="avgRuntime" fill="var(--accent)" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </>
              ) : (
                <div className="profile-chart-section profile-chart-section--full-width">
                  <div className="profile-chart-header">
                    <h3 className="profile-chart-title">Runtime by Category</h3>
                    <button
                      type="button"
                      className="profile-show-all-toggle profile-tiny-expand-btn"
                      onClick={() => setShowAvgRuntimeCharts(true)}
                    >
                      Load
                    </button>
                  </div>
                </div>
              )}

              {showScatterplots ? (
                <>
              <div className="profile-chart-section">
                <div className="profile-chart-header">
                  <h3 className="profile-chart-title">
                    Movie Runtime vs {scatterYAxisMode === 'rank' ? 'Absolute Ranking' : 'Release Year'}
                  </h3>
                  <div className="profile-chart-toggle">
                    <button
                      type="button"
                      className={`profile-chart-toggle-btn ${scatterYAxisMode === 'rank' ? 'active' : ''}`}
                      onClick={() => setScatterYAxisMode('rank')}
                    >
                      Ranking
                    </button>
                    <button
                      type="button"
                      className={`profile-chart-toggle-btn ${scatterYAxisMode === 'release_year' ? 'active' : ''}`}
                      onClick={() => setScatterYAxisMode('release_year')}
                    >
                      Release year
                    </button>
                  </div>
                  <div className="profile-chart-toggle">
                    <button
                      type="button"
                      className={`profile-chart-toggle-btn ${!pruneScatterOutliers ? 'active' : ''}`}
                      onClick={() => setPruneScatterOutliers(false)}
                    >
                      Outliers on
                    </button>
                    <button
                      type="button"
                      className={`profile-chart-toggle-btn ${pruneScatterOutliers ? 'active' : ''}`}
                      onClick={() => setPruneScatterOutliers(true)}
                    >
                      Prune outliers
                    </button>
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={260}>
                  <ScatterChart data={movieScatterData} margin={{ top: 12, right: 20, bottom: 10, left: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                    <XAxis
                      type="number"
                      dataKey="runtime"
                      name="Runtime"
                      unit=" min"
                      stroke="rgba(255,255,255,0.5)"
                    />
                    <YAxis
                      type="number"
                      dataKey={scatterYAxisMode === 'rank' ? 'rank' : 'releaseYear'}
                      name={scatterYAxisMode === 'rank' ? 'Absolute Rank' : 'Release Year'}
                      stroke="rgba(255,255,255,0.5)"
                      allowDecimals={false}
                      reversed={scatterYAxisMode === 'rank'}
                      domain={scatterYAxisMode === 'release_year' ? movieReleaseYearDomain : undefined}
                    />
                    <Tooltip
                      cursor={{ strokeDasharray: '3 3' }}
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload as {
                            title: string;
                            classLabel: string;
                            runtime: number;
                            absoluteRank: string;
                            releaseYear?: number | null;
                          };
                          return (
                            <div className="profile-chart-tooltip">
                              <p className="profile-chart-tooltip-category">{data.title}</p>
                              <p className="profile-chart-tooltip-count">Class: {data.classLabel}</p>
                              <p className="profile-chart-tooltip-count">Runtime: {data.runtime} min</p>
                              {scatterYAxisMode === 'rank' ? (
                                <p className="profile-chart-tooltip-count">Rank: {data.absoluteRank}</p>
                              ) : (
                                <p className="profile-chart-tooltip-count">Release Year: {data.releaseYear ?? 'Unknown'}</p>
                              )}
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Scatter data={movieScatterData}>
                      {movieScatterData.map((point, index) => (
                        <Cell key={`movie-scatter-point-${point.title}-${index}`} fill={point.color} />
                      ))}
                    </Scatter>
                  </ScatterChart>
                </ResponsiveContainer>
              </div>

              <div className="profile-chart-section">
                <h3 className="profile-chart-title">
                  Show Runtime vs {scatterYAxisMode === 'rank' ? 'Absolute Ranking' : 'Release Year'}
                </h3>
                <ResponsiveContainer width="100%" height={260}>
                  <ScatterChart data={showScatterData} margin={{ top: 12, right: 20, bottom: 10, left: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                    <XAxis
                      type="number"
                      dataKey="runtime"
                      name="Runtime"
                      unit=" min"
                      stroke="rgba(255,255,255,0.5)"
                    />
                    <YAxis
                      type="number"
                      dataKey={scatterYAxisMode === 'rank' ? 'rank' : 'releaseYear'}
                      name={scatterYAxisMode === 'rank' ? 'Absolute Rank' : 'Release Year'}
                      stroke="rgba(255,255,255,0.5)"
                      allowDecimals={false}
                      reversed={scatterYAxisMode === 'rank'}
                      domain={scatterYAxisMode === 'release_year' ? showReleaseYearDomain : undefined}
                    />
                    <Tooltip
                      cursor={{ strokeDasharray: '3 3' }}
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload as {
                            title: string;
                            classLabel: string;
                            runtime: number;
                            absoluteRank: string;
                            releaseYear?: number | null;
                          };
                          return (
                            <div className="profile-chart-tooltip">
                              <p className="profile-chart-tooltip-category">{data.title}</p>
                              <p className="profile-chart-tooltip-count">Class: {data.classLabel}</p>
                              <p className="profile-chart-tooltip-count">Runtime: {data.runtime} min</p>
                              {scatterYAxisMode === 'rank' ? (
                                <p className="profile-chart-tooltip-count">Rank: {data.absoluteRank}</p>
                              ) : (
                                <p className="profile-chart-tooltip-count">Release Year: {data.releaseYear ?? 'Unknown'}</p>
                              )}
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Scatter data={showScatterData}>
                      {showScatterData.map((point, index) => (
                        <Cell key={`show-scatter-point-${point.title}-${index}`} fill={point.color} />
                      ))}
                    </Scatter>
                  </ScatterChart>
                </ResponsiveContainer>
              </div>

              <div className="profile-chart-section">
                <div className="profile-chart-header">
                  <h3 className="profile-chart-title">Movie Ranking by Release Year</h3>
                  <div className="profile-chart-toggle">
                    <button
                      type="button"
                      className={`profile-chart-toggle-btn ${!pruneScatterOutliers ? 'active' : ''}`}
                      onClick={() => setPruneScatterOutliers(false)}
                    >
                      Outliers on
                    </button>
                    <button
                      type="button"
                      className={`profile-chart-toggle-btn ${pruneScatterOutliers ? 'active' : ''}`}
                      onClick={() => setPruneScatterOutliers(true)}
                    >
                      Prune outliers
                    </button>
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={260}>
                  <ScatterChart data={movieRankByReleaseData} margin={{ top: 12, right: 20, bottom: 10, left: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                    <XAxis
                      type="number"
                      dataKey="releaseYear"
                      name="Release Year"
                      stroke="rgba(255,255,255,0.5)"
                      allowDecimals={false}
                      domain={movieRankByReleaseYearDomain}
                    />
                    <YAxis
                      type="number"
                      dataKey="rank"
                      name="Absolute Rank"
                      stroke="rgba(255,255,255,0.5)"
                      allowDecimals={false}
                      reversed
                    />
                    <Tooltip
                      cursor={{ strokeDasharray: '3 3' }}
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload as {
                            title: string;
                            classLabel: string;
                            releaseYear?: number | null;
                            absoluteRank: string;
                          };
                          return (
                            <div className="profile-chart-tooltip">
                              <p className="profile-chart-tooltip-category">{data.title}</p>
                              <p className="profile-chart-tooltip-count">Class: {data.classLabel}</p>
                              <p className="profile-chart-tooltip-count">Release Year: {data.releaseYear ?? 'Unknown'}</p>
                              <p className="profile-chart-tooltip-count">Rank: {data.absoluteRank}</p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Scatter data={movieRankByReleaseData}>
                      {movieRankByReleaseData.map((point, index) => (
                        <Cell key={`movie-release-rank-point-${point.title}-${index}`} fill={point.color} />
                      ))}
                    </Scatter>
                  </ScatterChart>
                </ResponsiveContainer>
              </div>

              <div className="profile-chart-section">
                <h3 className="profile-chart-title">Show Ranking by Release Year</h3>
                <ResponsiveContainer width="100%" height={260}>
                  <ScatterChart data={showRankByReleaseData} margin={{ top: 12, right: 20, bottom: 10, left: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                    <XAxis
                      type="number"
                      dataKey="releaseYear"
                      name="Release Year"
                      stroke="rgba(255,255,255,0.5)"
                      allowDecimals={false}
                      domain={showRankByReleaseYearDomain}
                    />
                    <YAxis
                      type="number"
                      dataKey="rank"
                      name="Absolute Rank"
                      stroke="rgba(255,255,255,0.5)"
                      allowDecimals={false}
                      reversed
                    />
                    <Tooltip
                      cursor={{ strokeDasharray: '3 3' }}
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload as {
                            title: string;
                            classLabel: string;
                            releaseYear?: number | null;
                            absoluteRank: string;
                          };
                          return (
                            <div className="profile-chart-tooltip">
                              <p className="profile-chart-tooltip-category">{data.title}</p>
                              <p className="profile-chart-tooltip-count">Class: {data.classLabel}</p>
                              <p className="profile-chart-tooltip-count">Release Year: {data.releaseYear ?? 'Unknown'}</p>
                              <p className="profile-chart-tooltip-count">Rank: {data.absoluteRank}</p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Scatter data={showRankByReleaseData}>
                      {showRankByReleaseData.map((point, index) => (
                        <Cell key={`show-release-rank-point-${point.title}-${index}`} fill={point.color} />
                      ))}
                    </Scatter>
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
                </>
              ) : (
                <div className="profile-chart-section">
                  <div className="profile-chart-header">
                    <h3 className="profile-chart-title">Data Scatterplots</h3>
                    <button
                      type="button"
                      className="profile-show-all-toggle profile-tiny-expand-btn"
                      onClick={() => setShowScatterplots(true)}
                    >
                      Show data scatterplots
                    </button>
                  </div>
                </div>
              )}
            </div>

            {showCopyTools ? (
              <ProfileCopyTopRankedSection
                movieClassOrder={profileCopyMovieClassOrder}
                tvClassOrder={profileCopyTvClassOrder}
                peopleClassOrder={profileCopyPeopleClassOrder}
                directorsClassOrder={profileCopyDirectorsClassOrder}
                moviesByClass={moviesByClass}
                tvByClass={tvByClass}
                peopleByClass={peopleByClass}
                directorsByClass={directorsByClass}
                getMovieClassLabel={getMovieClassLabel}
                getMovieClassTagline={getMovieClassTagline}
                getTvClassLabel={getTvClassLabel}
                getTvClassTagline={getTvClassTagline}
                getPeopleClassLabel={(k) => peopleClasses.find((c) => c.key === k)?.label ?? k}
                getPeopleClassTagline={(k) => peopleClasses.find((c) => c.key === k)?.tagline}
                getDirectorClassLabel={(k) => directorsClasses.find((c) => c.key === k)?.label ?? k}
                getDirectorClassTagline={(k) => directorsClasses.find((c) => c.key === k)?.tagline}
                isMovieClassRanked={isRankedMovieClass}
                isTvClassRanked={isRankedTvClass}
                isPeopleClassRanked={isPeopleClassRanked}
                isDirectorClassRanked={isDirectorClassRanked}
                watchlistMovies={watchlist.movies}
                watchlistTv={watchlist.tv}
                watchlistEntryHasBeenWatched={watchlistEntryHasBeenWatched}
                profileShareUid={user?.uid ?? null}
              />
            ) : (
              <div className="profile-chart-section profile-chart-section--full-width">
                <div className="profile-chart-header">
                  <h3 className="profile-chart-title">Copy ranked lists / watchlist</h3>
                  <button
                    type="button"
                    className="profile-show-all-toggle profile-tiny-expand-btn"
                    onClick={() => setShowCopyTools(true)}
                  >
                    Load
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="profile-grids-stack">
      <div className="profile-grid">
        <div className="profile-card card-surface">
          <div className="profile-card-header">
            <h2 className="profile-card-title">
              {movieViewMode === 'all_with_classes'
                ? `All ${rankedMovies.length} Movies`
                : movieViewMode === 'top5_each_year'
                  ? 'Top 5 Movies by Release Year'
                : movieViewMode === 'top10_by_watch_year'
                    ? 'Top 10 Movies by Watch Year'
                    : movieViewMode === 'bottom5_each_year'
                      ? 'Bottom 5 Movies by Release Year'
                      : movieViewMode === 'bottom10_by_watch_year'
                        ? 'Bottom 10 Movies by Watch Year'
                        : movieViewMode === 'bottom10'
                          ? 'Bottom 10 Movies'
                    : movieViewMode === 'top30_most_seen'
                      ? 'Top 30 most seen movies'
                    : 'Top 10 Movies'}
            </h2>
            <div className="profile-card-actions profile-card-actions--with-dropdown">
              <ThemedDropdown
                className="profile-list-mode-dropdown"
                value={movieViewMode}
                options={PROFILE_MEDIA_LIST_MODE_OPTIONS}
                onChange={setMovieViewMode}
                aria-label="Movies list view"
              />
              {(movieViewMode === 'top10_by_watch_year' || movieViewMode === 'bottom10_by_watch_year') && (
                <div className="profile-chart-toggle profile-list-watch-toggle" role="group" aria-label="Watch year filter">
                  <button
                    type="button"
                    className={`profile-chart-toggle-btn ${movieWatchYearFilter === 'all' ? 'active' : ''}`}
                    onClick={() => setMovieWatchYearFilter('all')}
                  >
                    All
                  </button>
                  <button
                    type="button"
                    className={`profile-chart-toggle-btn ${movieWatchYearFilter === 'first_watch' ? 'active' : ''}`}
                    onClick={() => setMovieWatchYearFilter('first_watch')}
                  >
                    First watch
                  </button>
                  <button
                    type="button"
                    className={`profile-chart-toggle-btn ${movieWatchYearFilter === 'rewatch' ? 'active' : ''}`}
                    onClick={() => setMovieWatchYearFilter('rewatch')}
                  >
                    Rewatch
                  </button>
                </div>
              )}
            </div>
          </div>
          {movieViewMode === 'top10' || movieViewMode === 'top10_by_watch_year' || movieViewMode === 'top30_most_seen' || movieViewMode === 'bottom10' || movieViewMode === 'bottom10_by_watch_year' ? (
            <Link to="/movies" className="profile-preview-link">
              View all movies →
            </Link>
          ) : movieViewMode === 'all_with_classes' ? (
            <PageSearch 
              items={searchableMovies} 
              onSelect={handleScrollToId} 
              placeholder="Search all movies..." 
              className="profile-section-search"
              pageKey="profile-movies"
            />
          ) : null}
          {movieViewMode === 'all_with_classes' ? (
            <div className="profile-classes-view">
              {movieClassOrder
                .filter((k) => movieProfileClassKeys.includes(k) && moviesByClass[k]?.length > 0)
                .map((classKey) => (
                <div key={classKey} className="profile-class-section">
                  <h3 className="profile-class-title">
                    {getMovieClassLabel(classKey)}
                    {getMovieClassTagline(classKey) ? (
                      <span className="profile-class-tagline"> | {getMovieClassTagline(classKey)}</span>
                    ) : null}
                  </h3>
                  <div className="profile-class-grid">
                    {moviesByClass[classKey].map((m, i) => {
                      const tmdbId = (m.tmdbId ?? parseInt(m.id.replace(/\D/g, ''), 10)) || 0;
                      const userStatus = getUserMovieStatus(tmdbId);
                      return (
                        <div 
                          key={m.id} 
                          id={`profile-entry-${m.id}`}
                          className="profile-top-item profile-top-item--clickable"
                          onClick={() => handleMovieClick(m)}
                        >
                          <div className="profile-top-poster">
                            {getMoviePosterSrc(m) ? (
                              <img src={getMoviePosterSrc(m) ?? ''} alt={m.title} loading="lazy" />
                            ) : (
                              <span className="profile-top-poster-placeholder">🎬</span>
                            )}
                            <div className="profile-top-overlay">
                              <span className={userStatus.classKey ? 'profile-top-overlay-text profile-top-overlay-text--seen' : 'profile-top-overlay-text'}>
                                {userStatus.classKey ? 'EDIT' : 'SAVE'}
                              </span>
                            </div>
                          </div>
                          <div className="profile-top-info">
                            <span className="profile-top-title">{m.title}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          ) : movieViewMode === 'top5_each_year' || movieViewMode === 'top10_by_watch_year' || movieViewMode === 'bottom5_each_year' || movieViewMode === 'bottom10_by_watch_year' ? (
            <div className="profile-classes-view">
              {(
                movieViewMode === 'top5_each_year'
                  ? topMoviesByYear
                  : movieViewMode === 'bottom5_each_year'
                    ? bottomMoviesByYear
                    : movieViewMode === 'bottom10_by_watch_year'
                      ? bottomMoviesByWatchYear
                      : topMoviesByWatchYear
              ).map(({ year, items }) => (
                <div key={year} className="profile-class-section">
                  <h3 className="profile-class-title">{year}</h3>
                  <div
                    className={`profile-class-grid profile-class-grid--yearly${
                      movieViewMode === 'top10_by_watch_year' ? ' profile-class-grid--yearly-ten' : ''
                    }`}
                  >
                    {items.map((m) => {
                      const tmdbId = (m.tmdbId ?? parseInt(m.id.replace(/\D/g, ''), 10)) || 0;
                      const userStatus = getUserMovieStatus(tmdbId);
                      const displayText = getPercentileBadge(m, true, userStatus.classKey, userStatus.isRanked);
                      return (
                        <div
                          key={m.id}
                          id={`profile-entry-${m.id}`}
                          className="profile-top-item profile-top-item--clickable"
                          onClick={() => handleMovieClick(m)}
                        >
                          <div className="profile-top-poster">
                            {getMoviePosterSrc(m) ? (
                              <img src={getMoviePosterSrc(m) ?? ''} alt={m.title} loading="lazy" />
                            ) : (
                              <span className="profile-top-poster-placeholder">🎬</span>
                            )}
                            <div className="profile-top-overlay">
                              <span className={userStatus.isRanked ? 'profile-top-overlay-text profile-top-overlay-text--seen' : 'profile-top-overlay-text'}>
                                {userStatus.isRanked ? 'SEEN' : 'SAVE'}
                              </span>
                            </div>
                            {displayText && (
                              <div className={`profile-recent-percentile ${!userStatus.isRanked ? 'profile-recent-percentile--unranked' : ''} profile-recent-percentile--movie`}>
                                {displayText}
                              </div>
                            )}
                          </div>
                          <div className="profile-top-info">
                            <span className="profile-top-title">{m.title}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          ) : movieViewMode === 'top30_most_seen' ? (
            <div className="profile-classes-view">
              {top30MostSeenMoviesByTier.map(({ watchCount, items }) => (
                <div key={`movies-most-seen-${watchCount}`} className="profile-class-section">
                  <h3 className="profile-class-title">{watchCount} Watches</h3>
                  <div className="profile-top-grid">
                    {items.map(({ item: m }, i) => {
                      const tmdbId = (m.tmdbId ?? parseInt(m.id.replace(/\D/g, ''), 10)) || 0;
                      const userStatus = getUserMovieStatus(tmdbId);
                      return (
                        <div
                          key={m.id}
                          className="profile-top-item profile-top-item--clickable"
                          onClick={() => handleMovieClick(m)}
                        >
                          <div className="profile-top-poster">
                            {getMoviePosterSrc(m) ? (
                              <img src={getMoviePosterSrc(m) ?? ''} alt={m.title} loading="lazy" />
                            ) : (
                              <span className="profile-top-poster-placeholder">🎬</span>
                            )}
                            <span className="profile-top-rank">#{i + 1}</span>
                            <div className="profile-top-overlay">
                              <span className={userStatus.classKey ? 'profile-top-overlay-text profile-top-overlay-text--seen' : 'profile-top-overlay-text'}>
                                {userStatus.classKey ? 'EDIT' : 'SAVE'}
                              </span>
                            </div>
                          </div>
                          <div className="profile-top-info">
                            <span className="profile-top-title">{m.title}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          ) : movieViewMode === 'bottom10' ? (
            <div className="profile-top-grid">
              {strictRankedMovies.slice(-10).reverse().map((m: any, i: any) => {
                const tmdbId = (m.tmdbId ?? parseInt(m.id.replace(/\D/g, ''), 10)) || 0;
                const userStatus = getUserMovieStatus(tmdbId);
                return (
                  <div
                    key={m.id}
                    className="profile-top-item profile-top-item--clickable"
                    onClick={() => handleMovieClick(m)}
                  >
                    <div className="profile-top-poster">
                      {getMoviePosterSrc(m) ? (
                        <img src={getMoviePosterSrc(m) ?? ''} alt={m.title} loading="lazy" />
                      ) : (
                        <span className="profile-top-poster-placeholder">🎬</span>
                      )}
                      <span className="profile-top-rank">#{strictRankedMovies.length - i}</span>
                      <div className="profile-top-overlay">
                        <span className={userStatus.classKey ? 'profile-top-overlay-text profile-top-overlay-text--seen' : 'profile-top-overlay-text'}>
                          {userStatus.classKey ? 'EDIT' : 'SAVE'}
                        </span>
                      </div>
                    </div>
                    <div className="profile-top-info">
                      <span className="profile-top-title">{m.title}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="profile-top-grid">
              {top10Movies.map((m: any, i: any) => {
                const tmdbId = (m.tmdbId ?? parseInt(m.id.replace(/\D/g, ''), 10)) || 0;
                const userStatus = getUserMovieStatus(tmdbId);
                return (
                  <div 
                    key={m.id} 
                    className="profile-top-item profile-top-item--clickable"
                    onClick={() => handleMovieClick(m)}
                  >
                    <div className="profile-top-poster">
                      {getMoviePosterSrc(m) ? (
                        <img src={getMoviePosterSrc(m) ?? ''} alt={m.title} loading="lazy" />
                      ) : (
                        <span className="profile-top-poster-placeholder">🎬</span>
                      )}
                      <span className="profile-top-rank">#{i + 1}</span>
                      <div className="profile-top-overlay">
                        <span className={userStatus.classKey ? 'profile-top-overlay-text profile-top-overlay-text--seen' : 'profile-top-overlay-text'}>
                          {userStatus.classKey ? 'EDIT' : 'SAVE'}
                        </span>
                      </div>
                    </div>
                    <div className="profile-top-info">
                      <span className="profile-top-title">{m.title}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="profile-card card-surface">
          <div className="profile-card-header">
            <h2 className="profile-card-title">
              {showViewMode === 'all_with_classes'
                ? `All ${rankedShows.length} Shows`
                : showViewMode === 'top5_each_year'
                  ? 'Top 5 Shows by Release Year'
                : showViewMode === 'top10_by_watch_year'
                    ? 'Top 10 Shows by Watch Year'
                    : showViewMode === 'bottom5_each_year'
                      ? 'Bottom 5 Shows by Release Year'
                      : showViewMode === 'bottom10_by_watch_year'
                        ? 'Bottom 10 Shows by Watch Year'
                        : showViewMode === 'bottom10'
                          ? 'Bottom 10 Shows'
                    : showViewMode === 'top30_most_seen'
                      ? 'Top 30 most seen shows'
                    : 'Top 10 Shows'}
            </h2>
            <div className="profile-card-actions profile-card-actions--with-dropdown">
              <ThemedDropdown
                className="profile-list-mode-dropdown"
                value={showViewMode}
                options={PROFILE_MEDIA_LIST_MODE_OPTIONS}
                onChange={setShowViewMode}
                aria-label="Shows list view"
              />
              {(showViewMode === 'top10_by_watch_year' || showViewMode === 'bottom10_by_watch_year') && (
                <div className="profile-chart-toggle profile-list-watch-toggle" role="group" aria-label="Watch year filter">
                  <button
                    type="button"
                    className={`profile-chart-toggle-btn ${showWatchYearFilter === 'all' ? 'active' : ''}`}
                    onClick={() => setShowWatchYearFilter('all')}
                  >
                    All
                  </button>
                  <button
                    type="button"
                    className={`profile-chart-toggle-btn ${showWatchYearFilter === 'first_watch' ? 'active' : ''}`}
                    onClick={() => setShowWatchYearFilter('first_watch')}
                  >
                    First watch
                  </button>
                  <button
                    type="button"
                    className={`profile-chart-toggle-btn ${showWatchYearFilter === 'rewatch' ? 'active' : ''}`}
                    onClick={() => setShowWatchYearFilter('rewatch')}
                  >
                    Rewatch
                  </button>
                </div>
              )}
            </div>
          </div>
          {showViewMode === 'top10' || showViewMode === 'top10_by_watch_year' || showViewMode === 'top30_most_seen' || showViewMode === 'bottom10' || showViewMode === 'bottom10_by_watch_year' ? (
            <Link to="/tv" className="profile-preview-link">
              View all shows →
            </Link>
          ) : showViewMode === 'all_with_classes' ? (
            <PageSearch 
              items={searchableShows} 
              onSelect={handleScrollToId} 
              placeholder="Search all shows..." 
              className="profile-section-search"
              pageKey="profile-shows"
            />
          ) : null}
          {showViewMode === 'all_with_classes' ? (
            <div className="profile-classes-view">
              {tvClassOrder
                .filter((k) => tvProfileClassKeys.includes(k) && tvByClass[k]?.length > 0)
                .map((classKey) => (
                <div key={classKey} className="profile-class-section">
                  <h3 className="profile-class-title">
                    {getTvClassLabel(classKey)}
                    {getTvClassTagline(classKey) ? (
                      <span className="profile-class-tagline"> | {getTvClassTagline(classKey)}</span>
                    ) : null}
                  </h3>
                  <div className="profile-class-grid">
                    {tvByClass[classKey].map((s, i) => {
                      const tmdbId = (s.tmdbId ?? parseInt(s.id.replace(/\D/g, ''), 10)) || 0;
                      const userStatus = getUserShowStatus(tmdbId);
                      return (
                        <div 
                          key={s.id} 
                          id={`profile-entry-${s.id}`}
                          className="profile-top-item profile-top-item--clickable"
                          onClick={() => handleShowClick(s)}
                        >
                          <div className="profile-top-poster">
                            {s.posterPath ? (
                              <img src={tmdbImagePath(s.posterPath) ?? ''} alt={s.title} loading="lazy" />
                            ) : (
                              <span className="profile-top-poster-placeholder">📺</span>
                            )}
                            <div className="profile-top-overlay">
                              <span className={userStatus.classKey ? 'profile-top-overlay-text profile-top-overlay-text--seen' : 'profile-top-overlay-text'}>
                                {userStatus.classKey ? 'EDIT' : 'SAVE'}
                              </span>
                            </div>
                          </div>
                          <div className="profile-top-info">
                            <span className="profile-top-title">{s.title}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          ) : showViewMode === 'top5_each_year' || showViewMode === 'top10_by_watch_year' || showViewMode === 'bottom5_each_year' || showViewMode === 'bottom10_by_watch_year' ? (
            <div className="profile-classes-view">
              {(
                showViewMode === 'top5_each_year'
                  ? topShowsByYear
                  : showViewMode === 'bottom5_each_year'
                    ? bottomShowsByYear
                    : showViewMode === 'bottom10_by_watch_year'
                      ? bottomShowsByWatchYear
                      : topShowsByWatchYear
              ).map(({ year, items }) => (
                <div key={year} className="profile-class-section">
                  <h3 className="profile-class-title">{year}</h3>
                  <div
                    className={`profile-class-grid profile-class-grid--yearly${
                      showViewMode === 'top10_by_watch_year' ? ' profile-class-grid--yearly-ten' : ''
                    }`}
                  >
                    {items.map((s) => {
                      const tmdbId = (s.tmdbId ?? parseInt(s.id.replace(/\D/g, ''), 10)) || 0;
                      const userStatus = getUserShowStatus(tmdbId);
                      const displayText = getPercentileBadge(s, false, userStatus.classKey, userStatus.isRanked);
                      return (
                        <div
                          key={s.id}
                          id={`profile-entry-${s.id}`}
                          className="profile-top-item profile-top-item--clickable"
                          onClick={() => handleShowClick(s)}
                        >
                          <div className="profile-top-poster">
                            {s.posterPath ? (
                              <img src={tmdbImagePath(s.posterPath) ?? ''} alt={s.title} loading="lazy" />
                            ) : (
                              <span className="profile-top-poster-placeholder">📺</span>
                            )}
                            <div className="profile-top-overlay">
                              <span className={userStatus.isRanked ? 'profile-top-overlay-text profile-top-overlay-text--seen' : 'profile-top-overlay-text'}>
                                {userStatus.isRanked ? 'SEEN' : 'SAVE'}
                              </span>
                            </div>
                            {displayText && (
                              <div className={`profile-recent-percentile ${!userStatus.isRanked ? 'profile-recent-percentile--unranked' : ''} profile-recent-percentile--tv`}>
                                {displayText}
                              </div>
                            )}
                          </div>
                          <div className="profile-top-info">
                            <span className="profile-top-title">{s.title}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          ) : showViewMode === 'top30_most_seen' ? (
            <div className="profile-classes-view">
              {top30MostSeenShowsByTier.map(({ watchCount, items }) => (
                <div key={`shows-most-seen-${watchCount}`} className="profile-class-section">
                  <h3 className="profile-class-title">{watchCount} Watches</h3>
                  <div className="profile-top-grid">
                    {items.map(({ item: s }, i) => {
                      const tmdbId = (s.tmdbId ?? parseInt(s.id.replace(/\D/g, ''), 10)) || 0;
                      const userStatus = getUserShowStatus(tmdbId);
                      return (
                        <div
                          key={s.id}
                          className="profile-top-item profile-top-item--clickable"
                          onClick={() => handleShowClick(s)}
                        >
                          <div className="profile-top-poster">
                            {s.posterPath ? (
                              <img src={tmdbImagePath(s.posterPath) ?? ''} alt={s.title} loading="lazy" />
                            ) : (
                              <span className="profile-top-poster-placeholder">📺</span>
                            )}
                            <span className="profile-top-rank">#{i + 1}</span>
                            <div className="profile-top-overlay">
                              <span className={userStatus.classKey ? 'profile-top-overlay-text profile-top-overlay-text--seen' : 'profile-top-overlay-text'}>
                                {userStatus.classKey ? 'EDIT' : 'SAVE'}
                              </span>
                            </div>
                          </div>
                          <div className="profile-top-info">
                            <span className="profile-top-title">{s.title}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          ) : showViewMode === 'bottom10' ? (
            <div className="profile-top-grid">
              {strictRankedShows.slice(-10).reverse().map((s: any, i: any) => {
                const tmdbId = (s.tmdbId ?? parseInt(s.id.replace(/\D/g, ''), 10)) || 0;
                const userStatus = getUserShowStatus(tmdbId);
                return (
                  <div
                    key={s.id}
                    className="profile-top-item profile-top-item--clickable"
                    onClick={() => handleShowClick(s)}
                  >
                    <div className="profile-top-poster">
                      {s.posterPath ? (
                        <img src={tmdbImagePath(s.posterPath) ?? ''} alt={s.title} loading="lazy" />
                      ) : (
                        <span className="profile-top-poster-placeholder">📺</span>
                      )}
                      <span className="profile-top-rank">#{strictRankedShows.length - i}</span>
                      <div className="profile-top-overlay">
                        <span className={userStatus.classKey ? 'profile-top-overlay-text profile-top-overlay-text--seen' : 'profile-top-overlay-text'}>
                          {userStatus.classKey ? 'EDIT' : 'SAVE'}
                        </span>
                      </div>
                    </div>
                    <div className="profile-top-info">
                      <span className="profile-top-title">{s.title}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="profile-top-grid">
              {top10Shows.map((s: any, i: any) => {
                const tmdbId = (s.tmdbId ?? parseInt(s.id.replace(/\D/g, ''), 10)) || 0;
                const userStatus = getUserShowStatus(tmdbId);
                return (
                  <div 
                    key={s.id} 
                    className="profile-top-item profile-top-item--clickable"
                    onClick={() => handleShowClick(s)}
                  >
                    <div className="profile-top-poster">
                      {s.posterPath ? (
                        <img src={tmdbImagePath(s.posterPath) ?? ''} alt={s.title} loading="lazy" />
                      ) : (
                        <span className="profile-top-poster-placeholder">📺</span>
                      )}
                      <span className="profile-top-rank">#{i + 1}</span>
                      <div className="profile-top-overlay">
                        <span className={userStatus.classKey ? 'profile-top-overlay-text profile-top-overlay-text--seen' : 'profile-top-overlay-text'}>
                          {userStatus.classKey ? 'EDIT' : 'SAVE'}
                        </span>
                      </div>
                    </div>
                    <div className="profile-top-info">
                      <span className="profile-top-title">{s.title}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {(hasActors || hasDirectors) && (
        <div className="profile-grid profile-grid--people">
          {hasActors && (
            <div className="profile-card card-surface">
              <div className="profile-card-header">
                <h2 className="profile-card-title">
                  {showAllActorsWithClasses ? `All ${rankedActors.length} Actors` : 'Top 5 Actors'}
                </h2>
                <button
                  type="button"
                  className="profile-stats-expand-btn profile-tiny-expand-btn"
                  onClick={() => setShowAllActorsWithClasses(!showAllActorsWithClasses)}
                >
                  {showAllActorsWithClasses ? 'Show Top 5' : 'Show all with classes'}
                </button>
              </div>
              {!showAllActorsWithClasses ? (
                <Link to="/actors" className="profile-preview-link">
                  View all actors →
                </Link>
              ) : (
                <PageSearch 
                  items={searchableActors} 
                  onSelect={handleScrollToId} 
                  placeholder="Search all actors..." 
                  className="profile-section-search"
                  pageKey="profile-actors"
                />
              )}
              {showAllActorsWithClasses ? (
                <div className="profile-classes-view">
                  {peopleClassOrder.filter(k => peopleByClass[k]?.length > 0).map((classKey) => (
                    <div key={classKey} className="profile-class-section">
                      <h3 className="profile-class-title">
                        {classKey}
                        {peopleClasses.find((c) => c.key === classKey)?.tagline ? (
                          <span className="profile-class-tagline">
                            {' '}
                            | {peopleClasses.find((c) => c.key === classKey)?.tagline}
                          </span>
                        ) : null}
                      </h3>
                      <div className="profile-class-grid">
                        {peopleByClass[classKey].map((a, i) => {
                          const tmdbId = (a.tmdbId ?? parseInt(a.id.replace(/\D/g, ''), 10)) || 0;
                          return (
                            <div 
                              key={a.id} 
                              id={`profile-entry-${a.id}`}
                              className="profile-top-item profile-top-item--clickable"
                              onClick={() => handleActorClick(a)}
                            >
                              <div className="profile-top-poster">
                                {a.profilePath ? (
                                  <img src={tmdbImagePath(a.profilePath) ?? ''} alt={a.title} loading="lazy" />
                                ) : (
                                  <span className="profile-top-poster-placeholder">🎭</span>
                                )}
                                <div className="profile-top-overlay">
                                  <span className="profile-top-overlay-text profile-top-overlay-text--seen">
                                    EDIT
                                  </span>
                                </div>
                              </div>
                              <div className="profile-top-info">
                                <span className="profile-top-title">{a.title}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="profile-top-grid">
                  {top5Actors.map((a: any, i: any) => (
                    <div 
                      key={a.id} 
                      className="profile-top-item profile-top-item--clickable"
                      onClick={() => handleActorClick(a)}
                    >
                      <div className="profile-top-poster">
                        {a.profilePath ? (
                          <img src={tmdbImagePath(a.profilePath) ?? ''} alt={a.title} loading="lazy" />
                        ) : (
                          <span className="profile-top-poster-placeholder">🎭</span>
                        )}
                        <span className="profile-top-rank">#{i + 1}</span>
                        <div className="profile-top-overlay">
                          <span className="profile-top-overlay-text profile-top-overlay-text--seen">
                            EDIT
                          </span>
                        </div>
                      </div>
                      <div className="profile-top-info">
                        <span className="profile-top-title">{a.title}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {hasDirectors && (
            <div className="profile-card card-surface">
              <div className="profile-card-header">
                <h2 className="profile-card-title">
                  {showAllDirectorsWithClasses ? `All ${rankedDirectors.length} Directors` : 'Top 5 Directors'}
                </h2>
                <button
                  type="button"
                  className="profile-stats-expand-btn profile-tiny-expand-btn"
                  onClick={() => setShowAllDirectorsWithClasses(!showAllDirectorsWithClasses)}
                >
                  {showAllDirectorsWithClasses ? 'Show Top 5' : 'Show all with classes'}
                </button>
              </div>
              {!showAllDirectorsWithClasses ? (
                <Link to="/directors" className="profile-preview-link">
                  View all directors →
                </Link>
              ) : (
                <PageSearch 
                  items={searchableDirectors} 
                  onSelect={handleScrollToId} 
                  placeholder="Search all directors..." 
                  className="profile-section-search"
                  pageKey="profile-directors"
                />
              )}
              {showAllDirectorsWithClasses ? (
                <div className="profile-classes-view">
                  {directorsClassOrder.filter(k => directorsByClass[k]?.length > 0).map((classKey) => (
                    <div key={classKey} className="profile-class-section">
                      <h3 className="profile-class-title">
                        {classKey}
                        {directorsClasses.find((c) => c.key === classKey)?.tagline ? (
                          <span className="profile-class-tagline">
                            {' '}
                            | {directorsClasses.find((c) => c.key === classKey)?.tagline}
                          </span>
                        ) : null}
                      </h3>
                      <div className="profile-class-grid">
                        {directorsByClass[classKey].map((d, i) => {
                          const tmdbId = (d.tmdbId ?? parseInt(d.id.replace(/\D/g, ''), 10)) || 0;
                          return (
                            <div 
                              key={d.id} 
                              id={`profile-entry-${d.id}`}
                              className="profile-top-item profile-top-item--clickable"
                              onClick={() => handleDirectorClick(d)}
                            >
                              <div className="profile-top-poster">
                                {d.profilePath ? (
                                  <img src={tmdbImagePath(d.profilePath) ?? ''} alt={d.title} loading="lazy" />
                                ) : (
                                  <span className="profile-top-poster-placeholder">🎬</span>
                                )}
                                <div className="profile-top-overlay">
                                  <span className="profile-top-overlay-text profile-top-overlay-text--seen">
                                    EDIT
                                  </span>
                                </div>
                              </div>
                              <div className="profile-top-info">
                                <span className="profile-top-title">{d.title}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="profile-top-grid">
                  {top5Directors.map((d: any, i: any) => (
                    <div 
                      key={d.id} 
                      className="profile-top-item profile-top-item--clickable"
                      onClick={() => handleDirectorClick(d)}
                    >
                      <div className="profile-top-poster">
                        {d.profilePath ? (
                          <img src={tmdbImagePath(d.profilePath) ?? ''} alt={d.title} loading="lazy" />
                        ) : (
                          <span className="profile-top-poster-placeholder">🎬</span>
                        )}
                        <span className="profile-top-rank">#{i + 1}</span>
                        <div className="profile-top-overlay">
                          <span className="profile-top-overlay-text profile-top-overlay-text--seen">
                            EDIT
                          </span>
                        </div>
                      </div>
                      <div className="profile-top-info">
                        <span className="profile-top-title">{d.title}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
      </div>

      <div className="profile-split-layout">
        <div className="profile-recent profile-card card-surface">
          <div className="profile-recent-header">
            <h2 className="profile-card-title">Recently watched</h2>
            <span className="profile-recent-count">{recentRange === 'milestones' ? allMilestoneEvents.length : recentWatches.length}</span>
          </div>
          <div className="profile-recent-controls profile-recent-controls--toolbar">
            <div className="profile-recent-toolbar-group profile-recent-toolbar-group--show">
              <span className="profile-recent-label">Show</span>
              <ThemedDropdown
                className="profile-recent-range-dropdown"
                value={recentRange}
                options={PROFILE_RECENT_RANGE_OPTIONS}
                onChange={setRecentRange}
                aria-label="Recently watched date range"
              />
            </div>
            <div className="profile-chart-toggle profile-recent-view-toggle" role="group" aria-label="Recently watched layout">
              <button
                type="button"
                className={`profile-chart-toggle-btn ${recentViewMode === 'tile' ? 'active' : ''}`}
                onClick={() => setRecentViewMode('tile')}
              >
                Tile
              </button>
              <button
                type="button"
                className={`profile-chart-toggle-btn ${recentViewMode === 'chart' ? 'active' : ''}`}
                onClick={() => setRecentViewMode('chart')}
              >
                Chart
              </button>
            </div>
          </div>
          <div className="profile-recent-list">
            {recentRange === 'milestones' ? (
              allMilestoneEvents.length === 0 ? (
                <p className="profile-muted">No milestones yet.</p>
              ) : recentViewMode === 'chart' ? (
                <div className="profile-recent-chart">
                  {allMilestoneEvents.map((ms, i) => {
                    const userStatus = ms.isMovie
                      ? getUserMovieStatus(ms.item.tmdbId || 0)
                      : getUserShowStatus(ms.item.tmdbId || 0);
                    const handleClick = () => {
                      if (ms.isMovie) handleMovieClick(ms.item);
                      else handleShowClick(ms.item);
                    };
                    let displayText: string | null = null;
                    if (userStatus.isRanked) {
                      const globalRanks = ms.isMovie ? moviesGlobalRanks : tvGlobalRanks;
                      displayText = globalRanks.get(ms.item.id)?.percentileRank ?? null;
                    } else if (userStatus.classKey === 'DELICIOUS_GARBAGE') {
                      displayText = 'GARB';
                    } else if (userStatus.classKey === 'BABY') {
                      displayText = 'BABY';
                    } else {
                      displayText = 'N/A';
                    }
                    const barPct = percentileFillWidthFromBadge(displayText);
                    const mediaKind = ms.isMovie ? 'movie' : 'tv';
                    return (
                      <button
                        key={`ms-chart-${ms.item.id}-${ms.recordId ?? ms.sortKey}-${i}`}
                        type="button"
                        className={`profile-recent-chart-row profile-recent-chart-row--${mediaKind} profile-top-item--clickable`}
                        onClick={handleClick}
                      >
                        <div className="profile-recent-chart-row-inner">
                          <div className="profile-recent-chart-thumb" aria-hidden>
                            {getMoviePosterSrc(ms.item) ? (
                              <img src={getMoviePosterSrc(ms.item) ?? ''} alt="" loading="lazy" />
                            ) : (
                              <span className="profile-recent-chart-thumb-fallback">{ms.isMovie ? '🎬' : '📺'}</span>
                            )}
                          </div>
                          <div className="profile-recent-chart-row-main">
                            <div className="profile-recent-chart-row-head">
                              <span className="profile-recent-chart-row-title">{ms.item.title}</span>
                              <span className="profile-recent-chart-row-date">{formatProfileWatchDateLabel(ms.record)}</span>
                            </div>
                            <div className="profile-recent-chart-bar-track" aria-hidden>
                              <div className="profile-recent-chart-bar-fill" style={{ width: `${barPct}%` }} />
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="profile-recent-grid">
                  {allMilestoneEvents.map((ms, i) => {
                    const userStatus = ms.isMovie
                      ? getUserMovieStatus(ms.item.tmdbId || 0)
                      : getUserShowStatus(ms.item.tmdbId || 0);
                    const handleClick = () => {
                      if (ms.isMovie) handleMovieClick(ms.item);
                      else handleShowClick(ms.item);
                    };
                    let displayText = null;
                    if (userStatus.isRanked) {
                      const globalRanks = ms.isMovie ? moviesGlobalRanks : tvGlobalRanks;
                      const rankInfo = globalRanks.get(ms.item.id);
                      displayText = rankInfo?.percentileRank;
                    } else if (userStatus.classKey === 'DELICIOUS_GARBAGE') {
                      displayText = 'GARB';
                    } else if (userStatus.classKey === 'BABY') {
                      displayText = 'BABY';
                    } else {
                      displayText = 'N/A';
                    }
                    return (
                      <div
                        key={`ms-${ms.item.id}-${ms.recordId ?? ms.sortKey}-${i}`}
                        className="profile-recent-tile profile-top-item--clickable"
                        onClick={handleClick}
                      >
                        <div className="profile-recent-tile-poster">
                          {getMoviePosterSrc(ms.item) ? (
                            <img src={getMoviePosterSrc(ms.item) ?? ''} alt="" loading="lazy" />
                          ) : (
                            <span>{ms.isMovie ? '🎬' : '📺'}</span>
                          )}
                          <div className="profile-top-overlay">
                            <span className={userStatus.isRanked ? 'profile-top-overlay-text profile-top-overlay-text--seen' : 'profile-top-overlay-text'}>
                              {userStatus.isRanked ? 'SEEN' : 'SAVE'}
                            </span>
                          </div>
                          {displayText && (
                            <div className={`profile-recent-percentile ${!userStatus.isRanked ? 'profile-recent-percentile--unranked' : ''} ${ms.isMovie ? 'profile-recent-percentile--movie' : 'profile-recent-percentile--tv'}`}>
                              {displayText}
                            </div>
                          )}
                          <div className="profile-recent-milestone">
                            <Award />
                            <span>#{ms.n}</span>
                          </div>
                        </div>
                        <div className="profile-recent-tile-info">
                          <span className="profile-recent-tile-title">{ms.item.title}</span>
                          <span className="profile-recent-tile-date">{formatProfileWatchDateLabel(ms.record)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            ) : recentWatches.length === 0 ? (
              <p className="profile-muted">No watches in this range.</p>
            ) : recentViewMode === 'chart' ? (
              <div className="profile-recent-chart">
                {recentWatches.map((w, i) => {
                  const userStatus = w.isMovie
                    ? getUserMovieStatus(w.item.tmdbId || 0)
                    : getUserShowStatus(w.item.tmdbId || 0);
                  const handleClick = () => {
                    if (w.isMovie) {
                      handleMovieClick(w.item);
                    } else {
                      handleShowClick(w.item);
                    }
                  };

                  let displayText: string | null = null;
                  if (userStatus.isRanked) {
                    const globalRanks = w.isMovie ? moviesGlobalRanks : tvGlobalRanks;
                    displayText = globalRanks.get(w.item.id)?.percentileRank ?? null;
                  } else if (userStatus.classKey === 'DELICIOUS_GARBAGE') {
                    displayText = 'GARB';
                  } else if (userStatus.classKey === 'BABY') {
                    displayText = 'BABY';
                  } else {
                    displayText = 'N/A';
                  }

                  const barPct = percentileFillWidthFromBadge(displayText);
                  const mediaKind = w.isMovie ? 'movie' : 'tv';

                  return (
                    <button
                      key={`${w.item.id}-${w.record.id}-chart-${i}`}
                      type="button"
                      className={`profile-recent-chart-row profile-recent-chart-row--${mediaKind} profile-top-item--clickable`}
                      onClick={handleClick}
                    >
                      <div className="profile-recent-chart-row-inner">
                        <div className="profile-recent-chart-thumb" aria-hidden>
                          {getMoviePosterSrc(w.item) ? (
                            <img src={getMoviePosterSrc(w.item) ?? ''} alt="" loading="lazy" />
                          ) : (
                            <span className="profile-recent-chart-thumb-fallback">{w.isMovie ? '🎬' : '📺'}</span>
                          )}
                        </div>
                        <div className="profile-recent-chart-row-main">
                          <div className="profile-recent-chart-row-head">
                            <span className="profile-recent-chart-row-title">{w.item.title}</span>
                            <span className="profile-recent-chart-row-date">{formatProfileWatchDateLabel(w.record)}</span>
                          </div>
                          <div className="profile-recent-chart-bar-track" aria-hidden>
                            <div className="profile-recent-chart-bar-fill" style={{ width: `${barPct}%` }} />
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="profile-recent-grid">
                {recentWatches.map((w, i) => {
                  const userStatus = w.isMovie
                    ? getUserMovieStatus(w.item.tmdbId || 0)
                    : getUserShowStatus(w.item.tmdbId || 0);
                  const handleClick = () => {
                    if (w.isMovie) {
                      handleMovieClick(w.item);
                    } else {
                      handleShowClick(w.item);
                    }
                  };

                  // Get percentile ranking or special class text
                  let displayText = null;
                  if (userStatus.isRanked) {
                    const globalRanks = w.isMovie ? moviesGlobalRanks : tvGlobalRanks;
                    const rankInfo = globalRanks.get(w.item.id);
                    displayText = rankInfo?.percentileRank;
                  } else if (userStatus.classKey === 'DELICIOUS_GARBAGE') {
                    displayText = 'GARB';
                  } else if (userStatus.classKey === 'BABY') {
                    displayText = 'BABY';
                  } else {
                    displayText = 'N/A';
                  }

                  return (
                    <div
                      key={`${w.item.id}-${w.record.id}-${i}`}
                      className="profile-recent-tile profile-top-item--clickable"
                      onClick={handleClick}
                    >
                      <div className="profile-recent-tile-poster">
                        {getMoviePosterSrc(w.item) ? (
                          <img src={getMoviePosterSrc(w.item) ?? ''} alt="" loading="lazy" />
                        ) : (
                          <span>{w.isMovie ? '🎬' : '📺'}</span>
                        )}
                        <div className="profile-top-overlay">
                          <span className={userStatus.isRanked ? 'profile-top-overlay-text profile-top-overlay-text--seen' : 'profile-top-overlay-text'}>
                            {userStatus.isRanked ? 'SEEN' : 'SAVE'}
                          </span>
                        </div>
                        {displayText && (
                          <div className={`profile-recent-percentile ${!userStatus.isRanked ? 'profile-recent-percentile--unranked' : ''} ${w.isMovie ? 'profile-recent-percentile--movie' : 'profile-recent-percentile--tv'}`}>
                            {displayText}
                          </div>
                        )}
                        {(() => {
                          const ms = uniqueWatchMilestones.get(watchEventKey(w));
                          if (!ms) return null;
                          return (
                            <div className="profile-recent-milestone">
                              <Award />
                              <span>#{ms.n}</span>
                            </div>
                          );
                        })()}
                      </div>
                      <div className="profile-recent-tile-info">
                        <span className="profile-recent-tile-title">{w.item.title}</span>
                        <span className="profile-recent-tile-date">{formatProfileWatchDateLabel(w.record)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <ProfileWatchlist 
          isOwnProfile={true}
          showFriendOverlapButton={!!user}
          onMovieClick={(entry) => {
            const tmdbId = (entry.id.includes('-') ? parseInt(entry.id.split('-').pop() || '0', 10) : parseInt(entry.id.replace(/\D/g, ''), 10)) || 0;
            const movie = {
              id: entry.id,
              tmdbId,
              title: entry.title,
              posterPath: entry.posterPath,
              releaseDate: entry.releaseDate,
              classKey: '',
            } as MovieShowItem;
            handleMovieClick(movie);
          }}
          onShowClick={(entry) => {
            const tmdbId = (entry.id.includes('-') ? parseInt(entry.id.split('-').pop() || '0', 10) : parseInt(entry.id.replace(/\D/g, ''), 10)) || 0;
            const show = {
              id: entry.id,
              tmdbId,
              title: entry.title,
              posterPath: entry.posterPath,
              releaseDate: entry.releaseDate,
              classKey: '',
            } as MovieShowItem;
            handleShowClick(show);
          }}
          getUserMovieStatus={getUserMovieStatus}
          getUserShowStatus={getUserShowStatus}
        />
      </div>

      {rankingTarget && (
        <UniversalEditModal
          target={rankingTarget}
          rankedClasses={rankingTarget.mediaType === 'movie' ? movieClasses : tvClasses}
          initialWatches={
            rankingTarget.mediaType === 'movie'
              ? (() => {
                  const tmdbId = (rankingTarget.tmdbId ?? parseInt(rankingTarget.id.replace(/\D/g, ''), 10)) || 0;
                  const status = getUserMovieStatus(tmdbId);
                  return status.watchRecords;
                })()
              : (() => {
                  const tmdbId = (rankingTarget.tmdbId ?? parseInt(rankingTarget.id.replace(/\D/g, ''), 10)) || 0;
                  const status = getUserShowStatus(tmdbId);
                  return status.watchRecords;
                })()
          }
          currentClassKey={rankingTarget.existingClassKey}
          currentClassLabel={
            rankingTarget.mediaType === 'movie'
              ? (rankingTarget.existingClassKey ? getMovieClassLabel(rankingTarget.existingClassKey) : undefined)
              : (rankingTarget.existingClassKey ? getTvClassLabel(rankingTarget.existingClassKey) : undefined)
          }
          isWatchlistItem={isInWatchlist(rankingTarget.id)}
          availableTags={getEditableListsForMediaType(rankingTarget.mediaType === 'movie' ? 'movie' : 'tv').map((list) => ({
            listId: list.id,
            label: list.name,
            color: list.color,
            selected: getSelectedListIdsForEntry(rankingTarget.id).includes(list.id),
            href: `/lists/${list.id}`,
          }))}
          collectionTags={(collectionIdsByEntryId.get(rankingTarget.id) ?? []).map((id) => ({
            id,
            label: globalCollections.find((c) => c.id === id)?.name ?? id,
            color: globalCollections.find((c) => c.id === id)?.color,
            href: `/lists/collection/${id}`,
          }))}
          onTagToggle={(listId, selected) => {
            setEntryListMembership(rankingTarget.id, rankingTarget.mediaType === 'movie' ? 'movie' : 'tv', [{ listId, selected }]);
          }}
          onAddToWatchlist={() => {
            const entry = {
              id: rankingTarget.id,
              title: rankingTarget.title,
              posterPath: rankingTarget.posterPath,
              releaseDate: rankingTarget.releaseDate,
            };
            addToWatchlist(entry, rankingTarget.mediaType === 'movie' ? 'movies' : 'tv');
          }}
          onRemoveFromWatchlist={() => {
            removeFromWatchlist(rankingTarget.id);
          }}
          onGoToWatchlist={() => {
            navigate('/watchlist', { state: { scrollToId: rankingTarget.id } });
          }}
          onGoPickTemplate={() => {
            const mt = rankingTarget.mediaType;
            setRankingTarget(null);
            navigate(mt === 'movie' ? '/movies#movie-class-templates' : '/tv#tv-class-templates', { replace: true });
          }}
          onSave={handleRankingSave}
          onClose={() => setRankingTarget(null)}
          onRemoveEntry={handleRemoveEntry}
          isSaving={isRankingSaving}
        />
      )}

      {/* Person Ranking Modal for Actors/Directors */}
      {personRankingTarget && (
        <PersonRankingModal
          target={personRankingTarget}
          rankedClasses={personRankingTarget.mediaType === 'actor' ? peopleClasses : directorsClasses}
          currentClassKey={personRankingTarget.existingClassKey}
          currentClassLabel={personRankingTarget.existingClassKey ? 
            (personRankingTarget.mediaType === 'actor' ? 
              peopleClasses.find(c => c.key === personRankingTarget.existingClassKey)?.label :
              directorsClasses.find(c => c.key === personRankingTarget.existingClassKey)?.label
            ) : undefined
          }
          onSave={handlePersonRankingSave}
          onClose={() => setPersonRankingTarget(null)}
          onRemoveEntry={handleRemovePersonEntry}
          onGoPickTemplate={() => {
            const mt = personRankingTarget.mediaType;
            setPersonRankingTarget(null);
            navigate(
              mt === 'director' ? '/directors#directors-class-templates' : '/actors#actors-class-templates',
              { replace: true }
            );
          }}
          isSaving={isPersonRankingSaving}
        />
      )}
    </section>
  );
}
