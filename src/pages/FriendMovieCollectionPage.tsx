import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { ArrowLeft } from 'lucide-react';
import { db } from '../lib/firebase';
import { loadMovies } from '../lib/firestoreMovies';
import { useMoviesStore, getTotalMinutesFromRecords, formatDuration } from '../state/moviesStore';
import { useTvStore } from '../state/tvStore';
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

type MovieFilter = 'ALL' | 'SEEN' | 'UNSEEN' | 'WATCHLISTED' | 'UNSEEN_UNWATCHLISTED';
type ClassDisplayMode = 'SHOW_CLASSES' | 'NO_CLASSES';

export function FriendMovieCollectionPage() {
  const navigate = useNavigate();
  const { friendId } = useParams<{ friendId: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [friendProfile, setFriendProfile] = useState<FriendProfile | null>(null);
  const [friendMoviesData, setFriendMoviesData] = useState<any>(null);
  const [filter, setFilter] = useState<MovieFilter>('ALL');
  const [classDisplayMode, setClassDisplayMode] = useState<ClassDisplayMode>('SHOW_CLASSES');
  const [settingsFor, setSettingsFor] = useState<MovieShowItem | null>(null);
  const [infoFor, setInfoFor] = useState<FriendCollectionEntry | null>(null);
  const {
    byClass: myMoviesByClass,
    classOrder: myMovieClassOrder,
    getMovieById,
    addMovieFromSearch,
    updateMovieWatchRecords,
    moveItemToClass,
    removeMovieEntry,
    classes: movieClasses,
    getClassLabel
  } = useMoviesStore();
  const { byClass: myTvByClass, classOrder: myTvClassOrder } = useTvStore();
  const watchlist = useWatchlistStore();
  const { settings } = useSettingsStore();

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
          classKey: classDef.key,
          item,
          viewerSeen,
          viewerWatchlisted: watchlist.isInWatchlist(item.id),
        });
      }
    }
    return ordered;
  }, [friendMoviesData, mySeenMovieIds, watchlist]);

  const visibleEntries = useMemo(() => {
    if (filter === 'SEEN') return orderedFriendMovieEntries.filter((entry) => entry.viewerSeen);
    if (filter === 'UNSEEN') return orderedFriendMovieEntries.filter((entry) => !entry.viewerSeen);
    if (filter === 'WATCHLISTED') return orderedFriendMovieEntries.filter((entry) => entry.viewerWatchlisted);
    if (filter === 'UNSEEN_UNWATCHLISTED') {
      return orderedFriendMovieEntries.filter((entry) => !entry.viewerSeen && !entry.viewerWatchlisted);
    }
    return orderedFriendMovieEntries;
  }, [filter, orderedFriendMovieEntries]);

  const collectionSearchItems = useMemo(
    () => visibleEntries.map((e) => ({ id: e.id, title: e.item.title })),
    [visibleEntries]
  );
  const friendClassDefs = useMemo(
    () => (friendMoviesData?.classes ?? []) as Array<{ key: string; label?: string; tagline?: string }>,
    [friendMoviesData]
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
          pageKey={`friend-movie-collection-${friendProfile.uid}`}
        />
      </div>

      {visibleEntries.length === 0 ? (
        <div className="friend-movie-collection-empty card-surface">
          {orderedFriendMovieEntries.length === 0
            ? `${friendProfile.username} has no movies saved yet.`
            : `No movies match "${filter === 'UNSEEN_UNWATCHLISTED' ? 'Unseen & Unwatchlisted' : filter}".`}
        </div>
      ) : (
        <RankedList<FriendCollectionEntry>
          classOrder={classDisplayMode === 'SHOW_CLASSES' ? friendClassOrder : ['LIST']}
          viewMode="tile"
          itemsByClass={classDisplayMode === 'SHOW_CLASSES' ? visibleEntriesByClass : { LIST: visibleEntries }}
          getClassCountLabel={(_classKey, items) => `${items.length}/${orderedFriendMovieEntries.length} entries`}
          getClassLabel={(classKey) => {
            if (classDisplayMode === 'SHOW_CLASSES') {
              return friendClassMetaByKey.get(classKey)?.label ?? classKey.replace(/_/g, ' ');
            }
            return `${friendProfile.username}'s Collection | Movies`;
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
                listType="movies"
                viewMode="tile"
                tileMinimalActions
                tileUnseenMuted={!settings.collectionSeenBorderMode && !entry.viewerSeen}
                tileOverlayControls={
                  <div className="lists-entry-toggle-stack">
                    {(!entry.viewerSeen || getMovieById(entry.id)?.classKey === 'UNRANKED') ? (
                      <button
                        type="button"
                        className={`lists-entry-toggle-btn ${
                          getMovieById(entry.id)?.classKey === 'UNRANKED'
                            ? 'lists-entry-toggle-btn--minus'
                            : 'lists-entry-toggle-btn--plus'
                        }`}
                        onClick={() => {
                          const existing = getMovieById(entry.id);
                          if (existing?.classKey === 'UNRANKED') {
                            removeMovieEntry(entry.id);
                            return;
                          }
                          if (existing) {
                            moveItemToClass(entry.id, 'UNRANKED');
                            return;
                          }
                          addMovieFromSearch({
                            id: entry.id,
                            title: entry.item.title,
                            subtitle: entry.item.releaseDate ? entry.item.releaseDate.slice(0, 4) : 'Saved',
                            classKey: 'UNRANKED',
                            posterPath: entry.item.posterPath
                          });
                        }}
                      >
                        {getMovieById(entry.id)?.classKey === 'UNRANKED' ? 'Unranked-' : 'Unranked+'}
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
                          'movies'
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
          onGoPickTemplate={() => {
            setSettingsFor(null);
            navigate('/movies#movie-class-templates', { replace: true });
          }}
          isSaving={false}
          onClose={() => setSettingsFor(null)}
          onSave={async (params, goToMedia) => {
            const entryId = settingsFor.id;
            const keepModalOpen = Boolean(params.keepModalOpen);
            if (!keepModalOpen && !getMovieById(entryId)) {
              addMovieFromSearch({
                id: entryId,
                title: settingsFor.title,
                subtitle: 'Saved',
                classKey: 'UNRANKED',
                posterPath: settingsFor.posterPath
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
            updateMovieWatchRecords(entryId, watches);
            if (params.classKey) {
              const moveOptions = { toTop: params.position === 'top', toMiddle: params.position === 'middle' };
              moveItemToClass(entryId, params.classKey, moveOptions);
            }
            if (!keepModalOpen) {
              setSettingsFor(null);
            }
            if (goToMedia && !keepModalOpen) {
              navigate('/movies', { replace: true, state: { scrollToId: entryId } });
            }
          }}
        />
      ) : null}
    </section>
  );
}
