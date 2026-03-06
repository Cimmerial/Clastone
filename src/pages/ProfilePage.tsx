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
import type { MovieShowItem, WatchRecord } from '../components/EntryRowMovieShow';
import { tmdbImagePath } from '../lib/tmdb';
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

  const [recentRange, setRecentRange] = useState<'this_year' | 'last_month' | 'last_year' | 'all_time'>('this_year');

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
      avgMovieYear: avgMovie,
      avgShowYear: avgShow,
      avgBothYear: avgBoth
    };
  }, [moviesByClass, tvByClass, movieClassOrder, tvClassOrder]);

  const recentWatches = useMemo(() => {
    const all = getRecentWatches(moviesByClass, tvByClass, movieClassOrder, tvClassOrder);
    const range = getDateRangeFilter(recentRange);
    if (!range) return all;
    return all.filter((w) => w.sortKey >= range.min && w.sortKey <= range.max);
  }, [moviesByClass, tvByClass, movieClassOrder, tvClassOrder, recentRange]);

  const top5Movies = rankedMovies.slice(0, 5);
  const top5Shows = rankedShows.slice(0, 5);

  return (
    <section>
      <header className="page-heading">
        <div>
          <h1 className="page-title">Profile</h1>
          <RandomQuote />
        </div>
      </header>

      <div className="profile-stats profile-card card-surface">
        <h2 className="profile-card-title">Quick stats</h2>
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
        </div>
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
            <span className="profile-stat-value">{stats.avgMovieYear ?? '—'}</span>
            <span className="profile-stat-label">Avg release year (movies)</span>
          </div>
          <div className="profile-stat">
            <span className="profile-stat-value">{stats.avgShowYear ?? '—'}</span>
            <span className="profile-stat-label">Avg release year (shows)</span>
          </div>
          <div className="profile-stat">
            <span className="profile-stat-value">{stats.avgBothYear ?? '—'}</span>
            <span className="profile-stat-label">Avg release year (all)</span>
          </div>
        </div>
      </div>

      <div className="profile-grid">
        <div className="profile-card card-surface">
          <h2 className="profile-card-title">Top 5 Movies</h2>
          <Link to="/movies" className="profile-preview-link">
            View all movies →
          </Link>
          <ol className="profile-list">
            {top5Movies.map((m, i) => (
              <li key={m.id} className="profile-list-item">
                <span className="profile-rank">#{i + 1}</span>
                <span className="profile-name">{m.title}</span>
              </li>
            ))}
          </ol>
        </div>

        <div className="profile-card card-surface">
          <h2 className="profile-card-title">Top 5 Shows</h2>
          <Link to="/tv" className="profile-preview-link">
            View all shows →
          </Link>
          <ol className="profile-list">
            {top5Shows.map((s, i) => (
              <li key={s.id} className="profile-list-item">
                <span className="profile-rank">#{i + 1}</span>
                <span className="profile-name">{s.title}</span>
              </li>
            ))}
          </ol>
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
            <ul className="profile-recent-ul">
              {recentWatches.map((w, i) => (
                <li key={`${w.item.id}-${w.record.id}-${i}`} className="profile-recent-item">
                  <div className="profile-recent-poster">
                    {w.item.posterPath ? (
                      <img src={tmdbImagePath(w.item.posterPath) ?? ''} alt="" loading="lazy" />
                    ) : (
                      <span>{w.isMovie ? '🎬' : '📺'}</span>
                    )}
                  </div>
                  <div className="profile-recent-main">
                    <span className="profile-recent-title">{w.item.title}</span>
                    <span className="profile-recent-meta">
                      {formatWatchLabel(w.record)} · {w.isMovie ? 'Movie' : 'Show'}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
