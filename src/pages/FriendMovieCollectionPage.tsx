import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { ArrowLeft, Film, Info, Settings } from 'lucide-react';
import { db } from '../lib/firebase';
import { loadMovies } from '../lib/firestoreMovies';
import { tmdbImagePath } from '../lib/tmdb';
import { useMoviesStore } from '../state/moviesStore';
import { useWatchlistStore } from '../state/watchlistStore';
import type { MovieShowItem, WatchRecord } from '../components/EntryRowMovieShow';
import { UniversalEditModal, type UniversalEditTarget } from '../components/UniversalEditModal';
import { InfoModal } from '../components/InfoModal';
import { PageSearch } from '../components/PageSearch';
import '../components/RankedList.css';
import './FriendMovieCollectionPage.css';

type FriendProfile = {
  uid: string;
  username: string;
  email: string;
  createdAt: string;
};

type FriendCollectionEntry = {
  id: string;
  item: MovieShowItem;
  viewerSeen: boolean;
  viewerWatchlisted: boolean;
};

type MovieFilter = 'ALL' | 'SEEN' | 'UNSEEN' | 'WATCHLISTED';

function FriendCollectionTile({
  entry,
  showUnrankedToggle,
  isUnrankedInViewerLibrary,
  isWatchlisted,
  onOpenInfo,
  onOpenSettings,
  onToggleUnranked,
  onToggleWatchlist
}: {
  entry: FriendCollectionEntry;
  showUnrankedToggle: boolean;
  isUnrankedInViewerLibrary: boolean;
  isWatchlisted: boolean;
  onOpenInfo: (entry: FriendCollectionEntry) => void;
  onOpenSettings: (entry: FriendCollectionEntry) => void;
  onToggleUnranked: (entry: FriendCollectionEntry) => void;
  onToggleWatchlist: (entry: FriendCollectionEntry) => void;
}) {
  return (
    <article
      id={`friend-collection-tile-${entry.id}`}
      className={`entry-tile friend-collection-tile ${entry.viewerSeen ? '' : 'entry-tile--unseen-muted'}`}
    >
      <div className={`entry-tile-poster ${entry.viewerSeen ? '' : 'entry-tile-poster--unseen-muted'}`}>
        <button type="button" className="friend-collection-icon-btn friend-collection-icon-btn--info" onClick={() => onOpenInfo(entry)} aria-label={`Info for ${entry.item.title}`}>
          <Info size={12} />
        </button>
        <button type="button" className="friend-collection-icon-btn friend-collection-icon-btn--settings" onClick={() => onOpenSettings(entry)} aria-label={`Settings for ${entry.item.title}`}>
          <Settings size={12} />
        </button>
        <div className="friend-collection-hover-actions">
          {showUnrankedToggle ? (
            <button
              type="button"
              className={`friend-collection-hover-btn ${isUnrankedInViewerLibrary ? 'friend-collection-hover-btn--minus' : 'friend-collection-hover-btn--plus'}`}
              onClick={() => onToggleUnranked(entry)}
            >
              {isUnrankedInViewerLibrary ? 'Unranked-' : 'Unranked+'}
            </button>
          ) : null}
          <button
            type="button"
            className={`friend-collection-hover-btn ${isWatchlisted ? 'friend-collection-hover-btn--minus' : 'friend-collection-hover-btn--plus'}`}
            onClick={() => onToggleWatchlist(entry)}
          >
            {isWatchlisted ? 'Watchlist-' : 'Watchlist+'}
          </button>
        </div>
        {entry.item.posterPath ? (
          <img src={tmdbImagePath(entry.item.posterPath, 'w185') ?? ''} alt={entry.item.title} loading="lazy" />
        ) : (
          <div className="friend-collection-poster-fallback">
            <Film size={20} />
          </div>
        )}
        {entry.viewerWatchlisted && !entry.viewerSeen ? <div className="friend-collection-watchlist-pill">Watchlisted</div> : null}
      </div>
      <div className={`entry-tile-title ${entry.item.title.length > 30 ? 'entry-tile-title--small' : ''}`}>{entry.item.title}</div>
    </article>
  );
}

export function FriendMovieCollectionPage() {
  const navigate = useNavigate();
  const { friendId } = useParams<{ friendId: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [friendProfile, setFriendProfile] = useState<FriendProfile | null>(null);
  const [friendMoviesData, setFriendMoviesData] = useState<any>(null);
  const [filter, setFilter] = useState<MovieFilter>('ALL');
  const [settingsFor, setSettingsFor] = useState<MovieShowItem | null>(null);
  const [infoFor, setInfoFor] = useState<FriendCollectionEntry | null>(null);
  const {
    byClass: myMoviesByClass,
    getMovieById,
    addMovieFromSearch,
    updateMovieWatchRecords,
    moveItemToClass,
    removeMovieEntry,
    classes: movieClasses,
    getClassLabel
  } = useMoviesStore();
  const watchlist = useWatchlistStore();

  /** Friend list item shares canonical id with viewer's entry; modal edits *your* library row. */
  const myMovieForModal = settingsFor ? getMovieById(settingsFor.id) : null;

  useEffect(() => {
    const loadFriendCollection = async () => {
      if (!friendId || !db) return;
      try {
        setLoading(true);
        setError(null);
        let actualFriendUid = friendId;
        const isUsername = friendId.includes('@');
        if (isUsername) {
          const userQuery = query(collection(db, 'users'), where('username', '==', friendId));
          const userSnapshot = await getDocs(userQuery);
          if (userSnapshot.empty) {
            setError('User not found');
            return;
          }
          actualFriendUid = userSnapshot.docs[0].id;
        }

        const friendDoc = await getDoc(doc(db, 'users', actualFriendUid));
        if (!friendDoc.exists()) {
          setError('Friend profile not found');
          return;
        }

        const profileData = friendDoc.data() as Omit<FriendProfile, 'uid'>;
        const normalizedUsername = profileData.username === 'cimmerial@clastone.local' ? 'Cimmerial' : profileData.username;
        setFriendProfile({ uid: actualFriendUid, ...profileData, username: normalizedUsername });

        const moviesData = await loadMovies(db, actualFriendUid);
        setFriendMoviesData(moviesData);
      } catch (err: any) {
        setError(err?.message ?? 'Failed to load collection');
      } finally {
        setLoading(false);
      }
    };

    void loadFriendCollection();
  }, [friendId]);

  const mySeenMovieIds = useMemo(() => {
    const ids = new Set<string>();
    for (const items of Object.values(myMoviesByClass)) {
      for (const item of items ?? []) {
        if ((item.watchRecords?.length ?? 0) > 0) ids.add(item.id);
      }
    }
    return ids;
  }, [myMoviesByClass]);

  const orderedFriendMovieEntries = useMemo<FriendCollectionEntry[]>(() => {
    if (!friendMoviesData?.classes || !friendMoviesData?.byClass) return [];
    const ordered: FriendCollectionEntry[] = [];
    for (const classDef of friendMoviesData.classes as Array<{ key: string }>) {
      const items = (friendMoviesData.byClass[classDef.key] ?? []) as MovieShowItem[];
      for (const item of items) {
        const viewerSeen = mySeenMovieIds.has(item.id);
        ordered.push({
          id: item.id,
          item,
          viewerSeen,
          viewerWatchlisted: !viewerSeen && watchlist.isInWatchlist(item.id),
        });
      }
    }
    return ordered;
  }, [friendMoviesData, mySeenMovieIds, watchlist]);

  const visibleEntries = useMemo(() => {
    if (filter === 'SEEN') return orderedFriendMovieEntries.filter((entry) => entry.viewerSeen);
    if (filter === 'UNSEEN') return orderedFriendMovieEntries.filter((entry) => !entry.viewerSeen);
    if (filter === 'WATCHLISTED') return orderedFriendMovieEntries.filter((entry) => entry.viewerWatchlisted);
    return orderedFriendMovieEntries;
  }, [filter, orderedFriendMovieEntries]);

  const collectionSearchItems = useMemo(
    () => visibleEntries.map((e) => ({ id: e.id, title: e.item.title })),
    [visibleEntries]
  );

  const handleCollectionSearchSelect = useCallback((id: string) => {
    const el = document.getElementById(`friend-collection-tile-${id}`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('highlighted-entry');
    window.setTimeout(() => el.classList.remove('highlighted-entry'), 2000);
  }, []);

  if (loading) {
    return (
      <section className="friend-movie-collection-page">
        <div className="friend-profile-loading">
          <div className="loading-spinner">Loading collection...</div>
        </div>
      </section>
    );
  }

  if (error || !friendProfile) {
    return (
      <section className="friend-movie-collection-page">
        <Link to="/friends" className="back-button">
          <ArrowLeft size={20} />
          Back to People
        </Link>
        <div className="error">{error || 'Friend not found'}</div>
      </section>
    );
  }

  return (
    <section className="friend-movie-collection-page">
      <header className="page-heading">
        <div>
          <div className="friend-collection-title-row">
            <h1 className="page-title">{friendProfile.username}'s Collection</h1>
            <span className="friend-movie-collection-count">
              {visibleEntries.length} of {orderedFriendMovieEntries.length} movies
            </span>
          </div>
          <div className="friend-movie-collection-meta">
            <Link to={`/friends/${friendProfile.uid}`} className="back-button">
              <ArrowLeft size={20} />
              Back to Profile
            </Link>
          </div>
        </div>
      </header>

      <div className="friend-movie-collection-toolbar">
        <div className="friend-movie-collection-filters">
          {(['ALL', 'SEEN', 'UNSEEN', 'WATCHLISTED'] as const).map((option) => (
            <button
              key={option}
              type="button"
              className={`filter-toggle-btn friend-movie-collection-filter-btn ${filter === option ? 'friend-movie-collection-filter-btn--active' : ''}`}
              onClick={() => setFilter(option)}
            >
              {option}
            </button>
          ))}
        </div>
        <PageSearch
          items={collectionSearchItems}
          onSelect={handleCollectionSearchSelect}
          placeholder="Search this collection…"
          className="friend-collection-page-search"
          pageKey={`friend-movie-collection-${friendProfile.uid}`}
        />
      </div>

      {visibleEntries.length === 0 ? (
        <div className="friend-movie-collection-empty card-surface">
          {orderedFriendMovieEntries.length === 0
            ? `${friendProfile.username} has no movies saved yet.`
            : `No movies match "${filter}".`}
        </div>
      ) : (
        <div className="friend-movie-collection-grid">
          {visibleEntries.map((entry) => (
            <FriendCollectionTile
              key={entry.id}
              entry={entry}
              showUnrankedToggle={!entry.viewerSeen || getMovieById(entry.id)?.classKey === 'UNRANKED'}
              isUnrankedInViewerLibrary={getMovieById(entry.id)?.classKey === 'UNRANKED'}
              isWatchlisted={watchlist.isInWatchlist(entry.id)}
              onOpenInfo={setInfoFor}
              onOpenSettings={(selectedEntry) => setSettingsFor(selectedEntry.item)}
              onToggleUnranked={(selectedEntry) => {
                const existing = getMovieById(selectedEntry.id);
                if (existing?.classKey === 'UNRANKED') {
                  removeMovieEntry(selectedEntry.id);
                  return;
                }
                if (existing) {
                  moveItemToClass(selectedEntry.id, 'UNRANKED');
                  return;
                }
                addMovieFromSearch({
                  id: selectedEntry.id,
                  title: selectedEntry.item.title,
                  subtitle: selectedEntry.item.releaseDate ? selectedEntry.item.releaseDate.slice(0, 4) : 'Saved',
                  classKey: 'UNRANKED',
                  posterPath: selectedEntry.item.posterPath
                });
              }}
              onToggleWatchlist={(selectedEntry) => {
                if (watchlist.isInWatchlist(selectedEntry.id)) {
                  watchlist.removeFromWatchlist(selectedEntry.id);
                  return;
                }
                watchlist.addToWatchlist(
                  {
                    id: selectedEntry.id,
                    title: selectedEntry.item.title,
                    posterPath: selectedEntry.item.posterPath,
                    releaseDate: selectedEntry.item.releaseDate
                  },
                  'movies'
                );
              }}
            />
          ))}
        </div>
      )}
      {infoFor ? (
        <InfoModal
          isOpen
          onClose={() => setInfoFor(null)}
          tmdbId={infoFor.item.tmdbId ?? parseInt(infoFor.item.id.replace(/\D/g, ''), 10)}
          mediaType="movie"
          title={infoFor.item.title}
          posterPath={infoFor.item.posterPath}
          releaseDate={infoFor.item.releaseDate}
          onEditWatches={() => {
            setSettingsFor(infoFor.item);
            setInfoFor(null);
          }}
        />
      ) : null}
      {settingsFor ? (
        <UniversalEditModal
          target={{
            id: settingsFor.id,
            tmdbId: settingsFor.tmdbId ?? (parseInt(settingsFor.id.replace(/\D/g, ''), 10) || 0),
            title: settingsFor.title,
            posterPath: settingsFor.posterPath,
            mediaType: 'movie',
            subtitle: settingsFor.releaseDate ? String(settingsFor.releaseDate.slice(0, 4)) : undefined,
            releaseDate: settingsFor.releaseDate,
            runtimeMinutes: myMovieForModal?.runtimeMinutes ?? settingsFor.runtimeMinutes,
            existingClassKey: myMovieForModal?.classKey ?? 'UNRANKED'
          } as UniversalEditTarget}
          initialWatches={myMovieForModal?.watchRecords ?? []}
          currentClassKey={myMovieForModal?.classKey ?? 'UNRANKED'}
          currentClassLabel={getClassLabel(myMovieForModal?.classKey ?? 'UNRANKED')}
          rankedClasses={movieClasses}
          isWatchlistItem={watchlist.isInWatchlist(settingsFor.id)}
          onAddToWatchlist={() => {
            watchlist.addToWatchlist(
              {
                id: settingsFor.id,
                title: settingsFor.title,
                posterPath: settingsFor.posterPath,
                releaseDate: settingsFor.releaseDate
              },
              'movies'
            );
          }}
          onRemoveFromWatchlist={() => watchlist.removeFromWatchlist(settingsFor.id)}
          onGoToWatchlist={() => {}}
          availableTags={[]}
          collectionTags={[]}
          isSaving={false}
          onClose={() => setSettingsFor(null)}
          onSave={async (params, goToMedia) => {
            const entryId = settingsFor.id;
            if (!getMovieById(entryId)) {
              addMovieFromSearch({
                id: entryId,
                title: settingsFor.title,
                subtitle: 'Saved',
                classKey: 'UNRANKED',
                posterPath: settingsFor.posterPath
              });
            }
            const watches: WatchRecord[] = params.watches.map((w) => {
              let type: WatchRecord['type'] = 'DATE';
              if (w.watchType === 'DATE_RANGE') type = 'RANGE';
              else if (w.watchType === 'LONG_AGO') type = w.watchStatus === 'DNF' ? 'DNF_LONG_AGO' : 'LONG_AGO';
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
                dnfPercent: w.watchPercent < 100 ? w.watchPercent : undefined
              };
            });
            updateMovieWatchRecords(entryId, watches);
            if (params.classKey) {
              const moveOptions = { toTop: params.position === 'top', toMiddle: params.position === 'middle' };
              moveItemToClass(entryId, params.classKey, moveOptions);
            }
            setSettingsFor(null);
            if (goToMedia) {
              navigate('/movies', { replace: true, state: { scrollToId: entryId } });
            }
          }}
        />
      ) : null}
    </section>
  );
}
