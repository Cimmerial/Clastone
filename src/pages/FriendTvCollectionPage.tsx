import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { ArrowLeft, Info, Settings, Tv } from 'lucide-react';
import { db } from '../lib/firebase';
import { loadTvShows } from '../lib/firestoreTvShows';
import { tmdbImagePath } from '../lib/tmdb';
import { useTvStore } from '../state/tvStore';
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

type ShowFilter = 'ALL' | 'SEEN' | 'UNSEEN' | 'WATCHLISTED';

function FriendShowCollectionTile({
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
            <Tv size={20} />
          </div>
        )}
        {entry.viewerWatchlisted && !entry.viewerSeen ? <div className="friend-collection-watchlist-pill">Watchlisted</div> : null}
      </div>
      <div className={`entry-tile-title ${entry.item.title.length > 30 ? 'entry-tile-title--small' : ''}`}>{entry.item.title}</div>
    </article>
  );
}

export function FriendTvCollectionPage() {
  const navigate = useNavigate();
  const { friendId } = useParams<{ friendId: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [friendProfile, setFriendProfile] = useState<FriendProfile | null>(null);
  const [friendTvData, setFriendTvData] = useState<any>(null);
  const [filter, setFilter] = useState<ShowFilter>('ALL');
  const [settingsFor, setSettingsFor] = useState<MovieShowItem | null>(null);
  const [infoFor, setInfoFor] = useState<FriendCollectionEntry | null>(null);
  const {
    byClass: myTvByClass,
    getShowById,
    addShowFromSearch,
    updateShowWatchRecords,
    moveItemToClass,
    removeShowEntry,
    classes: tvClasses,
    getClassLabel
  } = useTvStore();
  const watchlist = useWatchlistStore();

  const myShowForModal = settingsFor ? getShowById(settingsFor.id) : null;

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

        const tvData = await loadTvShows(db, actualFriendUid);
        setFriendTvData(tvData);
      } catch (err: any) {
        setError(err?.message ?? 'Failed to load collection');
      } finally {
        setLoading(false);
      }
    };

    void loadFriendCollection();
  }, [friendId]);

  const mySeenShowIds = useMemo(() => {
    const ids = new Set<string>();
    for (const items of Object.values(myTvByClass)) {
      for (const item of items ?? []) {
        if ((item.watchRecords?.length ?? 0) > 0) ids.add(item.id);
      }
    }
    return ids;
  }, [myTvByClass]);

  const orderedFriendShowEntries = useMemo<FriendCollectionEntry[]>(() => {
    if (!friendTvData?.classes || !friendTvData?.byClass) return [];
    const ordered: FriendCollectionEntry[] = [];
    for (const classDef of friendTvData.classes as Array<{ key: string }>) {
      const items = (friendTvData.byClass[classDef.key] ?? []) as MovieShowItem[];
      for (const item of items) {
        const viewerSeen = mySeenShowIds.has(item.id);
        ordered.push({
          id: item.id,
          item,
          viewerSeen,
          viewerWatchlisted: !viewerSeen && watchlist.isInWatchlist(item.id),
        });
      }
    }
    return ordered;
  }, [friendTvData, mySeenShowIds, watchlist]);

  const visibleEntries = useMemo(() => {
    if (filter === 'SEEN') return orderedFriendShowEntries.filter((entry) => entry.viewerSeen);
    if (filter === 'UNSEEN') return orderedFriendShowEntries.filter((entry) => !entry.viewerSeen);
    if (filter === 'WATCHLISTED') return orderedFriendShowEntries.filter((entry) => entry.viewerWatchlisted);
    return orderedFriendShowEntries;
  }, [filter, orderedFriendShowEntries]);

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
              {visibleEntries.length} of {orderedFriendShowEntries.length} shows
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
          pageKey={`friend-tv-collection-${friendProfile.uid}`}
        />
      </div>

      {visibleEntries.length === 0 ? (
        <div className="friend-movie-collection-empty card-surface">
          {orderedFriendShowEntries.length === 0
            ? `${friendProfile.username} has no shows saved yet.`
            : `No shows match "${filter}".`}
        </div>
      ) : (
        <div className="friend-movie-collection-grid">
          {visibleEntries.map((entry) => (
            <FriendShowCollectionTile
              key={entry.id}
              entry={entry}
              showUnrankedToggle={!entry.viewerSeen || getShowById(entry.id)?.classKey === 'UNRANKED'}
              isUnrankedInViewerLibrary={getShowById(entry.id)?.classKey === 'UNRANKED'}
              isWatchlisted={watchlist.isInWatchlist(entry.id)}
              onOpenInfo={setInfoFor}
              onOpenSettings={(selectedEntry) => setSettingsFor(selectedEntry.item)}
              onToggleUnranked={(selectedEntry) => {
                const existing = getShowById(selectedEntry.id);
                if (existing?.classKey === 'UNRANKED') {
                  removeShowEntry(selectedEntry.id);
                  return;
                }
                if (existing) {
                  moveItemToClass(selectedEntry.id, 'UNRANKED');
                  return;
                }
                addShowFromSearch({
                  id: selectedEntry.id,
                  title: selectedEntry.item.title,
                  subtitle: selectedEntry.item.releaseDate ? selectedEntry.item.releaseDate.slice(0, 4) : 'Saved',
                  classKey: 'UNRANKED',
                  cache: {
                    tmdbId: selectedEntry.item.tmdbId ?? (parseInt(selectedEntry.id.replace(/\D/g, ''), 10) || 0),
                    title: selectedEntry.item.title,
                    posterPath: selectedEntry.item.posterPath,
                    releaseDate: selectedEntry.item.releaseDate,
                    genres: [],
                    cast: [],
                    creators: [],
                    seasons: []
                  }
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
                  'tv'
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
          mediaType="tv"
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
            mediaType: 'tv',
            subtitle: settingsFor.releaseDate ? String(settingsFor.releaseDate.slice(0, 4)) : undefined,
            releaseDate: settingsFor.releaseDate,
            runtimeMinutes: myShowForModal?.runtimeMinutes ?? settingsFor.runtimeMinutes,
            totalEpisodes: myShowForModal?.totalEpisodes ?? settingsFor.totalEpisodes,
            existingClassKey: myShowForModal?.classKey ?? 'UNRANKED'
          } as UniversalEditTarget}
          initialWatches={myShowForModal?.watchRecords ?? []}
          currentClassKey={myShowForModal?.classKey ?? 'UNRANKED'}
          currentClassLabel={getClassLabel(myShowForModal?.classKey ?? 'UNRANKED')}
          rankedClasses={tvClasses}
          isWatchlistItem={watchlist.isInWatchlist(settingsFor.id)}
          onAddToWatchlist={() => {
            watchlist.addToWatchlist(
              {
                id: settingsFor.id,
                title: settingsFor.title,
                posterPath: settingsFor.posterPath,
                releaseDate: settingsFor.releaseDate
              },
              'tv'
            );
          }}
          onRemoveFromWatchlist={() => watchlist.removeFromWatchlist(settingsFor.id)}
          onGoToWatchlist={() => {}}
          availableTags={[]}
          collectionTags={[]}
          onGoPickTemplate={() => {
            setSettingsFor(null);
            navigate('/tv#tv-class-templates', { replace: true });
          }}
          isSaving={false}
          onClose={() => setSettingsFor(null)}
          onSave={async (params, goToMedia) => {
            const entryId = settingsFor.id;
            if (!getShowById(entryId)) {
              addShowFromSearch({
                id: entryId,
                title: settingsFor.title,
                subtitle: 'Saved',
                classKey: 'UNRANKED',
                cache: {
                  tmdbId: settingsFor.tmdbId ?? (parseInt(entryId.replace(/\D/g, ''), 10) || 0),
                  title: settingsFor.title,
                  posterPath: settingsFor.posterPath,
                  releaseDate: settingsFor.releaseDate,
                  genres: [],
                  cast: [],
                  creators: [],
                  seasons: []
                }
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
            updateShowWatchRecords(entryId, watches);
            if (params.classKey) {
              const moveOptions = { toTop: params.position === 'top', toMiddle: params.position === 'middle' };
              moveItemToClass(entryId, params.classKey, moveOptions);
            }
            setSettingsFor(null);
            if (goToMedia) {
              navigate('/tv', { replace: true, state: { scrollToId: entryId } });
            }
          }}
        />
      ) : null}
    </section>
  );
}
