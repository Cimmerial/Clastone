import { NavLink, useNavigate } from 'react-router-dom';
import { Film, Tv, Users, User, Settings, Search, Frown, Flag, ChevronDown, ChevronUp, MessagesSquare, BrainCircuit, BookmarkPlus, BookmarkCheck, Plus, Minus, Cog, Info, Target, RefreshCw } from 'lucide-react';
import { useState, useEffect, useMemo } from 'react';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { loadMovies } from '../lib/firestoreMovies';
import { loadTvShows } from '../lib/firestoreTvShows';
import { loadPeople } from '../lib/firestorePeople';
import { loadDirectors } from '../lib/firestoreDirectors';
import { tmdbImagePath } from '../lib/tmdb';
import type { MovieShowItem, WatchRecord } from '../components/EntryRowMovieShow';
import { useFriends } from '../context/FriendsContext';
import { getWatchRecordSortKey, useMoviesStore } from '../state/moviesStore';
import { useTvStore } from '../state/tvStore';
import { useWatchlistStore } from '../state/watchlistStore';
import { formatProfileWatchDateLabel } from '../lib/watchProfileDateLabel';
import { compareRecentWatchEvents } from '../lib/watchRecordChronology';
import { useAuth } from '../context/AuthContext';
import { UniversalEditModal, type UniversalEditTarget, type UniversalEditSaveParams } from '../components/UniversalEditModal';
import { InfoModal } from '../components/InfoModal';
import { watchMatrixEntriesToWatchRecords } from '../lib/watchMatrixMapping';
import { prepareWatchRecordsForSave } from '../lib/watchDayOrderUtils';
import { useListsStore } from '../state/listsStore';
import { useSettingsStore } from '../state/settingsStore';
import {
  FEATURE_FEEDBACK_DAILY_LIMIT,
  createFeatureFeedback,
  type FeedbackKind,
} from '../lib/firestoreFeatureFeedback';
import './HomePage.css';

type FriendRecentEntry = {
  key: string;
  friendUid: string;
  friendName: string;
  friendPfpPosterPath?: string;
  friendPfpPhotoUrl?: string;
  item: MovieShowItem;
  record: WatchRecord;
  sortKey: string;
  isMovie: boolean;
  friendPercentileRank: string;
};

let friendRecentEntriesCache: {
  ownerUid: string;
  friendsKey: string;
  entries: FriendRecentEntry[];
} | null = null;

interface ExpandableSectionProps {
  title: string;
  children: React.ReactNode;
  defaultExpanded?: boolean;
}

function ExpandableSection({ title, children, defaultExpanded = false }: ExpandableSectionProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  
  return (
    <div className="expandable-section">
      <button 
        className="expandable-header"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <h3>{title}</h3>
        {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
      </button>
      {isExpanded && <div className="expandable-content">{children}</div>}
    </div>
  );
}

export function HomePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { settings, updateSettings } = useSettingsStore();
  const { friends } = useFriends();
  const {
    classes: movieClasses,
    byClass: moviesByClass,
    classOrder: movieClassOrder,
    getClassLabel: getMovieClassLabel,
    addMovieFromSearch,
    moveItemToClass: moveMovieToClass,
    updateMovieWatchRecords,
    getMovieById,
    removeMovieEntry,
  } = useMoviesStore();
  const {
    classes: tvClasses,
    byClass: tvByClass,
    classOrder: tvClassOrder,
    getClassLabel: getTvClassLabel,
    addShowFromSearch,
    moveItemToClass: moveShowToClass,
    updateShowWatchRecords,
    getShowById,
    removeShowEntry,
  } = useTvStore();
  const watchlist = useWatchlistStore();
  const {
    globalCollections,
    collectionIdsByEntryId,
    getEditableListsForMediaType,
    getSelectedListIdsForEntry,
    setEntryListMembership,
  } = useListsStore();
  const [exampleProfile, setExampleProfile] = useState({
    username: 'Cimmerial',
    movieCount: 0,
    showCount: 0,
    actorCount: 0,
    pfpPosterPath: null as string | null,
    pfpPhotoUrl: null as string | null
  });
  /** Firebase UID for the featured example profile (used in /friends/:id link). */
  const [exampleProfileUid, setExampleProfileUid] = useState<string | null>(null);
  const [friendRecentEntries, setFriendRecentEntries] = useState<FriendRecentEntry[]>([]);
  const [settingsFor, setSettingsFor] = useState<MovieShowItem | null>(null);
  const [infoModalTarget, setInfoModalTarget] = useState<{
    tmdbId: number;
    title: string;
    posterPath?: string;
    releaseDate?: string;
    mediaType: 'movie' | 'tv';
  } | null>(null);
  const [showHideExampleProfileConfirm, setShowHideExampleProfileConfirm] = useState(false);
  const [showHideHomeHeroIntroConfirm, setShowHideHomeHeroIntroConfirm] = useState(false);
  const [revealedRanksByEntryKey, setRevealedRanksByEntryKey] = useState<Record<string, boolean>>({});
  const [isFeedbackModalOpen, setIsFeedbackModalOpen] = useState(false);
  const [feedbackKind, setFeedbackKind] = useState<FeedbackKind>('feature_request');
  const [feedbackTitle, setFeedbackTitle] = useState('');
  const [feedbackBody, setFeedbackBody] = useState('');
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);

  // Load example profile data on component mount
  useEffect(() => {
    const loadExampleProfile = async () => {
      try {
        if (!db) return;
        
        // Find admin user UID
        const adminQuery = query(
          collection(db, 'users'),
          where('email', '==', 'cimmerial@clastone.local')
        );
        const adminSnapshot = await getDocs(adminQuery);
        
        if (adminSnapshot.empty) {
          console.log('Admin user not found');
          return;
        }
        
        const adminUid = adminSnapshot.docs[0].id;
        const adminUserData = adminSnapshot.docs[0].data();
        console.log('Found admin UID:', adminUid);
        setExampleProfileUid(adminUid);
        
        // Load admin user's data
        const [moviesData, tvData, peopleData, directorsData] = await Promise.all([
          loadMovies(db, adminUid),
          loadTvShows(db, adminUid),
          loadPeople(db, adminUid),
          loadDirectors(db, adminUid)
        ]);
        
        // Calculate real counts
        let movieCount = 0;
        let showCount = 0;
        let actorCount = 0;
        let directorCount = 0;
        
        // Count movies (excluding unranked)
        if (moviesData?.classes) {
          for (const classDef of moviesData.classes) {
            if (classDef.key !== 'UNRANKED') {
              movieCount += (moviesData.byClass[classDef.key] || []).length;
            }
          }
        }
        
        // Count TV shows (excluding unranked)
        if (tvData?.classes) {
          for (const classDef of tvData.classes) {
            if (classDef.key !== 'UNRANKED') {
              showCount += (tvData.byClass[classDef.key] || []).length;
            }
          }
        }
        
        // Count actors and directors
        if (peopleData?.classes) {
          for (const classDef of peopleData.classes) {
            actorCount += (peopleData.byClass[classDef.key] || []).length;
          }
        }
        
        if (directorsData?.classes) {
          for (const classDef of directorsData.classes) {
            directorCount += (directorsData.byClass[classDef.key] || []).length;
          }
        }
        
        const totalPeople = actorCount + directorCount;
        
        // Update example profile stats
        setExampleProfile({
          username: 'Cimmerial',
          movieCount,
          showCount,
          actorCount: totalPeople,
          pfpPosterPath: typeof adminUserData?.pfpPosterPath === 'string' ? adminUserData.pfpPosterPath : null,
          pfpPhotoUrl: typeof adminUserData?.pfpPhotoUrl === 'string' ? adminUserData.pfpPhotoUrl : null
        });
        
        console.log('Loaded example profile stats:', { movieCount, showCount, totalPeople });
        
      } catch (error) {
        console.error('Failed to load example profile:', error);
      }
    };

    loadExampleProfile();
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadFriendRecentEntries = async (forceRefresh = false) => {
      if (!db || !user || friends.length === 0) {
        setFriendRecentEntries([]);
        return;
      }
      const friendsKey = friends
        .map((f) => `${f.uid}:${f.username}:${f.addedAt ?? ''}`)
        .sort()
        .join('|');
      if (
        !forceRefresh &&
        friendRecentEntriesCache &&
        friendRecentEntriesCache.ownerUid === user.uid &&
        friendRecentEntriesCache.friendsKey === friendsKey
      ) {
        setFriendRecentEntries(friendRecentEntriesCache.entries);
        return;
      }
      const firestoreDb = db;
      try {
        const now = new Date();
        const from = new Date(now);
        from.setDate(from.getDate() - 31);
        const min = toYMD(from);
        const max = toYMD(now);
        const allEntries: FriendRecentEntry[] = [];

        await Promise.all(friends.map(async (friend) => {
          const [friendMovies, friendTv] = await Promise.all([
            loadMovies(firestoreDb, friend.uid),
            loadTvShows(firestoreDb, friend.uid),
          ]);
          const movieRanks = buildFriendGlobalRanks(friendMovies.byClass, friendMovies.classes);
          const tvRanks = buildFriendGlobalRanks(friendTv.byClass, friendTv.classes);
          const push = (item: MovieShowItem, record: WatchRecord, isMovie: boolean) => {
            const sortKey = getWatchRecordSortKey(record);
            if (sortKey === '0000-00-00' || sortKey < min || sortKey > max) return;
            const recordId = record.id ?? `${record.type ?? 'DATE'}-${sortKey}`;
            allEntries.push({
              key: `${friend.uid}-${item.id}-${recordId}`,
              friendUid: friend.uid,
              friendName: friend.username,
              friendPfpPosterPath: friend.pfpPosterPath,
              friendPfpPhotoUrl: friend.pfpPhotoUrl,
              item,
              record,
              sortKey,
              isMovie,
              friendPercentileRank: isMovie ? (movieRanks.get(item.id) ?? 'N/A') : (tvRanks.get(item.id) ?? 'N/A'),
            });
          };

          for (const list of Object.values(friendMovies.byClass ?? {})) {
            for (const item of list) {
              for (const record of item.watchRecords ?? []) push(item, record, true);
            }
          }
          for (const list of Object.values(friendTv.byClass ?? {})) {
            for (const item of list) {
              for (const record of item.watchRecords ?? []) push(item, record, false);
            }
          }
        }));

        allEntries.sort(compareRecentWatchEvents);
        if (!cancelled) {
          setFriendRecentEntries(allEntries);
          friendRecentEntriesCache = {
            ownerUid: user.uid,
            friendsKey,
            entries: allEntries,
          };
        }
      } catch (error) {
        console.error('Failed to load friend recent watches:', error);
        if (!cancelled) setFriendRecentEntries([]);
      }
    };

    void loadFriendRecentEntries(false);
    return () => {
      cancelled = true;
    };
  }, [friends, user]);

  const shouldShowFriendCarousel = useMemo(
    () => Boolean(user) && friends.length > 0 && friendRecentEntries.length > 0,
    [user, friends.length, friendRecentEntries.length]
  );

  const handleSaveToUnranked = (entry: { item: MovieShowItem; isMovie: boolean }) => {
    if (entry.isMovie) {
      const existing = getMovieById(entry.item.id);
      if (existing) moveMovieToClass(entry.item.id, 'UNRANKED');
      else {
        addMovieFromSearch({
          id: entry.item.id,
          title: entry.item.title,
          subtitle: entry.item.releaseDate ? entry.item.releaseDate.slice(0, 4) : 'Saved',
          classKey: 'UNRANKED',
          posterPath: entry.item.posterPath,
        });
      }
      return;
    }
    const existing = getShowById(entry.item.id);
    if (existing) moveShowToClass(entry.item.id, 'UNRANKED');
    else {
      addShowFromSearch({
        id: entry.item.id,
        title: entry.item.title,
        subtitle: entry.item.releaseDate ? entry.item.releaseDate.slice(0, 4) : 'Saved',
        classKey: 'UNRANKED',
      });
    }
  };

  const getEntryRankState = (entry: { item: MovieShowItem; isMovie: boolean }) => {
    if (entry.isMovie) {
      const existing = getMovieById(entry.item.id);
      if (!existing) return { exists: false, classKey: null as string | null, isRanked: false };
      const classDef = movieClasses.find((c) => c.key === existing.classKey);
      return { exists: true, classKey: existing.classKey ?? null, isRanked: classDef?.isRanked === true };
    }
    const existing = getShowById(entry.item.id);
    if (!existing) return { exists: false, classKey: null as string | null, isRanked: false };
    const classDef = tvClasses.find((c) => c.key === existing.classKey);
    return { exists: true, classKey: existing.classKey ?? null, isRanked: classDef?.isRanked === true };
  };

  const saveFromModal = async (params: UniversalEditSaveParams) => {
    if (!settingsFor) return;
    const keepModalOpen = Boolean(params.keepModalOpen);
    const watches = prepareWatchRecordsForSave(
      watchMatrixEntriesToWatchRecords(params.watches),
      settingsFor.id,
      moviesByClass,
      tvByClass,
      movieClassOrder,
      tvClassOrder
    );
    const isTv = settingsFor.id.startsWith('tmdb-tv-');
    if (isTv && !getShowById(settingsFor.id)) {
      addShowFromSearch({
        id: settingsFor.id,
        title: settingsFor.title,
        subtitle: 'Saved',
        classKey: 'UNRANKED',
      });
    }
    if (!isTv && !getMovieById(settingsFor.id)) {
      addMovieFromSearch({
        id: settingsFor.id,
        title: settingsFor.title,
        subtitle: 'Saved',
        classKey: 'UNRANKED',
        posterPath: settingsFor.posterPath,
      });
    }
    if (isTv) updateShowWatchRecords(settingsFor.id, watches);
    else updateMovieWatchRecords(settingsFor.id, watches);
    if (params.classKey) {
      const moveOptions = { toTop: params.position === 'top', toMiddle: params.position === 'middle' };
      if (isTv) moveShowToClass(settingsFor.id, params.classKey, moveOptions);
      else moveMovieToClass(settingsFor.id, params.classKey, moveOptions);
    }
    if (params.listMemberships?.length) {
      setEntryListMembership(settingsFor.id, isTv ? 'tv' : 'movie', params.listMemberships, {
        title: settingsFor.title,
        posterPath: settingsFor.posterPath,
        releaseDate: settingsFor.releaseDate
      });
    }
    if (!keepModalOpen) {
      setSettingsFor(null);
    }
  };

  const feedbackWordCount = useMemo(() => countWords(feedbackBody), [feedbackBody]);
  const feedbackTitleLength = feedbackTitle.length;

  const submitFeatureFeedback = async () => {
    if (!db) {
      setFeedbackError('Feedback is unavailable until Firebase is configured.');
      return;
    }
    const title = feedbackTitle.trim();
    const body = feedbackBody.trim();
    const bodyForSave = body.length > 0 ? body : '(no details provided)';
    if (!title) {
      setFeedbackError('Please add a title.');
      return;
    }
    if (title.length > 250) {
      setFeedbackError('Title must be 250 characters or fewer.');
      return;
    }
    if (feedbackWordCount > 1500) {
      setFeedbackError('Body must be 1500 words or fewer.');
      return;
    }

    const authorUid = user?.uid ?? null;
    const authorKey = authorUid ? `uid:${authorUid}` : getAnonymousFeedbackAuthorKey();
    const authorLabel = user?.displayName ?? user?.email ?? 'Anonymous';
    setIsSubmittingFeedback(true);
    setFeedbackError(null);
    try {
      const recentCount = getRecentLocalFeedbackSubmissionCount(authorKey);
      if (recentCount >= FEATURE_FEEDBACK_DAILY_LIMIT) {
        setFeedbackError('You have reached the max of 20 submissions in the last 24 hours.');
        return;
      }
      await createFeatureFeedback(db, {
        kind: feedbackKind,
        title,
        body: bodyForSave,
        authorUid,
        authorLabel,
        authorKey,
      });
      setFeedbackTitle('');
      setFeedbackBody('');
      setFeedbackKind('feature_request');
      setIsFeedbackModalOpen(false);
      recordLocalFeedbackSubmission(authorKey);
    } catch (error) {
      setFeedbackError(error instanceof Error ? error.message : 'Could not submit right now.');
    } finally {
      setIsSubmittingFeedback(false);
    }
  };

  return (
    <div className="homepage-root homepage-root">
      <div className="homepage-container">
        <header className="homepage-header">
          <h1 className="homepage-wordmark">CLASTONE</h1>
          <span
            className="homepage-feedback-open-text"
            role="button"
            tabIndex={0}
            onClick={() => setIsFeedbackModalOpen(true)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setIsFeedbackModalOpen(true);
              }
            }}
          >
            Feature request or bug report
          </span>
        </header>

        <main className="homepage-main">
          {settings.showHomeHeroIntro ? (
            <div className="homepage-hero-intro-block">
              <section className="homepage-hero">
                <div className="hero-content">
                  <h2 className="hero-title">Rank, Track, Organize</h2>
                  <p className="hero-description">
                    Rank your movies, shows, actors, and directors in a class-based system (far superior to a simple 5 star scale).
                    View your friend profiles, see watchlist overlap, and make suggestions.
                  </p>
                  <div className="hero-actions">
                    <NavLink to="/search" className="hero-btn primary">
                      <Search size={20} />
                      Add Movies/Shows/People
                    </NavLink>
                    <NavLink to="/movies" className="hero-btn primary">
                      <Film size={20} />
                      Your Movies
                    </NavLink>
                    <NavLink to="/tv" className="hero-btn primary">
                      <Tv size={20} />
                      Your TV Shows
                    </NavLink>
                    <NavLink to="/settings" className="hero-btn secondary">
                      <Settings size={20} />
                      Edit Classes
                    </NavLink>
                    <NavLink to="/friends" className="hero-btn secondary">
                      <Users size={20} />
                      People
                    </NavLink>

                    <NavLink to="/profile" className="hero-btn secondary">
                      <User size={20} />
                      View My Stats
                    </NavLink>
                  </div>
                </div>
              </section>
              <span
                className="homepage-example-profile-hide-text"
                role="button"
                tabIndex={0}
                onClick={() => setShowHideHomeHeroIntroConfirm(true)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setShowHideHomeHeroIntroConfirm(true);
                  }
                }}
              >
                Hide Home intro quick-start block
              </span>
            </div>
          ) : null}

          <section className="homepage-example-profile">
            {shouldShowFriendCarousel && (
              <section className="homepage-friends-watching">
                <div className="homepage-friends-watching-header">
                  <h2>What your friends are watching</h2>
                  <button
                    type="button"
                    className="homepage-friends-refresh-btn"
                    onClick={async () => {
                      if (!db || !user) return;
                      const firestoreDb = db;
                      const now = new Date();
                      const from = new Date(now);
                      from.setDate(from.getDate() - 31);
                      const min = toYMD(from);
                      const max = toYMD(now);
                      const allEntries: FriendRecentEntry[] = [];
                      await Promise.all(friends.map(async (friend) => {
                        const [friendMovies, friendTv] = await Promise.all([
                          loadMovies(firestoreDb, friend.uid),
                          loadTvShows(firestoreDb, friend.uid),
                        ]);
                        const movieRanks = buildFriendGlobalRanks(friendMovies.byClass, friendMovies.classes);
                        const tvRanks = buildFriendGlobalRanks(friendTv.byClass, friendTv.classes);
                        const push = (item: MovieShowItem, record: WatchRecord, isMovie: boolean) => {
                          const sortKey = getWatchRecordSortKey(record);
                          if (sortKey === '0000-00-00' || sortKey < min || sortKey > max) return;
                          const recordId = record.id ?? `${record.type ?? 'DATE'}-${sortKey}`;
                          allEntries.push({
                            key: `${friend.uid}-${item.id}-${recordId}`,
                            friendUid: friend.uid,
                            friendName: friend.username,
                            friendPfpPosterPath: friend.pfpPosterPath,
                            friendPfpPhotoUrl: friend.pfpPhotoUrl,
                            item,
                            record,
                            sortKey,
                            isMovie,
                            friendPercentileRank: isMovie ? (movieRanks.get(item.id) ?? 'N/A') : (tvRanks.get(item.id) ?? 'N/A'),
                          });
                        };
                        for (const list of Object.values(friendMovies.byClass ?? {})) {
                          for (const item of list) {
                            for (const record of item.watchRecords ?? []) push(item, record, true);
                          }
                        }
                        for (const list of Object.values(friendTv.byClass ?? {})) {
                          for (const item of list) {
                            for (const record of item.watchRecords ?? []) push(item, record, false);
                          }
                        }
                      }));
                      allEntries.sort(compareRecentWatchEvents);
                      setFriendRecentEntries(allEntries);
                      friendRecentEntriesCache = {
                        ownerUid: user.uid,
                        friendsKey: friends.map((f) => `${f.uid}:${f.username}:${f.addedAt ?? ''}`).sort().join('|'),
                        entries: allEntries,
                      };
                    }}
                    title="Refresh friends watches"
                    aria-label="Refresh friends watches"
                  >
                    <RefreshCw size={14} />
                  </button>
                </div>
                <div className="homepage-friends-carousel" role="list">
                  {friendRecentEntries.map((entry) => {
                    const inWatchlist = watchlist.isInWatchlist(entry.item.id);
                    const rankState = getEntryRankState(entry);
                    const canAddToUnranked = !rankState.isRanked && rankState.classKey !== 'UNRANKED';
                    const canRemoveFromUnranked = rankState.classKey === 'UNRANKED';
                    const rankBadgeText = entry.friendPercentileRank;
                    const rankRevealed = Boolean(revealedRanksByEntryKey[entry.key]);
                    const pfpSrc = entry.friendPfpPosterPath
                      ? tmdbImagePath(entry.friendPfpPosterPath, 'w92')
                      : (entry.friendPfpPhotoUrl ?? null);
                    return (
                      <article
                        key={entry.key}
                        className="homepage-friends-item"
                        role="listitem"
                        title={entry.item.title}
                      >
                        <div className="homepage-friends-poster-wrap">
                          {entry.item.posterPath ? (
                            <img
                              src={tmdbImagePath(entry.item.posterPath, 'w185') ?? ''}
                              alt=""
                              loading="lazy"
                              className="homepage-friends-poster"
                            />
                          ) : (
                            <div className="homepage-friends-poster-fallback">{entry.isMovie ? '🎬' : '📺'}</div>
                          )}
                          <div className="homepage-friends-watcher-avatar" title={entry.friendName}>
                            {pfpSrc ? (
                              <img src={pfpSrc} alt={entry.friendName} loading="lazy" />
                            ) : (
                              <span>{entry.friendName.charAt(0).toUpperCase()}</span>
                            )}
                          </div>
                          <button
                            type="button"
                            className={`homepage-friends-rank-toggle ${rankRevealed ? 'homepage-friends-rank-toggle--revealed' : ''}`}
                            onClick={() => {
                              setRevealedRanksByEntryKey((prev) => ({ ...prev, [entry.key]: true }));
                            }}
                            title={rankRevealed ? `Percentile rank: ${rankBadgeText}` : 'See rank'}
                          >
                            {rankRevealed ? rankBadgeText : 'See rank'}
                          </button>
                          <button
                            type="button"
                            className="homepage-friends-hover-name homepage-friends-profile-link"
                            onClick={() => navigate(`/friends/${entry.friendUid}`)}
                            title={`See ${entry.friendName}'s profile`}
                          >
                            <span className="homepage-friends-profile-link-default">{entry.friendName}</span>
                            <span className="homepage-friends-profile-link-hover">See profile</span>
                          </button>
                          <div className="homepage-friends-actions">
                            <button
                              type="button"
                              className={`homepage-friends-action-btn homepage-friends-action-btn--watchlist ${inWatchlist ? 'homepage-friends-action-btn--watchlist-remove' : 'homepage-friends-action-btn--watchlist-add'}`}
                              title={inWatchlist ? 'Remove from watchlist' : 'Add to watchlist'}
                              onClick={() => {
                                if (inWatchlist) watchlist.removeFromWatchlist(entry.item.id);
                                else {
                                  watchlist.addToWatchlist({
                                    id: entry.item.id,
                                    title: entry.item.title,
                                    posterPath: entry.item.posterPath,
                                    releaseDate: entry.item.releaseDate,
                                  }, entry.isMovie ? 'movies' : 'tv');
                                }
                              }}
                            >
                              {inWatchlist ? <BookmarkCheck size={14} /> : <BookmarkPlus size={14} />}
                            </button>
                            {canAddToUnranked ? (
                              <button
                                type="button"
                                className="homepage-friends-action-btn"
                                title={entry.isMovie ? 'Add movie to unranked' : 'Add show to unranked'}
                                onClick={() => handleSaveToUnranked(entry)}
                              >
                                <Plus size={14} />
                              </button>
                            ) : null}
                            {canRemoveFromUnranked ? (
                              <button
                                type="button"
                                className="homepage-friends-action-btn homepage-friends-action-btn--danger"
                                title={entry.isMovie ? 'Remove movie from unranked' : 'Remove show from unranked'}
                                onClick={() => {
                                  if (entry.isMovie) removeMovieEntry(entry.item.id);
                                  else removeShowEntry(entry.item.id);
                                }}
                              >
                                <Minus size={14} />
                              </button>
                            ) : null}
                            <button
                              type="button"
                              className="homepage-friends-action-btn"
                              title="Info"
                              onClick={() => {
                                const tmdbId = entry.item.tmdbId ?? (parseInt(entry.item.id.replace(/\D/g, ''), 10) || 0);
                                setInfoModalTarget({
                                  tmdbId,
                                  title: entry.item.title,
                                  posterPath: entry.item.posterPath,
                                  releaseDate: entry.item.releaseDate,
                                  mediaType: entry.isMovie ? 'movie' : 'tv',
                                });
                              }}
                            >
                              <Info size={14} />
                            </button>
                            <button
                              type="button"
                              className="homepage-friends-action-btn"
                              title="Watch/settings"
                              onClick={() => setSettingsFor(entry.item)}
                            >
                              <Cog size={14} />
                            </button>
                          </div>
                        </div>
                        <div className="homepage-friends-item-date">{withoutYearLabel(formatProfileWatchDateLabel(entry.record))}</div>
                      </article>
                    );
                  })}
                </div>
              </section>
            )}
            {settings.showExampleProfile ? (
            <div className="example-profile-card">
              <div className="profile-preview">
                <div className="profile-avatar-container">
                  <div className="profile-avatar">
                    {exampleProfile.pfpPosterPath ? (
                      <img
                        src={tmdbImagePath(exampleProfile.pfpPosterPath, 'w185') ?? ''}
                        alt={`${exampleProfile.username} profile`}
                        className="profile-avatar-image"
                      />
                    ) : exampleProfile.pfpPhotoUrl ? (
                      <img
                        src={exampleProfile.pfpPhotoUrl}
                        alt={`${exampleProfile.username} profile`}
                        className="profile-avatar-image"
                      />
                    ) : (
                      <User size={64} />
                    )}
                    <Frown className="premium-badge-icon" size={24} />
                  </div>
                </div>
                <div className="profile-info">
                  <div className="profile-title-row">
                    <h3 className="example-title">Example Profile: <span className="highlight-username">{exampleProfile.username}</span></h3>
                    <div className="verified-badge">Featured</div>
                  </div>
                  <p className="example-tagline">Peruse a fully filled out profile to see Clastone's capabilities. Or don't, whatever.</p>
                  <div className="profile-stats">
                    <div className="stat-pill">
                      <Film size={16} />
                      <span>{exampleProfile.movieCount.toLocaleString()} Movies</span>
                    </div>
                    <div className="stat-pill">
                      <Tv size={16} />
                      <span>{exampleProfile.showCount.toLocaleString()} TV Shows</span>
                    </div>
                    <div className="stat-pill">
                      <Users size={16} />
                      <span>{exampleProfile.actorCount.toLocaleString()} People</span>
                    </div>
                  </div>
                </div>
              </div>
              <NavLink
                to={exampleProfileUid ? `/friends/${exampleProfileUid}` : '/friends'}
                className="profile-view-btn"
              >
                <span>View Example Profile</span>
                <ChevronDown className="btn-arrow" size={20} style={{ transform: 'rotate(-90deg)' }} />
              </NavLink>
            </div>
            ) : null}
            {settings.showExampleProfile ? (
              <span
                className="homepage-example-profile-hide-text"
                role="button"
                tabIndex={0}
                onClick={() => setShowHideExampleProfileConfirm(true)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setShowHideExampleProfileConfirm(true);
                  }
                }}
              >
                Hide Example Profile
              </span>
            ) : null}
          </section>

          <section className="homepage-features">
            <header className="features-section-header">
              <div className="features-title-wrapper">
                <Flag className="section-icon" size={32} />
                <h2 className="features-title">Features</h2>
              </div>
            </header>
            
            <div className="features-grid">
              <div className="feature-column">
                <div className="feature-card new">
                  <h3 className="feature-group-title">New</h3>
                  <ul className="feature-list">
                    <li>Can create custom lists and collections (can add to collections from persons filmography)</li>
                    <li>Many QOL changes (watchlist buttons in info modal, auto switch to watch type "Single Date" if using preset date picker, can search and filter within collections, etc)</li>
                    <li>Can leave review for each movie/show watch</li>
                    <li>Info modal buffed out; can go to other info modals and record watch modal from it</li>
                    <li>Can edit the main image of given entry/person once saved from watch edit modal</li>
                  </ul>
                </div>
              </div>
              
              <div className="feature-column">
                <div className="feature-card future">
                  <h3 className="feature-group-title">Future</h3>
                  <ul className="feature-list">
                    <li>quick move button options for moving around entries</li>
                    <li>The copy list(s) doesnt work on mobile, will fix</li>
                    <li>Download profile ad PDF (custom ordering of data, select certain aspects of profile, etc)</li>
                    <li>Reduce dragging lag</li>
                  </ul>
                </div>
              </div>
            </div>

        
          </section>

          <section className="homepage-guides">
            <header className="guides-section-header">
              <div className="guides-title-wrapper">
                <h2 className="guides-title">Workflow Guides</h2>
              </div>
              <p className="guides-description">
                Three guides I am confident nobody will read. They are certifiably not helpful. Much excite. Cheers!
              </p>
            </header>
            
            <div className="guides-grid">
              <div className="guide-column">
                <div className="guide-card">
                  <div className="guide-card-header">
                    <div className="guide-icon-box"><Target size={28} /></div>
                    <div className="guide-header-text">
                      <h3 className="guide-title">Clastonian Noob</h3>
                      <p className="guide-subtitle">Beginning your Clastone journey</p>
                    </div>
                  </div>
                  <div className="guide-content">
                    <ul className="guide-list">
                      <li>Go to <strong>Search</strong>, save your top movies and shows</li>
                      <li>Start by filling in the top and bottom of each ranking page, then fill in the middle</li>
                      <li>Tweak as you go - change classes to suit your personal data</li>
                    </ul>
                  </div>
                </div>
              </div>
              
              <div className="guide-column">
                <div className="guide-card">
                  <div className="guide-card-header">
                    <div className="guide-icon-box"><Search size={28} /></div>
                    <div className="guide-header-text">
                      <h3 className="guide-title">Deeper Dive</h3>
                      <p className="guide-subtitle">Expand your collection through smart connections</p>
                    </div>
                  </div>
                  <div className="guide-content">
                    <ul className="guide-list">
                      <li>Using the <strong>info modal</strong>, start to go back and forth between actors, movies, directors, and shows, saving as you go</li>
                      <li>Use this random searching to record a good number of entries you might've missed</li>
                      <li>Go to the <strong>Friends</strong> page and scroll through their profiles, saving what you've seen that they've saved</li>
                    </ul>
                  </div>
                </div>
              </div>
              
              <div className="guide-column">
                <div className="guide-card">
                  <div className="guide-card-header">
                    <div className="guide-icon-box"><BrainCircuit size={28} /></div>
                    <div className="guide-header-text">
                      <h3 className="guide-title">Iceberg Mining</h3>
                      <p className="guide-subtitle">Comprehensive discovery for completionists</p>
                    </div>
                  </div>
                  <div className="guide-content">
                    <ul className="guide-list">
                      <li>Go to the <strong>Doomscroll tab</strong> in Search page</li>
                      <li>Start at the current year, scroll and save</li>
                      <li>Continue until you decide to move to the prior year(s)</li>
                      <li>Rinse and repeat</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </main>
      </div>
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
          availableTags={getEditableListsForMediaType(settingsFor.id.startsWith('tmdb-tv-') ? 'tv' : 'movie').map((list) => ({
            listId: list.id,
            label: list.name,
            color: list.color,
            selected: getSelectedListIdsForEntry(settingsFor.id).includes(list.id),
            editableInWatchModal: list.allowWatchModalTagEditing !== false,
            href: `/lists/${list.id}`,
          }))}
          collectionTags={(collectionIdsByEntryId.get(settingsFor.id) ?? []).map((id) => ({
            id,
            label: globalCollections.find((item) => item.id === id)?.name ?? id,
            color: globalCollections.find((item) => item.id === id)?.color,
            href: `/lists/collection/${id}`,
          }))}
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
          onTagToggle={(listId, selected) => {
            const isTv = settingsFor.id.startsWith('tmdb-tv-');
            setEntryListMembership(settingsFor.id, isTv ? 'tv' : 'movie', [{ listId, selected }], {
              title: settingsFor.title,
              posterPath: settingsFor.posterPath,
              releaseDate: settingsFor.releaseDate
            });
          }}
          onGoPickTemplate={() => setSettingsFor(null)}
          isSaving={false}
          onClose={() => setSettingsFor(null)}
          onSave={saveFromModal}
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
            const targetId = `tmdb-${infoModalTarget.mediaType}-${infoModalTarget.tmdbId}`;
            const target = friendRecentEntries.find((e) => e.item.id === targetId)?.item;
            if (target) {
              setInfoModalTarget(null);
              setSettingsFor(target);
            }
          }}
        />
      ) : null}
      {showHideExampleProfileConfirm ? (
        <div className="homepage-hide-example-modal-backdrop" onClick={() => setShowHideExampleProfileConfirm(false)}>
          <div className="homepage-hide-example-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Hide example profile?</h3>
            <p>Are you sure you want to hide it? You can re-enable it in Settings.</p>
            <div className="homepage-hide-example-modal-actions">
              <button
                type="button"
                className="homepage-hide-example-modal-btn homepage-hide-example-modal-btn--confirm"
                onClick={() => {
                  updateSettings({ showExampleProfile: false });
                  setShowHideExampleProfileConfirm(false);
                }}
              >
                Yes, hide it
              </button>
              <button
                type="button"
                className="homepage-hide-example-modal-btn"
                onClick={() => setShowHideExampleProfileConfirm(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {showHideHomeHeroIntroConfirm ? (
        <div className="homepage-hide-example-modal-backdrop" onClick={() => setShowHideHomeHeroIntroConfirm(false)}>
          <div className="homepage-hide-example-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Hide Home intro quick-start block?</h3>
            <p>Are you sure you want to hide it? You can re-enable it in Settings (Show Home intro quick-start block).</p>
            <div className="homepage-hide-example-modal-actions">
              <button
                type="button"
                className="homepage-hide-example-modal-btn homepage-hide-example-modal-btn--confirm"
                onClick={() => {
                  updateSettings({ showHomeHeroIntro: false });
                  setShowHideHomeHeroIntroConfirm(false);
                }}
              >
                Yes, hide it
              </button>
              <button
                type="button"
                className="homepage-hide-example-modal-btn"
                onClick={() => setShowHideHomeHeroIntroConfirm(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {isFeedbackModalOpen ? (
        <div className="homepage-feedback-modal-backdrop" role="presentation">
          <div
            className="homepage-feedback-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Feature request or bug report"
          >
            <div className="homepage-feedback-modal-header">
              <h3>Feature request or bug report</h3>
              <button
                type="button"
                className="homepage-feedback-modal-close"
                onClick={() => {
                  if (isSubmittingFeedback) return;
                  setIsFeedbackModalOpen(false);
                }}
                aria-label="Close"
                disabled={isSubmittingFeedback}
              >
                ✕
              </button>
            </div>
            <div className="homepage-feedback-type-toggle">
              <button
                type="button"
                className={feedbackKind === 'feature_request' ? 'is-active' : ''}
                onClick={() => setFeedbackKind('feature_request')}
                disabled={isSubmittingFeedback}
              >
                Feature request
              </button>
              <button
                type="button"
                className={feedbackKind === 'bug_report' ? 'is-active' : ''}
                onClick={() => setFeedbackKind('bug_report')}
                disabled={isSubmittingFeedback}
              >
                Bug report
              </button>
            </div>
            <label className="homepage-feedback-label">
              Title
              <input
                className="homepage-feedback-input"
                value={feedbackTitle}
                onChange={(e) => setFeedbackTitle(e.target.value.slice(0, 250))}
                maxLength={250}
                placeholder="Short title"
                disabled={isSubmittingFeedback}
              />
              <span className="homepage-feedback-count">{feedbackTitleLength}/250</span>
            </label>
            <label className="homepage-feedback-label">
              Body
              <textarea
                className="homepage-feedback-textarea"
                value={feedbackBody}
                onChange={(e) => setFeedbackBody(e.target.value)}
                placeholder="Describe the feature or bug details"
                disabled={isSubmittingFeedback}
              />
              <span className="homepage-feedback-count">{feedbackWordCount}/1500 words</span>
            </label>
            {feedbackError ? <p className="homepage-feedback-error">{feedbackError}</p> : null}
            <div className="homepage-feedback-actions">
              <button
                type="button"
                className="homepage-feedback-submit"
                onClick={() => void submitFeatureFeedback()}
                disabled={isSubmittingFeedback}
              >
                {isSubmittingFeedback ? 'Submitting...' : 'Submit'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function toYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function withoutYearLabel(label: string): string {
  return label
    .replace(/,\s*\d{4}\b/g, '')
    .replace(/\b\d{4}\b/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function normalizePercentileLabel(value: string | null | undefined): string {
  const text = String(value ?? '').trim();
  if (/^\d+%$/.test(text)) return text;
  return 'N/A';
}

function buildFriendGlobalRanks(
  byClass: Record<string, MovieShowItem[]>,
  classes: Array<{ key: string; isRanked?: boolean }>
): Map<string, string> {
  const rankedClassKeys = classes.filter((c) => c.isRanked !== false).map((c) => c.key);
  const rankedItems = rankedClassKeys.flatMap((key) => byClass[key] ?? []);
  const total = rankedItems.length;
  const map = new Map<string, string>();
  if (total <= 0) return map;
  rankedItems.forEach((item, index) => {
    map.set(item.id, `${Math.round(((total - index) / total) * 100)}%`);
  });
  return map;
}

function countWords(value: string): number {
  const trimmed = value.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

function getAnonymousFeedbackAuthorKey(): string {
  const storageKey = 'clastone_feedback_author_key';
  const existing = window.localStorage.getItem(storageKey);
  if (existing) return existing;
  const next = `anon:${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  window.localStorage.setItem(storageKey, next);
  return next;
}

function getRecentLocalFeedbackSubmissionCount(authorKey: string): number {
  const list = readLocalFeedbackSubmissionTimes(authorKey);
  const cutoff = Date.now() - (24 * 60 * 60 * 1000);
  return list.filter((ts) => ts >= cutoff).length;
}

function recordLocalFeedbackSubmission(authorKey: string): void {
  const cutoff = Date.now() - (24 * 60 * 60 * 1000);
  const list = readLocalFeedbackSubmissionTimes(authorKey).filter((ts) => ts >= cutoff);
  list.push(Date.now());
  writeLocalFeedbackSubmissionTimes(authorKey, list);
}

function readLocalFeedbackSubmissionTimes(authorKey: string): number[] {
  const raw = window.localStorage.getItem(`clastone_feedback_rate_${authorKey}`);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value) && value > 0);
  } catch {
    return [];
  }
}

function writeLocalFeedbackSubmissionTimes(authorKey: string, values: number[]): void {
  window.localStorage.setItem(`clastone_feedback_rate_${authorKey}`, JSON.stringify(values.slice(-FEATURE_FEEDBACK_DAILY_LIMIT)));
}
