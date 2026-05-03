import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { ArrowLeft } from 'lucide-react';
import { db } from '../lib/firebase';
import { loadTvShows } from '../lib/firestoreTvShows';
import { formatDuration, getTotalMinutesFromRecords } from '../state/moviesStore';
import { useTvStore } from '../state/tvStore';
import { useMoviesStore } from '../state/moviesStore';
import { useWatchlistStore } from '../state/watchlistStore';
import { useSettingsStore } from '../state/settingsStore';
import { EntryRowMovieShow, type MovieShowItem } from '../components/EntryRowMovieShow';
import { watchMatrixEntriesToWatchRecords } from '../lib/watchMatrixMapping';
import { prepareWatchRecordsForSave } from '../lib/watchDayOrderUtils';
import { UniversalEditModal, type UniversalEditTarget } from '../components/UniversalEditModal';
import { InfoModal } from '../components/InfoModal';
import { PageSearch } from '../components/PageSearch';
import { RankedList } from '../components/RankedList';
import '../components/RankedList.css';
import './ListsPage.css';
import './FriendMovieCollectionPage.css';

type FriendProfile = {
  uid: string;
  username: string;
  email: string;
  createdAt: string;
};

type FriendCollectionEntry = {
  id: string;
  classKey: string;
  item: MovieShowItem;
  viewerSeen: boolean;
  viewerWatchlisted: boolean;
};

type ShowFilter = 'ALL' | 'SEEN' | 'UNSEEN' | 'WATCHLISTED' | 'UNSEEN_UNWATCHLISTED';
type ClassDisplayMode = 'SHOW_CLASSES' | 'NO_CLASSES';

export function FriendTvCollectionPage() {
  const navigate = useNavigate();
  const { friendId } = useParams<{ friendId: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [friendProfile, setFriendProfile] = useState<FriendProfile | null>(null);
  const [friendTvData, setFriendTvData] = useState<any>(null);
  const [filter, setFilter] = useState<ShowFilter>('ALL');
  const [classDisplayMode, setClassDisplayMode] = useState<ClassDisplayMode>('SHOW_CLASSES');
  const [settingsFor, setSettingsFor] = useState<MovieShowItem | null>(null);
  const [infoFor, setInfoFor] = useState<FriendCollectionEntry | null>(null);
  const { byClass: myMoviesByClass, classOrder: myMovieClassOrder } = useMoviesStore();
  const {
    byClass: myTvByClass,
    classOrder: myTvClassOrder,
    getShowById,
    addShowFromSearch,
    updateShowWatchRecords,
    moveItemToClass,
    removeShowEntry,
    classes: tvClasses,
    getClassLabel
  } = useTvStore();
  const watchlist = useWatchlistStore();
  const { settings } = useSettingsStore();

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
          classKey: classDef.key,
          item,
          viewerSeen,
          viewerWatchlisted: watchlist.isInWatchlist(item.id),
        });
      }
    }
    return ordered;
  }, [friendTvData, mySeenShowIds, watchlist]);

  const visibleEntries = useMemo(() => {
    if (filter === 'SEEN') return orderedFriendShowEntries.filter((entry) => entry.viewerSeen);
    if (filter === 'UNSEEN') return orderedFriendShowEntries.filter((entry) => !entry.viewerSeen);
    if (filter === 'WATCHLISTED') return orderedFriendShowEntries.filter((entry) => entry.viewerWatchlisted);
    if (filter === 'UNSEEN_UNWATCHLISTED') {
      return orderedFriendShowEntries.filter((entry) => !entry.viewerSeen && !entry.viewerWatchlisted);
    }
    return orderedFriendShowEntries;
  }, [filter, orderedFriendShowEntries]);

  const collectionSearchItems = useMemo(
    () => visibleEntries.map((e) => ({ id: e.id, title: e.item.title })),
    [visibleEntries]
  );
  const friendClassDefs = useMemo(
    () => (friendTvData?.classes ?? []) as Array<{ key: string; label?: string; tagline?: string }>,
    [friendTvData]
  );
  const friendClassOrder = useMemo(() => friendClassDefs.map((classDef) => classDef.key), [friendClassDefs]);
  const friendClassMetaByKey = useMemo(
    () => new Map(friendClassDefs.map((classDef) => [classDef.key, classDef])),
    [friendClassDefs]
  );
  const visibleEntriesByClass = useMemo(() => {
    const grouped: Record<string, FriendCollectionEntry[]> = {};
    for (const classDef of friendClassDefs) grouped[classDef.key] = [];
    for (const entry of visibleEntries) {
      if (!grouped[entry.classKey]) grouped[entry.classKey] = [];
      grouped[entry.classKey].push(entry);
    }
    return grouped;
  }, [friendClassDefs, visibleEntries]);

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
    <section className={`friend-movie-collection-page friend-all-collection-page ${classDisplayMode === 'SHOW_CLASSES' ? 'friend-all-collection-page--show-classes' : ''}`}>
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

      <div className="lists-collection-toolbar">
        <div className="lists-collection-filter-row">
          <div className="friend-movie-collection-toggle-group">
            <button
              type="button"
              className={`filter-toggle-btn lists-collection-filter-btn ${classDisplayMode === 'SHOW_CLASSES' ? 'lists-collection-filter-btn--active' : ''}`}
              onClick={() => setClassDisplayMode('SHOW_CLASSES')}
            >
              Show Classes
            </button>
            <button
              type="button"
              className={`filter-toggle-btn lists-collection-filter-btn ${classDisplayMode === 'NO_CLASSES' ? 'lists-collection-filter-btn--active' : ''}`}
              onClick={() => setClassDisplayMode('NO_CLASSES')}
            >
              No Classes
            </button>
          </div>
          <span className="friend-movie-collection-toggle-divider" aria-hidden="true" />
          {(
            [
              ['ALL', 'ALL'],
              ['SEEN', 'SEEN'],
              ['UNSEEN', 'UNSEEN'],
              ['WATCHLISTED', 'WATCHLISTED'],
              ['UNSEEN_UNWATCHLISTED', 'Unseen & Unwatchlisted'],
            ] as const
          ).map(([option, label]) => (
            <button
              key={option}
              type="button"
              className={`filter-toggle-btn lists-collection-filter-btn ${filter === option ? 'lists-collection-filter-btn--active' : ''}`}
              onClick={() => setFilter(option)}
            >
              {label}
            </button>
          ))}
        </div>
        <PageSearch
          items={collectionSearchItems}
          onSelect={handleCollectionSearchSelect}
          placeholder="Search this collection…"
          className="lists-collection-page-search"
          pageKey={`friend-tv-collection-${friendProfile.uid}`}
        />
      </div>

      {visibleEntries.length === 0 ? (
        <div className="friend-movie-collection-empty card-surface">
          {orderedFriendShowEntries.length === 0
            ? `${friendProfile.username} has no shows saved yet.`
            : `No shows match "${filter === 'UNSEEN_UNWATCHLISTED' ? 'Unseen & Unwatchlisted' : filter}".`}
        </div>
      ) : (
        <RankedList<FriendCollectionEntry>
          classOrder={classDisplayMode === 'SHOW_CLASSES' ? friendClassOrder : ['LIST']}
          viewMode="tile"
          itemsByClass={classDisplayMode === 'SHOW_CLASSES' ? visibleEntriesByClass : { LIST: visibleEntries }}
          getClassCountLabel={(_classKey, items) => `${items.length}/${orderedFriendShowEntries.length} entries`}
          getClassLabel={(classKey) => {
            if (classDisplayMode === 'SHOW_CLASSES') {
              return friendClassMetaByKey.get(classKey)?.label ?? classKey.replace(/_/g, ' ');
            }
            return `${friendProfile.username}'s Collection | Shows`;
          }}
          getClassTagline={(classKey) => {
            if (classDisplayMode === 'SHOW_CLASSES') {
              return friendClassMetaByKey.get(classKey)?.tagline ?? undefined;
            }
            return undefined;
          }}
          renderRow={(entry) => (
            <div
              id={`friend-collection-tile-${entry.id}`}
              className={`lists-entry-tile-wrap ${
                entry.viewerWatchlisted ? 'lists-entry-tile-wrap--watchlisted' : ''
              } ${
                !entry.viewerSeen ? 'lists-entry-tile-wrap--collection-unseen' : ''
              } ${
                settings.collectionSeenBorderMode && entry.viewerSeen ? 'lists-entry-tile-wrap--seen-border-mode' : ''
              }`}
            >
              <EntryRowMovieShow
                item={{
                  ...entry.item,
                  classKey: entry.item.classKey ?? 'UNRANKED',
                  percentileRank: entry.item.percentileRank ?? '—',
                  absoluteRank: entry.item.absoluteRank ?? '—',
                  rankInClass: entry.item.rankInClass ?? 'Friend collection',
                  viewingDates:
                    entry.item.viewingDates ??
                    ((entry.item.watchRecords?.length ?? 0) > 0
                      ? `Watched ${entry.item.watchRecords?.length ?? 0}x`
                      : 'Unseen by you'),
                  watchTime:
                    entry.item.watchTime ??
                    (() => {
                      const total = getTotalMinutesFromRecords(entry.item.watchRecords ?? [], entry.item.runtimeMinutes);
                      return total > 0 ? formatDuration(total) : undefined;
                    })(),
                  topCastNames: entry.item.topCastNames ?? [],
                  stickerTags: entry.item.stickerTags ?? [],
                  percentCompleted: entry.item.percentCompleted ?? '',
                }}
                listType="shows"
                viewMode="tile"
                tileMinimalActions
                tileUnseenMuted={!settings.collectionSeenBorderMode && !entry.viewerSeen}
                tileOverlayControls={
                  <div className="lists-entry-toggle-stack">
                    {(!entry.viewerSeen || getShowById(entry.id)?.classKey === 'UNRANKED') ? (
                      <button
                        type="button"
                        className={`lists-entry-toggle-btn ${
                          getShowById(entry.id)?.classKey === 'UNRANKED'
                            ? 'lists-entry-toggle-btn--minus'
                            : 'lists-entry-toggle-btn--plus'
                        }`}
                        onClick={() => {
                          const existing = getShowById(entry.id);
                          if (existing?.classKey === 'UNRANKED') {
                            removeShowEntry(entry.id);
                            return;
                          }
                          if (existing) {
                            moveItemToClass(entry.id, 'UNRANKED');
                            return;
                          }
                          addShowFromSearch({
                            id: entry.id,
                            title: entry.item.title,
                            subtitle: entry.item.releaseDate ? entry.item.releaseDate.slice(0, 4) : 'Saved',
                            classKey: 'UNRANKED',
                            cache: {
                              tmdbId: entry.item.tmdbId ?? (parseInt(entry.id.replace(/\D/g, ''), 10) || 0),
                              title: entry.item.title,
                              posterPath: entry.item.posterPath,
                              releaseDate: entry.item.releaseDate,
                              genres: [],
                              cast: [],
                              creators: [],
                              seasons: []
                            }
                          });
                        }}
                      >
                        {getShowById(entry.id)?.classKey === 'UNRANKED' ? 'Unranked-' : 'Unranked+'}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className={`lists-entry-toggle-btn ${
                        watchlist.isInWatchlist(entry.id)
                          ? 'lists-entry-toggle-btn--minus'
                          : 'lists-entry-toggle-btn--plus'
                      }`}
                      onClick={() => {
                        if (watchlist.isInWatchlist(entry.id)) {
                          watchlist.removeFromWatchlist(entry.id);
                          return;
                        }
                        watchlist.addToWatchlist(
                          {
                            id: entry.id,
                            title: entry.item.title,
                            posterPath: entry.item.posterPath,
                            releaseDate: entry.item.releaseDate
                          },
                          'tv'
                        );
                      }}
                    >
                      {watchlist.isInWatchlist(entry.id) ? 'Watchlist-' : 'Watchlist+'}
                    </button>
                  </div>
                }
                tileOverlayBadges={
                  entry.viewerWatchlisted ? (
                    <div className="lists-entry-status-badge lists-entry-status-badge--watchlisted">Watchlisted</div>
                  ) : null
                }
                onInfo={() => setInfoFor(entry)}
                onOpenSettings={() => setSettingsFor(entry.item)}
              />
            </div>
          )}
        />
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
            const keepModalOpen = Boolean(params.keepModalOpen);
            if (!keepModalOpen && !getShowById(entryId)) {
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
            const watches = prepareWatchRecordsForSave(
              watchMatrixEntriesToWatchRecords(params.watches),
              entryId,
              myMoviesByClass,
              myTvByClass,
              myMovieClassOrder,
              myTvClassOrder
            );
            updateShowWatchRecords(entryId, watches);
            if (params.classKey) {
              const moveOptions = { toTop: params.position === 'top', toMiddle: params.position === 'middle' };
              moveItemToClass(entryId, params.classKey, moveOptions);
            }
            if (!keepModalOpen) {
              setSettingsFor(null);
            }
            if (goToMedia && !keepModalOpen) {
              navigate('/tv', { replace: true, state: { scrollToId: entryId } });
            }
          }}
        />
      ) : null}
    </section>
  );
}
