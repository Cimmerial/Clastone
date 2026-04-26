import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { ArrowLeft } from 'lucide-react';
import { db } from '../lib/firebase';
import { loadMovies } from '../lib/firestoreMovies';
import { loadTvShows } from '../lib/firestoreTvShows';
import { loadWatchlist } from '../lib/firestoreWatchlist';
import { loadUserLists } from '../lib/firestoreLists';
import { RankedList, type RankedItemBase } from '../components/RankedList';
import { EntryRowMovieShow, type MovieShowItem } from '../components/EntryRowMovieShow';
import { InfoModal } from '../components/InfoModal';
import { UniversalEditModal, type UniversalEditTarget } from '../components/UniversalEditModal';
import { watchMatrixEntriesToWatchRecords } from '../lib/watchMatrixMapping';
import { prepareWatchRecordsForSave } from '../lib/watchDayOrderUtils';
import { useMoviesStore } from '../state/moviesStore';
import { useTvStore } from '../state/tvStore';
import { useWatchlistStore } from '../state/watchlistStore';
import { useListsStore } from '../state/listsStore';
import { useSettingsStore } from '../state/settingsStore';
import { PageSearch } from '../components/PageSearch';
import '../components/RankedList.css';
import './ListsPage.css';
import './FriendMovieCollectionPage.css';

type FriendProfile = { uid: string; username: string };
type ViewerMode = 'THEIRS' | 'MINE';
type CollectionFilter = 'ALL' | 'SEEN' | 'UNSEEN' | 'WATCHLISTED';
type CollectionRow = RankedItemBase & {
  id: string;
  classKey: 'LIST';
  title: string;
  source: 'saved' | 'unseen';
  item: MovieShowItem;
  mediaType: 'movie' | 'tv';
  seen: boolean;
  watchlisted: boolean;
};

function normalizeCollectionMediaType(raw: string): 'movie' | 'tv' {
  if (raw === 'tv' || raw === 'shows' || raw === 'show') return 'tv';
  return 'movie';
}

function toCollectionEntryId(mediaType: 'movie' | 'tv', tmdbId: number): string {
  return `tmdb-${mediaType}-${tmdbId}`;
}

function buildCollectionFallbackItem(
  id: string,
  title: string,
  tmdbId: number,
  classKey: string,
  posterPath?: string,
  releaseDate?: string
): MovieShowItem {
  return {
    id,
    classKey,
    title,
    percentileRank: '',
    absoluteRank: '',
    rankInClass: '',
    viewingDates: '',
    topCastNames: [],
    stickerTags: [],
    percentCompleted: '0%',
    tmdbId,
    posterPath,
    releaseDate,
    watchRecords: [],
  };
}

export function FriendCollectionDetailPage() {
  const navigate = useNavigate();
  const { friendId, collectionId, listId } = useParams<{ friendId: string; collectionId?: string; listId?: string }>();
  const { globalCollections } = useListsStore();
  const {
    byClass: myMoviesByClass,
    classOrder: myMovieClassOrder,
    getMovieById,
    addMovieFromSearch,
    updateMovieWatchRecords,
    moveItemToClass: moveMovieToClass,
    removeMovieEntry,
    classes: movieClasses,
    getClassLabel: getMovieClassLabel
  } = useMoviesStore();
  const {
    byClass: myTvByClass,
    classOrder: myTvClassOrder,
    getShowById,
    addShowFromSearch,
    updateShowWatchRecords,
    moveItemToClass: moveShowToClass,
    removeShowEntry,
    classes: tvClasses,
    getClassLabel: getTvClassLabel
  } = useTvStore();
  const watchlist = useWatchlistStore();
  const { settings } = useSettingsStore();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [friendProfile, setFriendProfile] = useState<FriendProfile | null>(null);
  const [friendMoviesData, setFriendMoviesData] = useState<any>(null);
  const [friendTvData, setFriendTvData] = useState<any>(null);
  const [friendWatchlistData, setFriendWatchlistData] = useState<{ movies: any[]; tv: any[] } | null>(null);
  const [friendListsData, setFriendListsData] = useState<{ lists: any[]; order: string[]; entriesByListId: Record<string, any[]> } | null>(null);
  const [viewerMode, setViewerMode] = useState<ViewerMode>('THEIRS');
  const [filter, setFilter] = useState<CollectionFilter>('ALL');
  const [settingsFor, setSettingsFor] = useState<MovieShowItem | null>(null);
  const [infoModalTarget, setInfoModalTarget] = useState<{
    tmdbId: number;
    entryId?: string;
    title: string;
    posterPath?: string;
    releaseDate?: string;
    mediaType: 'movie' | 'tv';
  } | null>(null);

  useEffect(() => {
    const loadAll = async () => {
      if (!friendId || !db) return;
      try {
        setLoading(true);
        setError(null);
        let actualFriendUid = friendId;
        if (friendId.includes('@')) {
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
        const profileData = friendDoc.data() as { username?: string };
        const username = profileData.username === 'cimmerial@clastone.local' ? 'Cimmerial' : String(profileData.username ?? 'Friend');
        setFriendProfile({ uid: actualFriendUid, username });

        const [moviesData, tvData, watchlistData, listsData] = await Promise.all([
          loadMovies(db, actualFriendUid),
          loadTvShows(db, actualFriendUid),
          loadWatchlist(db, actualFriendUid),
          loadUserLists(db, actualFriendUid),
        ]);
        setFriendMoviesData(moviesData);
        setFriendTvData(tvData);
        setFriendWatchlistData({ movies: watchlistData.movies, tv: watchlistData.tv });
        setFriendListsData(listsData);
      } catch (err: any) {
        setError(err?.message ?? 'Failed to load collection');
      } finally {
        setLoading(false);
      }
    };
    void loadAll();
  }, [friendId]);

  const mySeenIds = useMemo(() => {
    const ids = new Set<string>();
    for (const [classKey, items] of Object.entries(myMoviesByClass)) {
      if (classKey === 'UNRANKED') continue;
      for (const item of items ?? []) ids.add(item.id);
    }
    for (const [classKey, items] of Object.entries(myTvByClass)) {
      if (classKey === 'UNRANKED') continue;
      for (const item of items ?? []) ids.add(item.id);
    }
    return ids;
  }, [myMoviesByClass, myTvByClass]);

  const friendSeenIds = useMemo(() => {
    const ids = new Set<string>();
    for (const classDef of friendMoviesData?.classes ?? []) {
      if (classDef.key === 'UNRANKED') continue;
      for (const item of friendMoviesData?.byClass?.[classDef.key] ?? []) ids.add(item.id);
    }
    for (const classDef of friendTvData?.classes ?? []) {
      if (classDef.key === 'UNRANKED') continue;
      for (const item of friendTvData?.byClass?.[classDef.key] ?? []) ids.add(item.id);
    }
    return ids;
  }, [friendMoviesData, friendTvData]);

  const friendWatchlistIds = useMemo(() => {
    const ids = new Set<string>();
    for (const item of friendWatchlistData?.movies ?? []) {
      const tmdbId = Number(item?.tmdbId ?? parseInt(String(item?.id ?? '').replace(/\D/g, ''), 10)) || 0;
      if (tmdbId > 0) ids.add(toCollectionEntryId('movie', tmdbId));
    }
    for (const item of friendWatchlistData?.tv ?? []) {
      const tmdbId = Number(item?.tmdbId ?? parseInt(String(item?.id ?? '').replace(/\D/g, ''), 10)) || 0;
      if (tmdbId > 0) ids.add(toCollectionEntryId('tv', tmdbId));
    }
    return ids;
  }, [friendWatchlistData]);

  const itemById = useMemo(() => {
    const map = new Map<string, MovieShowItem>();
    for (const items of Object.values(myMoviesByClass)) for (const item of items ?? []) map.set(item.id, item);
    for (const items of Object.values(myTvByClass)) for (const item of items ?? []) map.set(item.id, item);
    for (const classDef of friendMoviesData?.classes ?? []) for (const item of friendMoviesData?.byClass?.[classDef.key] ?? []) if (!map.has(item.id)) map.set(item.id, item);
    for (const classDef of friendTvData?.classes ?? []) for (const item of friendTvData?.byClass?.[classDef.key] ?? []) if (!map.has(item.id)) map.set(item.id, item);
    return map;
  }, [myMoviesByClass, myTvByClass, friendMoviesData, friendTvData]);

  const activeGlobalCollection = useMemo(
    () => (collectionId ? globalCollections.find((item) => item.id === collectionId) ?? null : null),
    [collectionId, globalCollections]
  );
  const activeCustomCollection = useMemo(() => {
    if (!listId || !friendListsData) return null;
    return friendListsData.lists.find((item: any) => item.id === listId && item.mode === 'collection') ?? null;
  }, [listId, friendListsData]);
  const activeCustomList = useMemo(() => {
    if (!listId || !friendListsData) return null;
    return friendListsData.lists.find((item: any) => item.id === listId && item.mode === 'list') ?? null;
  }, [listId, friendListsData]);

  const activeCustomListLike = activeCustomCollection ?? activeCustomList;
  const title = activeGlobalCollection?.name ?? activeCustomListLike?.name ?? null;
  const collectionSummary = activeGlobalCollection?.summary ?? activeCustomListLike?.description;

  const rows = useMemo<CollectionRow[]>(() => {
    const baseRows: Array<CollectionRow> = [];
    const toRow = ({
      id,
      title,
      posterPath,
      releaseDate,
      mediaType,
      tmdbId
    }: {
      id: string;
      title: string;
      posterPath?: string;
      releaseDate?: string;
      mediaType: 'movie' | 'tv';
      tmdbId: number;
    }): CollectionRow => {
      const existing = itemById.get(id);
      const item = existing ?? buildCollectionFallbackItem(id, title, tmdbId, 'UNRANKED', posterPath, releaseDate);
      const seen = viewerMode === 'THEIRS' ? friendSeenIds.has(id) : mySeenIds.has(id);
      const watchlisted = viewerMode === 'THEIRS' ? friendWatchlistIds.has(id) : watchlist.isInWatchlist(id);
      return {
        id,
        classKey: 'LIST',
        title: item.title,
        source: existing ? 'saved' : 'unseen',
        item,
        mediaType,
        seen,
        watchlisted
      };
    };
    if (activeGlobalCollection) {
      for (const entry of activeGlobalCollection.entries.slice().sort((a, b) => a.position - b.position)) {
        const mediaType = normalizeCollectionMediaType(entry.mediaType);
        const id = toCollectionEntryId(mediaType, entry.tmdbId);
        const existing = itemById.get(id);
        baseRows.push(toRow({
          id,
          mediaType,
          tmdbId: entry.tmdbId,
          title: existing?.title ?? entry.title ?? `${mediaType.toUpperCase()} #${entry.tmdbId}`,
          posterPath: existing?.posterPath ?? entry.posterPath,
          releaseDate: existing?.releaseDate ?? entry.releaseDate,
        }));
      }
    } else if (activeCustomListLike && friendListsData) {
      const entries = (friendListsData.entriesByListId[activeCustomListLike.id] ?? []).slice().sort((a: any, b: any) => a.position - b.position);
      for (const entry of entries) {
        const entryId = String(entry.entryId ?? '');
        if (!/^tmdb-(movie|tv)-\d+$/.test(entryId)) continue;
        const mediaType = entryId.startsWith('tmdb-tv-') ? 'tv' : 'movie';
        const tmdbId = parseInt(entryId.replace(/\D/g, ''), 10) || 0;
        const existing = itemById.get(entryId);
        baseRows.push(toRow({
          id: entryId,
          mediaType,
          tmdbId,
          title: existing?.title ?? entry.title ?? `${mediaType.toUpperCase()} #${tmdbId}`,
          posterPath: existing?.posterPath ?? entry.posterPath,
          releaseDate: existing?.releaseDate ?? entry.releaseDate,
        }));
      }
    }
    return baseRows;
  }, [activeGlobalCollection, activeCustomListLike, friendListsData, itemById, viewerMode, friendSeenIds, mySeenIds, friendWatchlistIds, watchlist]);

  const visibleRows = useMemo(() => {
    if (filter === 'SEEN') return rows.filter((row) => row.seen);
    if (filter === 'UNSEEN') return rows.filter((row) => !row.seen);
    if (filter === 'WATCHLISTED') return rows.filter((row) => row.watchlisted);
    return rows;
  }, [rows, filter]);

  const searchItems = useMemo(() => visibleRows.map((row) => ({ id: row.id, title: row.title })), [visibleRows]);
  const handleSearchSelect = useCallback((id: string) => {
    const el = document.getElementById(`friend-collection-tile-${id}`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('highlighted-entry');
    window.setTimeout(() => el.classList.remove('highlighted-entry'), 2000);
  }, []);

  if (loading) return <section className="lists-page"><div className="friend-profile-loading"><div className="loading-spinner">Loading collection...</div></div></section>;
  if (error || !friendProfile || !title) return <section className="lists-page"><Link to={friendProfile ? `/friends/${friendProfile.uid}` : '/friends'} className="back-button"><ArrowLeft size={20} />Back</Link><div className="error">{error ?? 'Collection not found'}</div></section>;

  return (
    <section className="lists-page">
      <header className="page-heading">
        <div className="lists-detail-title-wrap">
          <div className="lists-back-title-row">
            <button className="lists-back-icon-btn" onClick={() => navigate(`/friends/${friendProfile.uid}`)} aria-label="Back to profile"><ArrowLeft size={18} /></button>
            <h1 className="page-title">{title}</h1>
          </div>
          {collectionSummary ? <p className="lists-collection-summary">{collectionSummary}</p> : null}
        </div>
      </header>

      <div className="lists-collection-toolbar">
        <div className="lists-collection-filter-row">
          <div className="friend-movie-collection-toggle-group">
            <button type="button" className={`filter-toggle-btn lists-collection-filter-btn ${viewerMode === 'THEIRS' ? 'lists-collection-filter-btn--active' : ''}`} onClick={() => setViewerMode('THEIRS')}>Their View</button>
            <button type="button" className={`filter-toggle-btn lists-collection-filter-btn ${viewerMode === 'MINE' ? 'lists-collection-filter-btn--active' : ''}`} onClick={() => setViewerMode('MINE')}>Your View</button>
          </div>
          <span className="friend-movie-collection-toggle-divider" aria-hidden="true" />
          <div className="lists-collection-filter-row">
            {(['ALL', 'SEEN', 'UNSEEN', 'WATCHLISTED'] as const).map((option) => (
              <button key={option} type="button" className={`filter-toggle-btn lists-collection-filter-btn ${filter === option ? 'lists-collection-filter-btn--active' : ''}`} onClick={() => setFilter(option)}>{option}</button>
            ))}
          </div>
        </div>
        <PageSearch items={searchItems} onSelect={handleSearchSelect} placeholder="Search this collection..." className="lists-collection-page-search" pageKey={`friend-collection-${friendProfile.uid}-${collectionId ?? listId ?? 'unknown'}`} />
      </div>

      {visibleRows.length === 0 ? (
        <div className="friend-movie-collection-empty card-surface">No entries match "{filter}".</div>
      ) : (
        <RankedList<CollectionRow>
          classOrder={['LIST']}
          viewMode="tile"
          itemsByClass={{ LIST: visibleRows }}
          getClassCountLabel={(_classKey, items) => `${items.length}/${rows.length} entries`}
          getClassLabel={() => `${title} | ${activeGlobalCollection || activeCustomCollection ? 'Collection' : 'List'}`}
          getClassTagline={() => undefined}
          renderRow={(row) => {
            const item = row.item;
            const isCollectionUnseen = !row.seen;
            const shouldMuteCollectionUnseen = isCollectionUnseen && !settings.collectionSeenBorderMode;
            const shouldShowSeenBorder = settings.collectionSeenBorderMode && !isCollectionUnseen;
            const isUnrankedInMyLibrary = (
              row.mediaType === 'movie'
                ? getMovieById(item.id)?.classKey === 'UNRANKED'
                : getShowById(item.id)?.classKey === 'UNRANKED'
            );
            return (
              <div
                id={`friend-collection-tile-${row.id}`}
                className={`lists-entry-tile-wrap ${
                  row.watchlisted ? 'lists-entry-tile-wrap--watchlisted' : ''
                } ${
                  isCollectionUnseen ? 'lists-entry-tile-wrap--collection-unseen' : ''
                } ${
                  shouldShowSeenBorder ? 'lists-entry-tile-wrap--seen-border-mode' : ''
                }`}
              >
                <EntryRowMovieShow
                  item={item}
                  listType={row.mediaType === 'movie' ? 'movies' : 'shows'}
                  viewMode="tile"
                  tileMinimalActions
                  tileUnseenMuted={shouldMuteCollectionUnseen}
                  tileOverlayControls={
                    <div className="lists-entry-toggle-stack">
                      {row.mediaType === 'movie' ? (
                        isUnrankedInMyLibrary ? (
                          <button
                            type="button"
                            className="lists-entry-toggle-btn lists-entry-toggle-btn--minus"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeMovieEntry(item.id);
                            }}
                          >
                            Unranked-
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="lists-entry-toggle-btn lists-entry-toggle-btn--plus"
                            onClick={(e) => {
                              e.stopPropagation();
                              const existing = getMovieById(item.id);
                              if (existing) moveMovieToClass(item.id, 'UNRANKED');
                              else {
                                addMovieFromSearch({
                                  id: item.id,
                                  title: item.title,
                                  subtitle: item.releaseDate ? item.releaseDate.slice(0, 4) : 'Saved',
                                  classKey: 'UNRANKED',
                                  posterPath: item.posterPath,
                                });
                              }
                            }}
                          >
                            Unranked+
                          </button>
                        )
                      ) : (
                        isUnrankedInMyLibrary ? (
                          <button
                            type="button"
                            className="lists-entry-toggle-btn lists-entry-toggle-btn--minus"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeShowEntry(item.id);
                            }}
                          >
                            Unranked-
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="lists-entry-toggle-btn lists-entry-toggle-btn--plus"
                            onClick={(e) => {
                              e.stopPropagation();
                              const existing = getShowById(item.id);
                              if (existing) moveShowToClass(item.id, 'UNRANKED');
                              else {
                                addShowFromSearch({
                                  id: item.id,
                                  title: item.title,
                                  subtitle: item.releaseDate ? item.releaseDate.slice(0, 4) : 'Saved',
                                  classKey: 'UNRANKED',
                                });
                              }
                            }}
                          >
                            Unranked+
                          </button>
                        )
                      )}
                      {watchlist.isInWatchlist(item.id) ? (
                        <button
                          type="button"
                          className="lists-entry-toggle-btn lists-entry-toggle-btn--minus"
                          onClick={(e) => {
                            e.stopPropagation();
                            watchlist.removeFromWatchlist(item.id);
                          }}
                        >
                          Watchlist-
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="lists-entry-toggle-btn lists-entry-toggle-btn--plus"
                          onClick={(e) => {
                            e.stopPropagation();
                            watchlist.addToWatchlist(
                              {
                                id: item.id,
                                title: item.title,
                                posterPath: item.posterPath,
                                releaseDate: item.releaseDate
                              },
                              row.mediaType === 'movie' ? 'movies' : 'tv'
                            );
                          }}
                        >
                          Watchlist+
                        </button>
                      )}
                    </div>
                  }
                  tileOverlayBadges={
                    row.watchlisted ? (
                      <div className="lists-entry-status-badge lists-entry-status-badge--watchlisted">Watchlisted</div>
                    ) : null
                  }
                  onInfo={(entry) => {
                    const tmdbId = entry.tmdbId ?? (parseInt(entry.id.replace(/\D/g, ''), 10) || 0);
                    setInfoModalTarget({
                      tmdbId,
                      entryId: entry.id,
                      title: entry.title,
                      posterPath: entry.posterPath,
                      releaseDate: entry.releaseDate,
                      mediaType: row.mediaType
                    });
                  }}
                  onOpenSettings={(entry) => setSettingsFor(entry)}
                />
              </div>
            );
          }}
        />
      )}
      {settingsFor ? (
        <UniversalEditModal
          target={{
            id: settingsFor.id,
            tmdbId: settingsFor.tmdbId ?? (parseInt(settingsFor.id.replace(/\D/g, ''), 10) || 0),
            title: settingsFor.title,
            posterPath: settingsFor.posterPath,
            mediaType: settingsFor.id.startsWith('tmdb-tv-') ? 'tv' : 'movie',
            subtitle: settingsFor.releaseDate ? String(settingsFor.releaseDate.slice(0, 4)) : undefined,
            releaseDate: settingsFor.releaseDate,
            runtimeMinutes: settingsFor.runtimeMinutes,
            totalEpisodes: settingsFor.totalEpisodes,
            existingClassKey: settingsFor.id.startsWith('tmdb-tv-') ? getShowById(settingsFor.id)?.classKey : getMovieById(settingsFor.id)?.classKey
          } as UniversalEditTarget}
          initialWatches={settingsFor.watchRecords}
          currentClassKey={settingsFor.id.startsWith('tmdb-tv-') ? getShowById(settingsFor.id)?.classKey : getMovieById(settingsFor.id)?.classKey}
          currentClassLabel={settingsFor.id.startsWith('tmdb-tv-')
            ? getTvClassLabel(getShowById(settingsFor.id)?.classKey ?? '')
            : getMovieClassLabel(getMovieById(settingsFor.id)?.classKey ?? '')}
          rankedClasses={settingsFor.id.startsWith('tmdb-tv-') ? tvClasses : movieClasses}
          isWatchlistItem={watchlist.isInWatchlist(settingsFor.id)}
          onAddToWatchlist={() => {
            const isTv = settingsFor.id.startsWith('tmdb-tv-');
            watchlist.addToWatchlist(
              {
                id: settingsFor.id,
                title: settingsFor.title,
                posterPath: settingsFor.posterPath,
                releaseDate: settingsFor.releaseDate
              },
              isTv ? 'tv' : 'movies'
            );
          }}
          onRemoveFromWatchlist={() => watchlist.removeFromWatchlist(settingsFor.id)}
          onGoToWatchlist={() => navigate('/watchlist', { state: { scrollToId: settingsFor.id } })}
          availableTags={[]}
          collectionTags={[]}
          onGoPickTemplate={() => {
            const isTv = settingsFor.id.startsWith('tmdb-tv-');
            setSettingsFor(null);
            navigate(isTv ? '/tv#tv-class-templates' : '/movies#movie-class-templates', { replace: true });
          }}
          isSaving={false}
          onClose={() => setSettingsFor(null)}
          onSave={async (params, goToMedia) => {
            const keepModalOpen = Boolean(params.keepModalOpen);
            const watches = prepareWatchRecordsForSave(
              watchMatrixEntriesToWatchRecords(params.watches),
              settingsFor.id,
              myMoviesByClass,
              myTvByClass,
              myMovieClassOrder,
              myTvClassOrder
            );
            const isTv = settingsFor.id.startsWith('tmdb-tv-');
            if (isTv && !getShowById(settingsFor.id)) {
              addShowFromSearch({
                id: settingsFor.id,
                title: settingsFor.title,
                subtitle: 'Saved',
                classKey: 'UNRANKED',
                cache: {
                  tmdbId: settingsFor.tmdbId ?? (parseInt(settingsFor.id.replace(/\D/g, ''), 10) || 0),
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
            if (!isTv && !getMovieById(settingsFor.id)) {
              addMovieFromSearch({
                id: settingsFor.id,
                title: settingsFor.title,
                subtitle: 'Saved',
                classKey: 'UNRANKED',
                posterPath: settingsFor.posterPath
              });
            }
            if (isTv) updateShowWatchRecords(settingsFor.id, watches);
            else updateMovieWatchRecords(settingsFor.id, watches);
            if (params.classKey) {
              const moveOptions = { toTop: params.position === 'top', toMiddle: params.position === 'middle' };
              if (isTv) moveShowToClass(settingsFor.id, params.classKey, moveOptions);
              else moveMovieToClass(settingsFor.id, params.classKey, moveOptions);
            }
            if (!keepModalOpen) {
              setSettingsFor(null);
            }
            if (goToMedia && !keepModalOpen) {
              navigate(isTv ? '/tv' : '/movies', { replace: true, state: { scrollToId: settingsFor.id } });
            }
          }}
        />
      ) : null}
      {infoModalTarget ? (
        <InfoModal
          isOpen
          onClose={() => setInfoModalTarget(null)}
          tmdbId={infoModalTarget.tmdbId}
          mediaType={infoModalTarget.mediaType}
          title={infoModalTarget.title}
          posterPath={infoModalTarget.posterPath}
          releaseDate={infoModalTarget.releaseDate}
          onEditWatches={() => {
            const target = rows.find((row) => row.id === `tmdb-${infoModalTarget.mediaType}-${infoModalTarget.tmdbId}`)?.item;
            if (target) {
              setInfoModalTarget(null);
              setSettingsFor(target);
            }
          }}
        />
      ) : null}
    </section>
  );
}
