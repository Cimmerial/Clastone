import { useMemo, useState } from 'react';
import { useWatchlistStore, type WatchlistEntry } from '../state/watchlistStore';
import { useMoviesStore } from '../state/moviesStore';
import { useTvStore } from '../state/tvStore';
import { tmdbImagePath, getMovieImageSrc, isBigMovie } from '../lib/tmdb';
import './ProfileWatchlist.css';

interface ProfileWatchlistProps {
  isOwnProfile?: boolean;
  friendWatchlistData?: {
    movies: WatchlistEntry[];
    tv: WatchlistEntry[];
  } | null;
  onMovieClick?: (movie: WatchlistEntry) => void;
  onShowClick?: (show: WatchlistEntry) => void;
  getUserMovieStatus?: (tmdbId: number) => { isRanked: boolean; classKey?: string };
  getUserShowStatus?: (tmdbId: number) => { isRanked: boolean; classKey?: string };
}

type WatchlistViewType = 'movies' | 'shows';

function formatYear(releaseDate?: string): string {
  if (!releaseDate) return '—';
  const y = releaseDate.slice(0, 4);
  return /^\d{4}$/.test(y) ? y : releaseDate;
}

export function ProfileWatchlist({ 
  isOwnProfile = true, 
  friendWatchlistData,
  onMovieClick,
  onShowClick,
  getUserMovieStatus,
  getUserShowStatus
}: ProfileWatchlistProps) {
  const [viewType, setViewType] = useState<WatchlistViewType>('movies');
  const [showOverlapOnly, setShowOverlapOnly] = useState(false);
  const { movies: myMovies, tv: myTv } = useWatchlistStore();
  const { globalRanks: moviesGlobalRanks } = useMoviesStore();
  const { globalRanks: tvGlobalRanks } = useTvStore();
  
  // Use friend's data if viewing friend profile, otherwise use own data
  const movies = isOwnProfile ? myMovies : (friendWatchlistData?.movies || []);
  const tv = isOwnProfile ? myTv : (friendWatchlistData?.tv || []);

  // Create sets of my watchlist IDs for quick lookup
  const myMovieIds = useMemo(() => new Set(myMovies.map(m => m.id)), [myMovies]);
  const myTvIds = useMemo(() => new Set(myTv.map(t => t.id)), [myTv]);

  // Filter based on overlap if viewing friend profile and overlap toggle is on
  const filteredMovies = useMemo(() => {
    if (!isOwnProfile && showOverlapOnly) {
      return movies.filter(movie => myMovieIds.has(movie.id));
    }
    return movies;
  }, [movies, myMovieIds, isOwnProfile, showOverlapOnly]);

  const filteredTv = useMemo(() => {
    if (!isOwnProfile && showOverlapOnly) {
      return tv.filter(show => myTvIds.has(show.id));
    }
    return tv;
  }, [tv, myTvIds, isOwnProfile, showOverlapOnly]);

  const currentItems = viewType === 'movies' ? filteredMovies : filteredTv;
  const totalCount = viewType === 'movies' ? filteredMovies.length : filteredTv.length;
  const originalCount = viewType === 'movies' ? movies.length : tv.length;
  
  // Format count display
  const countDisplay = (!isOwnProfile && showOverlapOnly) 
    ? `${totalCount}/${originalCount}` 
    : String(totalCount);

  if (movies.length === 0 && tv.length === 0) {
    return (
      <div className="profile-watchlist profile-card card-surface">
        <div className="profile-watchlist-header">
          <div className="profile-watchlist-title-group">
            <h2 className="profile-card-title">Watchlist</h2>
          </div>
        </div>
        <div className="profile-watchlist-empty">
          <p className="profile-muted">No items in watchlist</p>
        </div>
      </div>
    );
  }

  return (
    <div className="profile-watchlist profile-card card-surface">
      <div className="profile-watchlist-header">
        <div className="profile-watchlist-title-group">
          <h2 className="profile-card-title">Watchlist</h2>
          <span className="profile-recent-count profile-watchlist-count">{countDisplay}</span>
        </div>
      </div>
      
      <div className="profile-recent-controls">
        <span className="profile-recent-label">List:</span>
        {(
          [
            { value: 'movies' as const, label: 'Movies' },
            { value: 'shows' as const, label: 'Shows' }
          ]
        ).map((opt) => (
          <button
            key={opt.value}
            type="button"
            className={`profile-recent-btn ${viewType === opt.value ? 'profile-recent-btn--active' : ''}`}
            onClick={() => setViewType(opt.value)}
          >
            {opt.label}
          </button>
        ))}
        
        {!isOwnProfile && (
          <>
            <span className="profile-recent-label" style={{ marginLeft: '16px' }}>Show:</span>
            <button
              type="button"
              className={`profile-recent-btn ${showOverlapOnly ? 'profile-recent-btn--active' : ''}`}
              onClick={() => setShowOverlapOnly(!showOverlapOnly)}
            >
              Overlap with my Watchlist
            </button>
          </>
        )}
      </div>

      <div className="profile-recent-list">
        {currentItems.length === 0 ? (
          <p className="profile-muted">
            {!isOwnProfile && showOverlapOnly 
              ? `No overlapping ${viewType} found` 
              : `No ${viewType} in watchlist`
            }
          </p>
        ) : (
          <div className="profile-recent-grid">
            {currentItems.map((entry) => {
              const tmdbId = (entry.id.includes('-') ? parseInt(entry.id.split('-').pop() || '0', 10) : parseInt(entry.id.replace(/\D/g, ''), 10)) || 0;
              const isMovie = viewType === 'movies';
              const userStatus = isMovie 
                ? (getUserMovieStatus?.(tmdbId) || { isRanked: false })
                : (getUserShowStatus?.(tmdbId) || { isRanked: false });
              const handleClick = () => {
                if (isMovie && onMovieClick) {
                  onMovieClick(entry);
                } else if (!isMovie && onShowClick) {
                  onShowClick(entry);
                }
              };
              
              // Get percentile ranking or special class text - only show if seen
              let displayText = null;
              if (userStatus.isRanked) {
                const globalRanks = isMovie ? moviesGlobalRanks : tvGlobalRanks;
                const rankInfo = globalRanks.get(entry.id);
                displayText = rankInfo?.percentileRank;
              } else if (userStatus.classKey === 'DELICIOUS_GARBAGE') {
                displayText = 'GARB';
              } else if (userStatus.classKey === 'BABY') {
                displayText = 'BABY';
              } else if (userStatus.classKey) {
                displayText = 'N/A';
              }
              
              return (
                <div 
                  key={entry.id} 
                  className="profile-recent-tile profile-top-item--clickable"
                  onClick={handleClick}
                >
                  <div className="profile-recent-tile-poster">
                    {getMovieImageSrc(entry.posterPath, entry.title) ? (
                      <img 
                        src={getMovieImageSrc(entry.posterPath, entry.title) ?? ''} 
                        alt="" 
                        loading="lazy" 
                      />
                    ) : (
                      <span>{isBigMovie(entry.title) ? 'B' : (isMovie ? '🎬' : '📺')}</span>
                    )}
                    <div className="profile-top-overlay">
                      <span className={userStatus.isRanked ? 'profile-top-overlay-text profile-top-overlay-text--seen' : 'profile-top-overlay-text'}>
                        {userStatus.isRanked ? 'SEEN' : 'SAVE'}
                      </span>
                    </div>
                    {displayText && (
                      <div className={`profile-recent-percentile ${!userStatus.isRanked ? 'profile-recent-percentile--unranked' : ''} ${isMovie ? 'profile-recent-percentile--movie' : 'profile-recent-percentile--tv'}`}>
                        {displayText}
                      </div>
                    )}
                  </div>
                  <div className="profile-recent-tile-info">
                    <span className="profile-recent-tile-title">{entry.title}</span>
                    <span className="profile-recent-tile-date">
                      {formatYear(entry.releaseDate)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
