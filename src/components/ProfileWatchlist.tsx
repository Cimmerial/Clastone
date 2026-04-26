import { useMemo, useState, useCallback } from 'react';
import { useWatchlistStore, type WatchlistEntry } from '../state/watchlistStore';
import { useMoviesStore } from '../state/moviesStore';
import { useTvStore } from '../state/tvStore';
import { useFriends } from '../context/FriendsContext';
import { useWatchlistFriendOverlap } from '../hooks/useWatchlistFriendOverlap';
import { WatchlistFriendOverlapModal } from './WatchlistFriendOverlapModal';
import { getMovieImageSrc, isBigMovie } from '../lib/tmdb';
import type { WatchRecord } from './EntryRowMovieShow';
import { PageSearch } from './PageSearch';
import { formatRecommendersLabel } from './RecommendToFriendModal';
import './ProfileWatchlist.css';
import '../pages/WatchlistPage.css';

interface ProfileWatchlistProps {
  isOwnProfile?: boolean;
  /** Logged-in only: same “view overlap with friends” filter as the Watchlist page. */
  showFriendOverlapButton?: boolean;
  /** Suffix for PageSearch persistence (e.g. friend Firebase uid); avoids sharing query across profiles. */
  watchlistPageKeySuffix?: string;
  friendWatchlistData?: {
    movies: WatchlistEntry[];
    tv: WatchlistEntry[];
  } | null;
  onMovieClick?: (movie: WatchlistEntry) => void;
  onShowClick?: (show: WatchlistEntry) => void;
  getUserMovieStatus?: (tmdbId: number) => { isRanked: boolean; classKey?: string; watchRecords?: WatchRecord[] };
  getUserShowStatus?: (tmdbId: number) => { isRanked: boolean; classKey?: string; watchRecords?: WatchRecord[] };
}

type WatchlistViewType = 'movies' | 'shows';

function isUnreleased(releaseDate?: string): boolean {
  if (!releaseDate) return false;
  const release = new Date(releaseDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return release > today;
}

function isUpcomingRelease(releaseDate?: string): boolean {
  if (!releaseDate) return true;
  return isUnreleased(releaseDate);
}

function upcomingSortValue(releaseDate?: string): number | null {
  if (!releaseDate) return null;
  const value = new Date(releaseDate).getTime();
  return Number.isFinite(value) ? value : null;
}

function entryIdToTmdbId(id: string): number {
  return (
    (id.includes('-')
      ? parseInt(id.split('-').pop() || '0', 10)
      : parseInt(id.replace(/\D/g, ''), 10)) || 0
  );
}

function formatYear(releaseDate?: string): string {
  if (!releaseDate) return '—';
  const y = releaseDate.slice(0, 4);
  return /^\d{4}$/.test(y) ? y : releaseDate;
}

export function ProfileWatchlist({ 
  isOwnProfile = true,
  showFriendOverlapButton = false,
  watchlistPageKeySuffix,
  friendWatchlistData,
  onMovieClick,
  onShowClick,
  getUserMovieStatus,
  getUserShowStatus
}: ProfileWatchlistProps) {
  const [viewType, setViewType] = useState<WatchlistViewType>('movies');
  const [showOverlapOnly, setShowOverlapOnly] = useState(false);
  const { movies: myMovies, tv: myTv } = useWatchlistStore();
  const { friends } = useFriends();
  const { globalRanks: moviesGlobalRanks } = useMoviesStore();
  const { globalRanks: tvGlobalRanks } = useTvStore();

  const moviesSource = isOwnProfile ? myMovies : (friendWatchlistData?.movies || []);
  const tvSource = isOwnProfile ? myTv : (friendWatchlistData?.tv || []);

  const overlapMyMovieIds = useMemo(() => myMovies.map((m) => m.id), [myMovies]);
  const overlapMyTvIds = useMemo(() => myTv.map((t) => t.id), [myTv]);
  const {
    isOverlapModalOpen,
    setIsOverlapModalOpen,
    friendModes,
    setFriendModes,
    friendModesDraft,
    setFriendModesDraft,
    isLoadingOverlap,
    friendWatchlists,
    friendWatchlistErrors,
    refreshingFriendUids,
    refreshFriendWatchlist,
    overlapMovieIdSet,
    overlapTvIdSet,
  } = useWatchlistFriendOverlap(
    !!(isOwnProfile && showFriendOverlapButton),
    friends.map((f) => f.uid),
    overlapMyMovieIds,
    overlapMyTvIds
  );

  const moviesAfterFriendOverlap = useMemo(() => {
    if (!isOwnProfile || !showFriendOverlapButton || !overlapMovieIdSet) {
      return moviesSource;
    }
    return moviesSource.filter((m) => overlapMovieIdSet.has(m.id));
  }, [isOwnProfile, showFriendOverlapButton, overlapMovieIdSet, moviesSource]);

  const tvAfterFriendOverlap = useMemo(() => {
    if (!isOwnProfile || !showFriendOverlapButton || !overlapTvIdSet) {
      return tvSource;
    }
    return tvSource.filter((t) => overlapTvIdSet.has(t.id));
  }, [isOwnProfile, showFriendOverlapButton, overlapTvIdSet, tvSource]);

  // Create sets of my watchlist IDs for quick lookup
  const myMovieIds = useMemo(() => new Set(myMovies.map(m => m.id)), [myMovies]);
  const myTvIds = useMemo(() => new Set(myTv.map(t => t.id)), [myTv]);

  // Filter based on overlap if viewing friend profile and overlap toggle is on
  const filteredMovies = useMemo(() => {
    if (!isOwnProfile && showOverlapOnly) {
      return moviesAfterFriendOverlap.filter(movie => myMovieIds.has(movie.id));
    }
    return moviesAfterFriendOverlap;
  }, [moviesAfterFriendOverlap, myMovieIds, isOwnProfile, showOverlapOnly]);

  const filteredTv = useMemo(() => {
    if (!isOwnProfile && showOverlapOnly) {
      return tvAfterFriendOverlap.filter(show => myTvIds.has(show.id));
    }
    return tvAfterFriendOverlap;
  }, [tvAfterFriendOverlap, myTvIds, isOwnProfile, showOverlapOnly]);

  const currentItems = viewType === 'movies' ? filteredMovies : filteredTv;
  const totalCount = viewType === 'movies' ? filteredMovies.length : filteredTv.length;
  const sourceCountForView = viewType === 'movies' ? moviesSource.length : tvSource.length;

  const ownFriendOverlapActive =
    isOwnProfile && showFriendOverlapButton && Object.values(friendModes).some(Boolean);

  const watchlistSearchItems = useMemo(
    () => currentItems.map((e) => ({ id: e.id, title: e.title })),
    [currentItems]
  );

  const watchlistSearchPageKey = `profile-watchlist-${watchlistPageKeySuffix ?? (isOwnProfile ? 'own' : 'friend')}-${viewType}`;

  const handleWatchlistScrollToId = useCallback((id: string) => {
    const el = document.getElementById(`profile-watchlist-entry-${id}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('highlighted-entry');
      setTimeout(() => el.classList.remove('highlighted-entry'), 2000);
    }
  }, []);
  
  // Format count display
  const countDisplay =
    ownFriendOverlapActive || (!isOwnProfile && showOverlapOnly)
      ? `${totalCount}/${sourceCountForView}`
      : String(totalCount);

  if (moviesSource.length === 0 && tvSource.length === 0) {
    return (
      <div className="profile-watchlist profile-card card-surface">
        <div className="profile-recent-header">
          <h2 className="profile-card-title">Watchlist</h2>
        </div>
        <div className="profile-watchlist-empty">
          <p className="profile-muted">No items in watchlist</p>
        </div>
      </div>
    );
  }

  type EntryWithStatus = {
    entry: WatchlistEntry;
    tmdbId: number;
    userStatus: { isRanked: boolean; classKey?: string; watchRecords?: WatchRecord[] };
    watched: boolean;
  };

  const categorizedMovies = useMemo((): { defaultWatchlist: EntryWithStatus[]; rewatch: EntryWithStatus[]; unreleased: EntryWithStatus[] } => {
    const defaultWatchlist: EntryWithStatus[] = [];
    const rewatch: EntryWithStatus[] = [];
    const unreleased: EntryWithStatus[] = [];

    for (const entry of filteredMovies) {
      const tmdbId = entryIdToTmdbId(entry.id);
      const userStatus = getUserMovieStatus?.(tmdbId) ?? { isRanked: false };
      const watched = (userStatus.watchRecords?.length ?? 0) > 0;

      const bucket = isUpcomingRelease(entry.releaseDate)
        ? unreleased
        : watched
          ? rewatch
          : defaultWatchlist;

      bucket.push({ entry, tmdbId, userStatus, watched });
    }

    unreleased.sort((a, b) => {
      const aValue = upcomingSortValue(a.entry.releaseDate);
      const bValue = upcomingSortValue(b.entry.releaseDate);
      if (aValue == null && bValue == null) return 0;
      if (aValue == null) return 1;
      if (bValue == null) return -1;
      return aValue - bValue;
    });

    return { defaultWatchlist, rewatch, unreleased };
  }, [filteredMovies, getUserMovieStatus]);

  const categorizedTv = useMemo((): { defaultWatchlist: EntryWithStatus[]; rewatch: EntryWithStatus[]; unreleased: EntryWithStatus[] } => {
    const defaultWatchlist: EntryWithStatus[] = [];
    const rewatch: EntryWithStatus[] = [];
    const unreleased: EntryWithStatus[] = [];

    for (const entry of filteredTv) {
      const tmdbId = entryIdToTmdbId(entry.id);
      const userStatus = getUserShowStatus?.(tmdbId) ?? { isRanked: false };
      const watched = (userStatus.watchRecords?.length ?? 0) > 0;

      const bucket = isUpcomingRelease(entry.releaseDate)
        ? unreleased
        : watched
          ? rewatch
          : defaultWatchlist;

      bucket.push({ entry, tmdbId, userStatus, watched });
    }

    unreleased.sort((a, b) => {
      const aValue = upcomingSortValue(a.entry.releaseDate);
      const bValue = upcomingSortValue(b.entry.releaseDate);
      if (aValue == null && bValue == null) return 0;
      if (aValue == null) return 1;
      if (bValue == null) return -1;
      return aValue - bValue;
    });

    return { defaultWatchlist, rewatch, unreleased };
  }, [filteredTv, getUserShowStatus]);

  const currentCategorized = viewType === 'movies' ? categorizedMovies : categorizedTv;

  const renderTiles = (items: EntryWithStatus[], isMovie: boolean) => (
    <div className="profile-recent-grid">
      {items.map(({ entry, userStatus, watched }) => {
        const handleClick = () => {
          if (isMovie && onMovieClick) onMovieClick(entry);
          if (!isMovie && onShowClick) onShowClick(entry);
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

        const recommendedBy = entry.recommendedBy?.filter(Boolean) ?? [];
        const isFriendRecommended = recommendedBy.length > 0;
        const recommendedLabel = isFriendRecommended
          ? `Recommended by ${formatRecommendersLabel(recommendedBy)}`
          : undefined;

        return (
          <div
            key={entry.id}
            id={`profile-watchlist-entry-${entry.id}`}
            className={`profile-recent-tile profile-top-item--clickable${isFriendRecommended ? ' profile-recent-tile--friend-recommended' : ''}`}
            onClick={handleClick}
            title={recommendedLabel}
            data-recommended-tooltip={isFriendRecommended ? recommendedLabel : undefined}
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
                <span className={watched ? 'profile-top-overlay-text profile-top-overlay-text--seen' : 'profile-top-overlay-text'}>
                  {watched ? 'SEEN' : 'SAVE'}
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
              {isFriendRecommended ? (
                <span className="profile-recent-tile-recommended-by">{recommendedLabel}</span>
              ) : null}
              <span className="profile-recent-tile-date">
                {formatYear(entry.releaseDate)}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="profile-watchlist profile-card card-surface">
      <div className="profile-recent-header">
        <h2 className="profile-card-title">Watchlist</h2>
        <span className="profile-recent-count">{countDisplay}</span>
      </div>

      <div className="profile-recent-controls profile-watchlist-toolbar">
        <div className="profile-watchlist-toolbar__primary">
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

          {isOwnProfile && showFriendOverlapButton && (
            <button
              type="button"
              className={`watchlist-overlap-open-btn ${Object.values(friendModes).some(Boolean) ? 'watchlist-overlap-open-btn--active' : ''}`}
              onClick={() => {
                setFriendModesDraft(friendModes);
                setIsOverlapModalOpen(true);
              }}
              title="Show only items on all selected friends' watchlists"
            >
              Friend overlap
            </button>
          )}

          {!isOwnProfile && (
            <>
              <span className="profile-recent-label profile-watchlist-toolbar__show-label">Show:</span>
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
        {currentItems.length > 0 && (
          <PageSearch
            items={watchlistSearchItems}
            onSelect={handleWatchlistScrollToId}
            placeholder={viewType === 'movies' ? 'Search movies…' : 'Search shows…'}
            className="profile-watchlist-page-search"
            offsetRight="0"
            pageKey={watchlistSearchPageKey}
          />
        )}
      </div>

      <div className="profile-recent-list">
        {currentItems.length === 0 ? (
          <p className="profile-muted">
            {!isOwnProfile && showOverlapOnly
              ? `No overlapping ${viewType} found`
              : ownFriendOverlapActive
                ? `No overlapping ${viewType} with selected friends`
                : `No ${viewType} in watchlist`}
          </p>
        ) : (
          <div className="profile-watchlist-sections">
            {currentCategorized.defaultWatchlist.length > 0 && (
              <div className="profile-watchlist-category profile-watchlist-category--default">
                {renderTiles(currentCategorized.defaultWatchlist, viewType === 'movies')}
              </div>
            )}

            {currentCategorized.rewatch.length > 0 && (
              <div className="profile-watchlist-category profile-watchlist-category--rewatch">
                <div className="profile-watchlist-category-label profile-watchlist-category-label--rewatch">
                  Rewatch
                </div>
                {renderTiles(currentCategorized.rewatch, viewType === 'movies')}
              </div>
            )}

            {currentCategorized.unreleased.length > 0 && (
              <div className="profile-watchlist-category profile-watchlist-category--unreleased">
                <div className="profile-watchlist-category-label profile-watchlist-category-label--unreleased">
                  Unreleased
                </div>
                {renderTiles(currentCategorized.unreleased, viewType === 'movies')}
              </div>
            )}
          </div>
        )}
      </div>

      {isOwnProfile && showFriendOverlapButton && (
        <WatchlistFriendOverlapModal
          isOpen={isOverlapModalOpen}
          friends={friends}
          selectedModes={friendModesDraft}
          isLoading={isLoadingOverlap}
          onClose={() => {
            setIsOverlapModalOpen(false);
            setFriendModesDraft(friendModes);
          }}
          onSelectionChange={(modes) => setFriendModesDraft(modes)}
          onCommit={(modes) => {
            setFriendModes(modes);
            setIsOverlapModalOpen(false);
          }}
          myMovieIds={overlapMyMovieIds}
          myTvIds={overlapMyTvIds}
          friendWatchlists={friendWatchlists}
          friendWatchlistErrors={friendWatchlistErrors}
          refreshingFriendUids={refreshingFriendUids}
          onFriendToggle={(uid) => {
            void refreshFriendWatchlist(uid);
          }}
        />
      )}
    </div>
  );
}
