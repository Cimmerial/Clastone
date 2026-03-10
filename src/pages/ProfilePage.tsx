import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
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
import { usePeopleStore } from '../state/peopleStore';
import { useDirectorsStore } from '../state/directorsStore';
import type { MovieShowItem, WatchRecord } from '../components/EntryRowMovieShow';
import { tmdbImagePath } from '../lib/tmdb';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import './ProfilePage.css';

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
  const {
    byClass: moviesByClass,
    classOrder: movieClassOrder,
    isRankedClass: isRankedMovieClass
  } = useMoviesStore();
  const {
    byClass: tvByClass,
    classOrder: tvClassOrder,
    isRankedClass: isRankedTvClass
  } = useTvStore();
  const {
    byClass: peopleByClass,
    classOrder: peopleClassOrder
  } = usePeopleStore();
  const {
    byClass: directorsByClass,
    classOrder: directorsClassOrder
  } = useDirectorsStore();

  const [recentRange, setRecentRange] = useState<'this_year' | 'last_month' | 'last_year' | 'all_time'>('this_year');
  const [showExpandedStats, setShowExpandedStats] = useState(false);
  const [watchGraphMode, setWatchGraphMode] = useState<'count' | 'time'>('count');

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
      tvRewatchCount
    };
  }, [moviesByClass, tvByClass, movieClassOrder, tvClassOrder, peopleByClass, peopleClassOrder, directorsByClass, directorsClassOrder, isRankedMovieClass, isRankedTvClass]);

  const recentWatches = useMemo(() => {
    const all = getRecentWatches(moviesByClass, tvByClass, movieClassOrder, tvClassOrder);
    const range = getDateRangeFilter(recentRange);
    if (!range) return all;
    return all.filter((w) => w.sortKey >= range.min && w.sortKey <= range.max);
  }, [moviesByClass, tvByClass, movieClassOrder, tvClassOrder, recentRange]);

  const top10Movies = rankedMovies.slice(0, 10);
  const top10Shows = rankedShows.slice(0, 10);

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
          {watchGraphMode === 'time' && (
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
                      className={`profile-chart-toggle-btn ${watchGraphMode === 'count' ? 'active' : ''}`}
                      onClick={() => setWatchGraphMode('count')}
                    >
                      Count
                    </button>
                    <button
                      type="button"
                      className={`profile-chart-toggle-btn ${watchGraphMode === 'time' ? 'active' : ''}`}
                      onClick={() => setWatchGraphMode('time')}
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
                    <Bar dataKey={watchGraphMode === 'count' ? 'count' : 'watchTime'} fill="var(--accent)" />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="profile-chart-section">
                <div className="profile-chart-header">
                  <h3 className="profile-chart-title">Shows Watched by Year</h3>
                  <div className="profile-chart-toggle">
                    <button
                      type="button"
                      className={`profile-chart-toggle-btn ${watchGraphMode === 'count' ? 'active' : ''}`}
                      onClick={() => setWatchGraphMode('count')}
                    >
                      Count
                    </button>
                    <button
                      type="button"
                      className={`profile-chart-toggle-btn ${watchGraphMode === 'time' ? 'active' : ''}`}
                      onClick={() => setWatchGraphMode('time')}
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
                    <Bar dataKey={watchGraphMode === 'count' ? 'count' : 'watchTime'} fill="var(--accent)" />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="profile-chart-section">
                <h3 className="profile-chart-title">Movies by Ranked Category</h3>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={stats.movieRankedCategories}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                    <XAxis dataKey="key" stroke="rgba(255,255,255,0.5)" angle={-45} textAnchor="end" height={80} />
                    <YAxis stroke="rgba(255,255,255,0.5)" />
                    <Tooltip content={<CategoryTooltip />} />
                    <Bar dataKey="count" fill="var(--accent)">
                      {stats.movieRankedCategories.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={`hsl(${30 + index * 40}, 70%, 60%)`} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="profile-chart-section">
                <h3 className="profile-chart-title">Shows by Ranked Category</h3>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={stats.tvRankedCategories}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                    <XAxis dataKey="key" stroke="rgba(255,255,255,0.5)" angle={-45} textAnchor="end" height={80} />
                    <YAxis stroke="rgba(255,255,255,0.5)" />
                    <Tooltip content={<CategoryTooltip />} />
                    <Bar dataKey="count" fill="var(--accent)">
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
            </div>
          </div>
        )}
      </div>

      <div className="profile-grid">
        <div className="profile-card card-surface">
          <h2 className="profile-card-title">Top 10 Movies</h2>
          <Link to="/movies" className="profile-preview-link">
            View all movies →
          </Link>
          <div className="profile-top-grid">
            {top10Movies.map((m: any, i: any) => (
              <div key={m.id} className="profile-top-item">
                <div className="profile-top-poster">
                  {m.posterPath ? (
                    <img src={tmdbImagePath(m.posterPath) ?? ''} alt={m.title} loading="lazy" />
                  ) : (
                    <span className="profile-top-poster-placeholder">🎬</span>
                  )}
                  <span className="profile-top-rank">#{i + 1}</span>
                </div>
                <div className="profile-top-info">
                  <span className="profile-top-title">{m.title}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="profile-card card-surface">
          <h2 className="profile-card-title">Top 10 Shows</h2>
          <Link to="/tv" className="profile-preview-link">
            View all shows →
          </Link>
          <div className="profile-top-grid">
            {top10Shows.map((s: any, i: any) => (
              <div key={s.id} className="profile-top-item">
                <div className="profile-top-poster">
                  {s.posterPath ? (
                    <img src={tmdbImagePath(s.posterPath) ?? ''} alt={s.title} loading="lazy" />
                  ) : (
                    <span className="profile-top-poster-placeholder">📺</span>
                  )}
                  <span className="profile-top-rank">#{i + 1}</span>
                </div>
                <div className="profile-top-info">
                  <span className="profile-top-title">{s.title}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="profile-recent profile-card card-surface profile-card-wide">
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
              {recentWatches.map((w, i) => (
                <div key={`${w.item.id}-${w.record.id}-${i}`} className="profile-recent-tile">
                  <div className="profile-recent-tile-poster">
                    {w.item.posterPath ? (
                      <img src={tmdbImagePath(w.item.posterPath) ?? ''} alt="" loading="lazy" />
                    ) : (
                      <span>{w.isMovie ? '🎬' : '📺'}</span>
                    )}
                  </div>
                  <div className="profile-recent-tile-info">
                    <span className="profile-recent-tile-title">{w.item.title}</span>
                    <span className="profile-recent-tile-date">
                      {formatWatchDate(w.record)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
