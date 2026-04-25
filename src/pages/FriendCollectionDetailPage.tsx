import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { ArrowLeft, Film, Tv } from 'lucide-react';
import { db } from '../lib/firebase';
import { loadMovies } from '../lib/firestoreMovies';
import { loadTvShows } from '../lib/firestoreTvShows';
import { loadWatchlist } from '../lib/firestoreWatchlist';
import { loadUserLists } from '../lib/firestoreLists';
import { tmdbImagePath } from '../lib/tmdb';
import { useMoviesStore } from '../state/moviesStore';
import { useTvStore } from '../state/tvStore';
import { useWatchlistStore } from '../state/watchlistStore';
import { useListsStore } from '../state/listsStore';
import { useSettingsStore } from '../state/settingsStore';
import { PageSearch } from '../components/PageSearch';
import type { MovieShowItem } from '../components/EntryRowMovieShow';
import '../components/RankedList.css';
import './FriendMovieCollectionPage.css';

type FriendProfile = { uid: string; username: string };
type ViewerMode = 'THEIRS' | 'MINE';
type CollectionFilter = 'ALL' | 'SEEN' | 'UNSEEN' | 'WATCHLISTED';
type CollectionRow = {
  id: string;
  title: string;
  posterPath?: string;
  releaseDate?: string;
  mediaType: 'movie' | 'tv';
  tmdbId: number;
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

export function FriendCollectionDetailPage() {
  const { friendId, collectionId, listId } = useParams<{ friendId: string; collectionId?: string; listId?: string }>();
  const { globalCollections } = useListsStore();
  const { byClass: myMoviesByClass } = useMoviesStore();
  const { byClass: myTvByClass } = useTvStore();
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
    for (const items of Object.values(myMoviesByClass)) for (const item of items ?? []) if ((item.watchRecords?.length ?? 0) > 0) ids.add(item.id);
    for (const items of Object.values(myTvByClass)) for (const item of items ?? []) if ((item.watchRecords?.length ?? 0) > 0) ids.add(item.id);
    return ids;
  }, [myMoviesByClass, myTvByClass]);

  const friendSeenIds = useMemo(() => {
    const ids = new Set<string>();
    for (const classDef of friendMoviesData?.classes ?? []) for (const item of friendMoviesData?.byClass?.[classDef.key] ?? []) if ((item.watchRecords?.length ?? 0) > 0) ids.add(item.id);
    for (const classDef of friendTvData?.classes ?? []) for (const item of friendTvData?.byClass?.[classDef.key] ?? []) if ((item.watchRecords?.length ?? 0) > 0) ids.add(item.id);
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

  const title = activeGlobalCollection?.name ?? activeCustomCollection?.name ?? null;
  const collectionSummary = activeGlobalCollection?.summary ?? activeCustomCollection?.description;

  const rows = useMemo<CollectionRow[]>(() => {
    const baseRows: Array<{
      id: string;
      title: string;
      posterPath?: string;
      releaseDate?: string;
      mediaType: 'movie' | 'tv';
      tmdbId: number;
    }> = [];
    if (activeGlobalCollection) {
      for (const entry of activeGlobalCollection.entries.slice().sort((a, b) => a.position - b.position)) {
        const mediaType = normalizeCollectionMediaType(entry.mediaType);
        const id = toCollectionEntryId(mediaType, entry.tmdbId);
        const existing = itemById.get(id);
        baseRows.push({
          id,
          mediaType,
          tmdbId: entry.tmdbId,
          title: existing?.title ?? entry.title ?? `${mediaType.toUpperCase()} #${entry.tmdbId}`,
          posterPath: existing?.posterPath ?? entry.posterPath,
          releaseDate: existing?.releaseDate ?? entry.releaseDate,
        });
      }
    } else if (activeCustomCollection && friendListsData) {
      const entries = (friendListsData.entriesByListId[activeCustomCollection.id] ?? []).slice().sort((a: any, b: any) => a.position - b.position);
      for (const entry of entries) {
        const entryId = String(entry.entryId ?? '');
        if (!/^tmdb-(movie|tv)-\d+$/.test(entryId)) continue;
        const mediaType = entryId.startsWith('tmdb-tv-') ? 'tv' : 'movie';
        const tmdbId = parseInt(entryId.replace(/\D/g, ''), 10) || 0;
        const existing = itemById.get(entryId);
        baseRows.push({
          id: entryId,
          mediaType,
          tmdbId,
          title: existing?.title ?? entry.title ?? `${mediaType.toUpperCase()} #${tmdbId}`,
          posterPath: existing?.posterPath ?? entry.posterPath,
          releaseDate: existing?.releaseDate ?? entry.releaseDate,
        });
      }
    }
    return baseRows.map((row) => {
      const seen = viewerMode === 'THEIRS' ? friendSeenIds.has(row.id) : mySeenIds.has(row.id);
      const watchlisted = !seen && (viewerMode === 'THEIRS' ? friendWatchlistIds.has(row.id) : watchlist.isInWatchlist(row.id));
      return { ...row, seen, watchlisted };
    });
  }, [activeGlobalCollection, activeCustomCollection, friendListsData, itemById, viewerMode, friendSeenIds, mySeenIds, friendWatchlistIds, watchlist]);

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

  if (loading) return <section className="friend-movie-collection-page"><div className="friend-profile-loading"><div className="loading-spinner">Loading collection...</div></div></section>;
  if (error || !friendProfile || !title) return <section className="friend-movie-collection-page"><Link to={friendProfile ? `/friends/${friendProfile.uid}` : '/friends'} className="back-button"><ArrowLeft size={20} />Back</Link><div className="error">{error ?? 'Collection not found'}</div></section>;

  return (
    <section className="friend-movie-collection-page">
      <header className="page-heading">
        <div>
          <div className="friend-collection-title-row">
            <h1 className="page-title">{title}</h1>
            <span className="friend-movie-collection-count">{visibleRows.length} of {rows.length} entries</span>
          </div>
          <div className="friend-movie-collection-meta">
            <Link to={`/friends/${friendProfile.uid}`} className="back-button"><ArrowLeft size={20} />Back to Profile</Link>
            {collectionSummary ? <p className="friend-collection-summary">{collectionSummary}</p> : null}
          </div>
        </div>
      </header>

      <div className="friend-movie-collection-toolbar">
        <div className="friend-movie-collection-filters">
          <div className="friend-movie-collection-toggle-group">
            <button type="button" className={`filter-toggle-btn friend-movie-collection-filter-btn ${viewerMode === 'THEIRS' ? 'friend-movie-collection-filter-btn--active' : ''}`} onClick={() => setViewerMode('THEIRS')}>Their View</button>
            <button type="button" className={`filter-toggle-btn friend-movie-collection-filter-btn ${viewerMode === 'MINE' ? 'friend-movie-collection-filter-btn--active' : ''}`} onClick={() => setViewerMode('MINE')}>Your View</button>
          </div>
          <span className="friend-movie-collection-toggle-divider" aria-hidden="true" />
          <div className="friend-movie-collection-toggle-group">
            {(['ALL', 'SEEN', 'UNSEEN', 'WATCHLISTED'] as const).map((option) => (
              <button key={option} type="button" className={`filter-toggle-btn friend-movie-collection-filter-btn ${filter === option ? 'friend-movie-collection-filter-btn--active' : ''}`} onClick={() => setFilter(option)}>{option}</button>
            ))}
          </div>
        </div>
        <PageSearch items={searchItems} onSelect={handleSearchSelect} placeholder="Search this collection..." className="friend-collection-page-search" pageKey={`friend-collection-${friendProfile.uid}-${collectionId ?? listId ?? 'unknown'}`} />
      </div>

      {visibleRows.length === 0 ? (
        <div className="friend-movie-collection-empty card-surface">No entries match "{filter}".</div>
      ) : (
        <div className="friend-movie-collection-grid">
          {visibleRows.map((row) => (
            <article key={row.id} id={`friend-collection-tile-${row.id}`} className={`entry-tile friend-collection-tile ${!settings.collectionSeenBorderMode && !row.seen ? 'entry-tile--unseen-muted' : ''} ${!row.seen ? 'entry-tile--collection-unseen' : ''} ${settings.collectionSeenBorderMode && row.seen ? 'entry-tile--seen-border' : ''}`}>
              <div className={`entry-tile-poster ${!settings.collectionSeenBorderMode && !row.seen ? 'entry-tile-poster--unseen-muted' : ''}`}>
                {row.posterPath ? <img src={tmdbImagePath(row.posterPath, 'w185') ?? ''} alt={row.title} loading="lazy" /> : <div className="friend-collection-poster-fallback">{row.mediaType === 'movie' ? <Film size={20} /> : <Tv size={20} />}</div>}
                {row.watchlisted && !row.seen ? <div className="friend-collection-watchlist-pill">Watchlisted</div> : null}
              </div>
              <div className={`entry-tile-title ${row.title.length > 30 ? 'entry-tile-title--small' : ''}`}>{row.title}</div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
