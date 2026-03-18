import { useMemo, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { RandomQuote } from '../components/RandomQuote';
import {
  useMoviesStore,
  getTotalMinutesFromRecords,
  getTotalEpisodesFromRecords,
  formatDuration,
  getWatchRecordSortKey,
  formatWatchLabel
} from '../state/moviesStore';
import { useTvStore } from '../state/tvStore';
import { useWatchlistStore } from '../state/watchlistStore';
import { usePeopleStore, type PersonItem } from '../state/peopleStore';
import { useDirectorsStore, type DirectorItem } from '../state/directorsStore';
import type { MovieShowItem, WatchRecord } from '../components/EntryRowMovieShow';
import { UniversalEditModal, type UniversalEditTarget } from '../components/UniversalEditModal';
import { PersonRankingModal, type PersonRankingTarget, type PersonRankingSaveParams } from '../components/PersonRankingModal';
import { tmdbImagePath, getMovieImageSrc, isBigMovie } from '../lib/tmdb';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { ProfileWatchlist } from '../components/ProfileWatchlist';
import { PageSearch } from '../components/PageSearch';
import './ProfilePage.css';
import '../components/ProfileSplitLayout.css';

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
  return out.sort((a, b) => b.sortKey.localeCompare(a.sortKey));
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

export function ProfilePage() {
  const navigate = useNavigate();
  const [rankingTarget, setRankingTarget] = useState<UniversalEditTarget | null>(null);
  const [isRankingSaving, setIsRankingSaving] = useState(false);
  const [personRankingTarget, setPersonRankingTarget] = useState<PersonRankingTarget | null>(null);
  const [isPersonRankingSaving, setIsPersonRankingSaving] = useState(false);

  const {
    byClass: moviesByClass,
    classOrder: movieClassOrder,
    isRankedClass: isRankedMovieClass,
    getClassLabel: getMovieClassLabel,
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

  const [recentRange, setRecentRange] = useState<'this_year' | 'last_month' | 'last_year' | 'all_time'>('this_year');
  const [showExpandedStats, setShowExpandedStats] = useState(false);
  const [chartMode, setChartMode] = useState<'count' | 'time'>('count');
  const [showAllMoviesWithClasses, setShowAllMoviesWithClasses] = useState(false);
  const [showAllShowsWithClasses, setShowAllShowsWithClasses] = useState(false);
  const [showAllActorsWithClasses, setShowAllActorsWithClasses] = useState(false);
  const [showAllDirectorsWithClasses, setShowAllDirectorsWithClasses] = useState(false);

  const rankedMovies = useMemo(() => {
    const list: MovieShowItem[] = [];
    for (const k of movieClassOrder) {
      if (!isRankedMovieClass(k)) continue;
      for (const item of moviesByClass[k] ?? []) list.push(item);
    }
    return list;
  }, [moviesByClass, movieClassOrder, isRankedMovieClass]);

  const rankedShows = useMemo(() => {
    const list: MovieShowItem[] = [];
    for (const k of tvClassOrder) {
      if (!isRankedTvClass(k)) continue;
      for (const item of tvByClass[k] ?? []) list.push(item);
    }
    return list;
  }, [tvByClass, tvClassOrder, isRankedTvClass]);

  const stats = useMemo(() => {
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
        const items = moviesByClass[k] ?? [];
        const watchTime = items.reduce((sum, item) => 
          sum + getTotalMinutesFromRecords(item.watchRecords ?? [], item.runtimeMinutes), 0
        );
        return {
          key: k,
          count: items.length,
          watchTime
        };
      });

    const tvRankedCategories = tvClassOrder
      .filter(k => isRankedTvClass(k))
      .map(k => {
        const items = tvByClass[k] ?? [];
        const watchTime = items.reduce((sum, item) => 
          sum + getTotalMinutesFromRecords(item.watchRecords ?? [], item.runtimeMinutes), 0
        );
        return {
          key: k,
          count: items.length,
          watchTime
        };
      });

    // Calculate release year distribution
    const movieReleaseYearData: { year: number; count: number }[] = [];
    const movieYearCounts: Record<number, number> = {};
    for (const k of movieClassOrder) {
      for (const item of moviesByClass[k] ?? []) {
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
      for (const item of tvByClass[k] ?? []) {
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
    let movieTotalWatches = 0;
    let movieDNFCount = 0;
    let movieRewatchCount = 0;
    for (const k of movieClassOrder) {
      for (const item of moviesByClass[k] ?? []) {
        const watches = item.watchRecords ?? [];
        movieTotalWatches += watches.length;
        movieDNFCount += watches.filter(r => (r.type ?? 'DATE') === 'DNF').length;
        if (watches.length > 1) {
          movieRewatchCount += watches.length - 1;
        }
      }
    }

    let tvTotalWatches = 0;
    let tvDNFCount = 0;
    let tvRewatchCount = 0;
    for (const k of tvClassOrder) {
      for (const item of tvByClass[k] ?? []) {
        const watches = item.watchRecords ?? [];
        tvTotalWatches += watches.length;
        tvDNFCount += watches.filter(r => (r.type ?? 'DATE') === 'DNF').length;
        if (watches.length > 1) {
          tvRewatchCount += watches.length - 1;
        }
      }
    }

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
          avgRuntime,
          count: items.length
        };
      });

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
      movieTotalWatches,
      movieDNFCount,
      movieRewatchCount,
      tvTotalWatches,
      tvDNFCount,
      tvRewatchCount,
      avgWatchtimePerMovie,
      avgWatchtimePerShow,
      movieAvgRuntimeByCategory,
      showAvgRuntimeByCategory
    };
  }, [moviesByClass, tvByClass, movieClassOrder, tvClassOrder, peopleByClass, peopleClassOrder, directorsByClass, directorsClassOrder, isRankedMovieClass, isRankedTvClass]);

  const recentWatches = useMemo(() => {
    const all = getRecentWatches(moviesByClass, tvByClass, movieClassOrder, tvClassOrder);
    const range = getDateRangeFilter(recentRange);
    if (!range) return all;
    return all.filter((w) => w.sortKey >= range.min && w.sortKey <= range.max);
  }, [moviesByClass, tvByClass, movieClassOrder, tvClassOrder, recentRange]);

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
    for (const k of movieClassOrder) {
      if (isRankedMovieClass(k)) {
        for (const item of moviesByClass[k] ?? []) list.push(item);
      }
    }
    return list.slice(0, 10);
  }, [moviesByClass, movieClassOrder, isRankedMovieClass]);

  const top10Shows = useMemo(() => {
    const list: MovieShowItem[] = [];
    for (const k of tvClassOrder) {
      if (isRankedTvClass(k)) {
        for (const item of tvByClass[k] ?? []) list.push(item);
      }
    }
    return list.slice(0, 10);
  }, [tvByClass, tvClassOrder, isRankedTvClass]);

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
      
      if (rankingTarget.mediaType === 'movie') {
        const status = getUserMovieStatus(tmdbId);
        
        // Convert WatchMatrixEntry[] to WatchRecord[]
        const records: WatchRecord[] = params.watches.map((w: any) => ({
          id: w.id || crypto.randomUUID(),
          type: w.watchType === 'LONG_AGO' ? 'LONG_AGO' : w.watchType === 'DATE_RANGE' ? 'RANGE' : w.watchStatus === 'WATCHING' ? 'CURRENT' : w.watchStatus === 'DNF' ? 'DNF' : 'DATE',
          year: w.year,
          month: w.month,
          day: w.day,
          endYear: w.endYear,
          endMonth: w.endMonth,
          endDay: w.endDay,
          dnfPercent: w.watchPercent < 100 ? w.watchPercent : undefined,
        }));

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
        
        const records: WatchRecord[] = params.watches.map((w: any) => ({
          id: w.id || crypto.randomUUID(),
          type: w.watchType === 'LONG_AGO' ? 'LONG_AGO' : w.watchType === 'DATE_RANGE' ? 'RANGE' : w.watchStatus === 'WATCHING' ? 'CURRENT' : w.watchStatus === 'DNF' ? 'DNF' : 'DATE',
          year: w.year,
          month: w.month,
          day: w.day,
          endYear: w.endYear,
          endMonth: w.endMonth,
          endDay: w.endDay,
          dnfPercent: w.watchPercent < 100 ? w.watchPercent : undefined,
        }));

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
      
      if (goToMedia) {
        // Navigate and then scroll to the item
        const targetPath = rankingTarget.mediaType === 'movie' ? '/movies' : '/tv';
        navigate(targetPath, { state: { scrollToId: rankingTarget.id } });
      }
    } finally {
      setIsRankingSaving(false);
      setRankingTarget(null);
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
          <p className="profile-chart-tooltip-category">{data.key}</p>
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

  // Format date for recently watched
  const formatWatchDate = (record: WatchRecord) => {
    if (!record.year) return 'Unknown date';
    
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 
                   'July', 'August', 'September', 'October', 'November', 'December'];
    
    if (record.month) {
      const monthName = months[record.month - 1];
      if (record.day) {
        return `${monthName} ${record.day}, ${record.year}`;
      }
      return `${monthName} ${record.year}`;
    }
    
    return `Sometime ${record.year}`;
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

  return (
    <section>
      <header className="page-heading">
        <div>
          <h1 className="page-title">Profile</h1>
          <RandomQuote />
        </div>
      </header>

      <div className="profile-stats profile-card card-surface">
        <div className="profile-stats-header">
          <h2 className="profile-card-title">Quick stats</h2>
          <button
            type="button"
            className="profile-stats-expand-btn"
            onClick={() => setShowExpandedStats(!showExpandedStats)}
          >
            {showExpandedStats ? '▼' : '▶'} Detailed stats
          </button>
        </div>
        
        <div className="profile-stats-top-row">
          <div className="profile-stat">
            <span className="profile-stat-value profile-stat-value--hero">{formatDuration(stats.totalMinutes)}</span>
            <span className="profile-stat-label">Total watch time</span>
          </div>
          <div className="profile-stat">
            <span className="profile-stat-value profile-stat-value--hero">{stats.moviesSeen}</span>
            <span className="profile-stat-label">Movies seen</span>
          </div>
          <div className="profile-stat">
            <span className="profile-stat-value profile-stat-value--hero">{stats.showsSeen}</span>
            <span className="profile-stat-label">Shows seen</span>
          </div>
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
                <span className="profile-stat-value">{stats.movieTotalWatches > 0 ? Math.round((stats.movieDNFCount / stats.movieTotalWatches) * 100) : 0}%</span>
                <span className="profile-stat-label">Movie DNF rate</span>
              </div>
              <div className="profile-stat">
                <span className="profile-stat-value">{stats.movieTotalWatches > 0 ? Math.round((stats.movieRewatchCount / stats.movieTotalWatches) * 100) : 0}%</span>
                <span className="profile-stat-label">Movie rewatch rate</span>
              </div>
              <div className="profile-stat">
                <span className="profile-stat-value">{stats.tvTotalWatches > 0 ? Math.round((stats.tvDNFCount / stats.tvTotalWatches) * 100) : 0}%</span>
                <span className="profile-stat-label">Show DNF rate</span>
              </div>
              <div className="profile-stat">
                <span className="profile-stat-value">{stats.tvTotalWatches > 0 ? Math.round((stats.tvRewatchCount / stats.tvTotalWatches) * 100) : 0}%</span>
                <span className="profile-stat-label">Show rewatch rate</span>
              </div>
            </div>

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
                    <XAxis dataKey="key" stroke="rgba(255,255,255,0.5)" angle={-45} textAnchor="end" height={80} />
                    <YAxis stroke="rgba(255,255,255,0.5)" />
                    <Tooltip content={<CategoryTooltip />} />
                    <Bar dataKey={chartMode === 'time' ? 'watchTime' : 'count'} fill="var(--accent)">
                      {stats.movieRankedCategories.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={`hsl(${30 + index * 40}, 70%, 60%)`} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="profile-chart-section">
                <div className="profile-chart-header">
                  <h3 className="profile-chart-title">Shows by Ranked Category</h3>
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
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={stats.tvRankedCategories}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                    <XAxis dataKey="key" stroke="rgba(255,255,255,0.5)" angle={-45} textAnchor="end" height={80} />
                    <YAxis stroke="rgba(255,255,255,0.5)" />
                    <Tooltip content={<CategoryTooltip />} />
                    <Bar dataKey={chartMode === 'time' ? 'watchTime' : 'count'} fill="var(--accent)">
                      {stats.tvRankedCategories.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={`hsl(${200 + index * 40}, 70%, 60%)`} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="profile-chart-section">
                <h3 className="profile-chart-title">Movies by Release Year</h3>
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
                <h3 className="profile-chart-title">Shows by Release Year</h3>
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

              <div className="profile-chart-section">
                <h3 className="profile-chart-title">Avg Total Runtime per Movie Category</h3>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={stats.movieAvgRuntimeByCategory}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                    <XAxis dataKey="key" stroke="rgba(255,255,255,0.5)" angle={-45} textAnchor="end" height={80} />
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
                    <Bar dataKey="avgRuntime" fill="var(--accent)">
                      {stats.movieAvgRuntimeByCategory.map((entry: any, index: number) => (
                        <Cell key={`cell-${index}`} fill={`hsl(${30 + index * 40}, 70%, 60%)`} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="profile-chart-section">
                <h3 className="profile-chart-title">Avg Total Runtime per Show Category</h3>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={stats.showAvgRuntimeByCategory}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                    <XAxis dataKey="key" stroke="rgba(255,255,255,0.5)" angle={-45} textAnchor="end" height={80} />
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
                    <Bar dataKey="avgRuntime" fill="var(--accent)">
                      {stats.showAvgRuntimeByCategory.map((entry: any, index: number) => (
                        <Cell key={`cell-${index}`} fill={`hsl(${200 + index * 40}, 70%, 60%)`} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="profile-grid">
        <div className="profile-card card-surface">
          <div className="profile-card-header">
            <h2 className="profile-card-title">
              {showAllMoviesWithClasses ? `All ${rankedMovies.length} Movies` : 'Top 10 Movies'}
            </h2>
            <button
              type="button"
              className="profile-stats-expand-btn profile-tiny-expand-btn"
              onClick={() => setShowAllMoviesWithClasses(!showAllMoviesWithClasses)}
            >
              {showAllMoviesWithClasses ? 'Show Top 10' : 'Show all with classes'}
            </button>
          </div>
          {!showAllMoviesWithClasses ? (
            <Link to="/movies" className="profile-preview-link">
              View all movies →
            </Link>
          ) : (
            <PageSearch 
              items={searchableMovies} 
              onSelect={handleScrollToId} 
              placeholder="Search all movies..." 
              className="profile-section-search"
              pageKey="profile-movies"
            />
          )}
          {showAllMoviesWithClasses ? (
            <div className="profile-classes-view">
              {movieClassOrder.filter(k => isRankedMovieClass(k) && moviesByClass[k]?.length > 0).map((classKey) => (
                <div key={classKey} className="profile-class-section">
                  <h3 className="profile-class-title">{getMovieClassLabel(classKey)}</h3>
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
                            {getMovieImageSrc(m.posterPath, m.title, m.tmdbId) ? (
                              <img src={getMovieImageSrc(m.posterPath, m.title, m.tmdbId) ?? ''} alt={m.title} loading="lazy" />
                            ) : (
                              <span className="profile-top-poster-placeholder">{isBigMovie(m.title, m.tmdbId) ? 'B' : '🎬'}</span>
                            )}
                            <div className="profile-top-overlay">
                              <span className={userStatus.isRanked ? 'profile-top-overlay-text profile-top-overlay-text--seen' : 'profile-top-overlay-text'}>
                                {userStatus.isRanked ? 'SEEN' : 'SAVE'}
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
                      {getMovieImageSrc(m.posterPath, m.title, m.tmdbId) ? (
                        <img src={getMovieImageSrc(m.posterPath, m.title, m.tmdbId) ?? ''} alt={m.title} loading="lazy" />
                      ) : (
                        <span className="profile-top-poster-placeholder">{isBigMovie(m.title, m.tmdbId) ? 'B' : '🎬'}</span>
                      )}
                      <span className="profile-top-rank">#{i + 1}</span>
                      <div className="profile-top-overlay">
                        <span className={userStatus.isRanked ? 'profile-top-overlay-text profile-top-overlay-text--seen' : 'profile-top-overlay-text'}>
                          {userStatus.isRanked ? 'SEEN' : 'SAVE'}
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
              {showAllShowsWithClasses ? `All ${rankedShows.length} Shows` : 'Top 10 Shows'}
            </h2>
            <button
              type="button"
              className="profile-stats-expand-btn profile-tiny-expand-btn"
              onClick={() => setShowAllShowsWithClasses(!showAllShowsWithClasses)}
            >
              {showAllShowsWithClasses ? 'Show Top 10' : 'Show all with classes'}
            </button>
          </div>
          {!showAllShowsWithClasses ? (
            <Link to="/tv" className="profile-preview-link">
              View all shows →
            </Link>
          ) : (
            <PageSearch 
              items={searchableShows} 
              onSelect={handleScrollToId} 
              placeholder="Search all shows..." 
              className="profile-section-search"
              pageKey="profile-shows"
            />
          )}
          {showAllShowsWithClasses ? (
            <div className="profile-classes-view">
              {tvClassOrder.filter(k => isRankedTvClass(k) && tvByClass[k]?.length > 0).map((classKey) => (
                <div key={classKey} className="profile-class-section">
                  <h3 className="profile-class-title">{getTvClassLabel(classKey)}</h3>
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
                              <span className={userStatus.isRanked ? 'profile-top-overlay-text profile-top-overlay-text--seen' : 'profile-top-overlay-text'}>
                                {userStatus.isRanked ? 'SEEN' : 'SAVE'}
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
                        <span className={userStatus.isRanked ? 'profile-top-overlay-text profile-top-overlay-text--seen' : 'profile-top-overlay-text'}>
                          {userStatus.isRanked ? 'SEEN' : 'SAVE'}
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
        <div className="profile-grid">
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
                      <h3 className="profile-class-title">{classKey}</h3>
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
                      <h3 className="profile-class-title">{classKey}</h3>
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

      <div className="profile-split-layout">
        <div className="profile-recent profile-card card-surface">
          <div className="profile-recent-header">
            <h2 className="profile-card-title">Recently watched</h2>
            <span className="profile-recent-count">{recentWatches.length}</span>
          </div>
          <div className="profile-recent-controls">
            <span className="profile-recent-label">Show:</span>
            {(
              [
                { value: 'this_year' as const, label: 'This year' },
                { value: 'last_month' as const, label: 'In the last month' },
                { value: 'last_year' as const, label: 'In the last year' },
                { value: 'all_time' as const, label: 'All time' }
              ]
            ).map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={`profile-recent-btn ${recentRange === opt.value ? 'profile-recent-btn--active' : ''}`}
                onClick={() => setRecentRange(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <div className="profile-recent-list">
            {recentWatches.length === 0 ? (
              <p className="profile-muted">No watches in this range.</p>
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
                        {getMovieImageSrc(w.item.posterPath, w.item.title, w.item.tmdbId) ? (
                          <img src={getMovieImageSrc(w.item.posterPath, w.item.title, w.item.tmdbId) ?? ''} alt="" loading="lazy" />
                        ) : (
                          <span>{isBigMovie(w.item.title, w.item.tmdbId) ? 'B' : (w.isMovie ? '🎬' : '📺')}</span>
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
                      </div>
                      <div className="profile-recent-tile-info">
                        <span className="profile-recent-tile-title">{w.item.title}</span>
                        <span className="profile-recent-tile-date">
                          {formatWatchDate(w.record)}
                        </span>
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
          isSaving={isPersonRankingSaving}
        />
      )}
    </section>
  );
}
