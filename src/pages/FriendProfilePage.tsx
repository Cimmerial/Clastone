import { useMemo, useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { ArrowLeft, Calendar, Film, Tv, Users, Star, Trophy, User, Video, BarChart3 } from 'lucide-react';
import { loadMovies } from '../lib/firestoreMovies';
import { loadTvShows } from '../lib/firestoreTvShows';
import { loadPeople } from '../lib/firestorePeople';
import { loadDirectors } from '../lib/firestoreDirectors';
import type { MovieShowItem, WatchRecord } from '../components/EntryRowMovieShow';
import { tmdbImagePath, tmdbMovieDetailsFull, tmdbTvDetailsFull } from '../lib/tmdb';
import { 
  useMoviesStore,
  getTotalMinutesFromRecords, 
  getTotalEpisodesFromRecords, 
  formatDuration, 
  getWatchRecordSortKey, 
  formatWatchLabel 
} from '../state/moviesStore';
import { useTvStore } from '../state/tvStore';
import { UniversalEditModal, type UniversalEditTarget } from '../components/UniversalEditModal';
import { RandomQuote } from '../components/RandomQuote';
import './FriendProfilePage.css';

interface FriendProfile {
  uid: string;
  username: string;
  email: string;
  createdAt: string;
}

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
  const from = new Date(now);
  from.setDate(from.getDate() - 365);
  return { min: toYMD(from), max: toYMD(now) };
}

export function FriendProfilePage() {
  const { friendId } = useParams<{ friendId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [friendProfile, setFriendProfile] = useState<FriendProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Ranking modal state
  const [rankingTarget, setRankingTarget] = useState<UniversalEditTarget | null>(null);
  const [isRankingSaving, setIsRankingSaving] = useState(false);

  // Current user's stores (to check SEEN vs SAVE status)
  const {
    byClass: myMoviesByClass,
    classOrder: myMovieClassOrder,
    getClassLabel: getMovieClassLabel,
    classes: movieClasses,
    addMovieFromSearch,
    updateMovieWatchRecords,
    moveItemToClass: moveMovieToClass,
    removeMovieEntry,
  } = useMoviesStore();
  const {
    byClass: myTvByClass,
    classOrder: myTvClassOrder,
    getClassLabel: getTvClassLabel,
    classes: tvClasses,
    addTvShowFromSearch,
    updateTvShowWatchRecords,
    moveItemToClass: moveTvToClass,
    removeTvShowEntry,
  } = useTvStore();

  // Friend data states
  const [friendMoviesData, setFriendMoviesData] = useState<any>(null);
  const [friendTvData, setFriendTvData] = useState<any>(null);
  const [friendPeopleData, setFriendPeopleData] = useState<any>(null);
  const [friendDirectorsData, setFriendDirectorsData] = useState<any>(null);

  const [recentRange, setRecentRange] = useState<'this_year' | 'last_month' | 'last_year' | 'all_time'>('this_year');
  const [showExpandedStats, setShowExpandedStats] = useState(false);

  // Cache for friends data to avoid repeated requests
  const [friendsCache, setFriendsCache] = useState<Map<string, any>>(new Map());

  // NOTE: The UI already shows "Top 10 Movies" and "Top 10 Shows" - 
  // charts removed as requested

  useEffect(() => {
    const loadFriendProfile = async () => {
      if (!friendId || !db) return;

      try {
        console.log('🔍 Starting friend profile load for:', friendId);
        console.log('👤 Current user:', user?.uid);

        // Check if they are friends
        console.log('🤝 Checking friendship...');
        const friendsQuery1 = query(
          collection(db!, 'friends'),
          where('userId', '==', user?.uid),
          where('friendUid', '==', friendId)
        );
        const friendsQuery2 = query(
          collection(db!, 'friends'),
          where('userId', '==', friendId),
          where('friendUid', '==', user?.uid)
        );

        console.log('📋 Executing friendship queries...');
        const [friendsSnapshot1, friendsSnapshot2] = await Promise.all([
          getDocs(friendsQuery1),
          getDocs(friendsQuery2)
        ]);

        console.log('📊 Friendship check results:');
        console.log('  Query 1 results:', friendsSnapshot1.size);
        console.log('  Query 2 results:', friendsSnapshot2.size);

        if (friendsSnapshot1.empty && friendsSnapshot2.empty) {
          console.log('❌ No friendship found');
          setError('You are not friends with this user');
          return;
        }

        console.log('✅ Friendship confirmed');

        // Load friend's profile
        console.log('👤 Loading friend profile...');
        const friendDoc = await getDoc(doc(db!, 'users', friendId));
        if (friendDoc.exists()) {
          console.log('✅ Friend profile loaded:', friendDoc.data());
          setFriendProfile({
            uid: friendId,
            ...friendDoc.data()
          } as FriendProfile);
        } else {
          console.log('❌ Friend profile not found');
          setError('Friend profile not found');
          return;
        }

        // Load all friend data using the same functions as the user's profile
        console.log('📼 Loading friend movie data...');
        const moviesData = await loadMovies(db!, friendId);
        console.log('✅ Movies loaded:', moviesData);

        console.log('📺 Loading friend TV data...');
        const tvData = await loadTvShows(db!, friendId);
        console.log('✅ TV shows loaded:', tvData);

        console.log('🎭 Loading friend actors data...');
        const peopleData = await loadPeople(db!, friendId);
        console.log('✅ Actors loaded:', peopleData);

        console.log('🎬 Loading friend directors data...');
        const directorsData = await loadDirectors(db!, friendId);
        console.log('✅ Directors loaded:', directorsData);

        setFriendMoviesData(moviesData);
        setFriendTvData(tvData);
        setFriendPeopleData(peopleData);
        setFriendDirectorsData(directorsData);

        console.log('🎉 All friend data loaded successfully!');

      } catch (err: any) {
        console.error('❌ Failed to load friend profile:', err);
        console.error('❌ Error details:', {
          code: err.code,
          message: err.message,
          stack: err.stack
        });
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    loadFriendProfile();
  }, [friendId, user, db]);

  const rankedMovies = useMemo(() => {
    if (!friendMoviesData || !friendMoviesData.byClass || !friendMoviesData.classes) return [];
    const list: MovieShowItem[] = [];
    for (const classDef of friendMoviesData.classes) {
      const classKey = classDef.key;
      if (!classDef.isRanked) continue;
      for (const item of friendMoviesData.byClass[classKey] ?? []) list.push(item);
    }
    return list;
  }, [friendMoviesData]);

  const rankedShows = useMemo(() => {
    if (!friendTvData || !friendTvData.byClass || !friendTvData.classes) return [];
    const list: MovieShowItem[] = [];
    for (const classDef of friendTvData.classes) {
      const classKey = classDef.key;
      if (!classDef.isRanked) continue;
      for (const item of friendTvData.byClass[classKey] ?? []) list.push(item);
    }
    return list;
  }, [friendTvData]);

  const stats = useMemo(() => {
    console.log('📊 Computing stats from friend data...');
    
    if (!friendMoviesData || !friendTvData || !friendPeopleData || !friendDirectorsData) {
      console.log('❌ Missing friend data for stats computation');
      return {
        totalMinutes: 0,
        moviesMinutes: 0,
        showsMinutes: 0,
        episodesWatched: 0,
        moviesSeen: 0,
        showsSeen: 0,
        actorsSaved: 0,
        directorsSaved: 0,
        rankedMovies: [],
        rankedShows: [],
        recentWatches: [],
        movieWatchYearData: [],
        tvWatchYearData: []
      };
    }

    console.log('✅ All friend data available for stats computation');

    let totalMinutes = 0;
    let moviesMinutes = 0;
    let showsMinutes = 0;
    let episodesWatched = 0;
    let moviesSeen = 0;
    let showsSeen = 0;

    // Calculate movie stats
    if (friendMoviesData.classes) {
      for (const classDef of friendMoviesData.classes) {
        const classKey = classDef.key;
        for (const item of friendMoviesData.byClass[classKey] ?? []) {
          const mins = getTotalMinutesFromRecords(item.watchRecords ?? [], item.runtimeMinutes);
          totalMinutes += mins;
          moviesMinutes += mins;
          if ((item.watchRecords?.length ?? 0) > 0) {
            moviesSeen += 1;
          }
        }
      }
    }

    // Calculate TV stats
    if (friendTvData.classes) {
      for (const classDef of friendTvData.classes) {
        const classKey = classDef.key;
        for (const item of friendTvData.byClass[classKey] ?? []) {
          const mins = getTotalMinutesFromRecords(item.watchRecords ?? [], item.runtimeMinutes);
          totalMinutes += mins;
          showsMinutes += mins;
          episodesWatched += getTotalEpisodesFromRecords(item.watchRecords ?? [], item.totalEpisodes);
          if ((item.watchRecords?.length ?? 0) > 0) {
            showsSeen += 1;
          }
        }
      }
    }

    // Calculate actors and directors saved
    let actorsSaved = 0;
    if (friendPeopleData.classes) {
      for (const classDef of friendPeopleData.classes) {
        const classKey = classDef.key;
        actorsSaved += (friendPeopleData.byClass[classKey] ?? []).length;
      }
    }

    let directorsSaved = 0;
    if (friendDirectorsData.classes) {
      for (const classDef of friendDirectorsData.classes) {
        const classKey = classDef.key;
        directorsSaved += (friendDirectorsData.byClass[classKey] ?? []).length;
      }
    }

    const recentWatches = getRecentWatches(
      friendMoviesData.byClass,
      friendTvData.byClass,
      friendMoviesData.classes?.map((c: any) => c.key) || [],
      friendTvData.classes?.map((c: any) => c.key) || []
    );

    return {
      totalMinutes,
      moviesMinutes,
      showsMinutes,
      episodesWatched,
      moviesSeen,
      showsSeen,
      actorsSaved,
      directorsSaved,
      rankedMovies,
      rankedShows,
      recentWatches
    };
  }, [friendMoviesData, friendTvData, friendPeopleData, friendDirectorsData, rankedMovies, rankedShows]);

  // Debug logging for stats
  console.log('📊 Final stats object:', stats);

  const filteredRecentWatches = useMemo(() => {
    const range = getDateRangeFilter(recentRange);
    if (!range) return stats.recentWatches;
    return stats.recentWatches.filter(w => {
      const key = w.sortKey;
      return key >= range.min && key <= range.max;
    });
  }, [stats.recentWatches, recentRange]);

  // Helper to check if current user has a movie ranked (using MY stores, not friend's)
  const getUserMovieStatus = useCallback((tmdbId: number): { isRanked: boolean; classKey?: string; watchRecords?: WatchRecord[] } => {
    if (!tmdbId) return { isRanked: false };
    
    // Try multiple ID formats that might be used
    const possibleIds = [
      `tmdb-movie-${tmdbId}`,
      `movie-${tmdbId}`,
      `${tmdbId}`
    ];
    
    for (const classKey of myMovieClassOrder) {
      const items = myMoviesByClass[classKey] ?? [];
      const found = items.find(item => 
        possibleIds.includes(item.id) || 
        item.tmdbId === tmdbId
      );
      if (found) {
        return { isRanked: true, classKey, watchRecords: found.watchRecords };
      }
    }
    return { isRanked: false };
  }, [myMoviesByClass, myMovieClassOrder]);

  // Helper to check if current user has a show ranked
  const getUserShowStatus = useCallback((tmdbId: number): { isRanked: boolean; classKey?: string; watchRecords?: WatchRecord[] } => {
    if (!tmdbId) return { isRanked: false };
    
    // Try multiple ID formats that might be used
    const possibleIds = [
      `tmdb-tv-${tmdbId}`,
      `tv-${tmdbId}`,
      `${tmdbId}`
    ];
    
    for (const classKey of myTvClassOrder) {
      const items = myTvByClass[classKey] ?? [];
      const found = items.find(item => 
        possibleIds.includes(item.id) || 
        item.tmdbId === tmdbId
      );
      if (found) {
        return { isRanked: true, classKey, watchRecords: found.watchRecords };
      }
    }
    return { isRanked: false };
  }, [myTvByClass, myTvClassOrder]);

  // Handle clicking a top 10 movie
  const handleMovieClick = (movie: MovieShowItem) => {
    const tmdbId = (movie.tmdbId ?? parseInt(movie.id.replace(/\D/g, ''), 10)) || 0;
    const status = getUserMovieStatus(tmdbId);
    const target: UniversalEditTarget = {
      id: movie.id,
      tmdbId,
      title: movie.title,
      posterPath: movie.posterPath,
      mediaType: 'movie',
      subtitle: movie.releaseDate ? String(movie.releaseDate.slice(0, 4)) : undefined,
      releaseDate: movie.releaseDate,
      runtimeMinutes: movie.runtimeMinutes,
      existingClassKey: status.classKey,
      watchlistStatus: 'not_in_watchlist',
    };
    setRankingTarget(target);
  };

  // Handle clicking a top 10 show
  const handleShowClick = (show: MovieShowItem) => {
    const tmdbId = (show.tmdbId ?? parseInt(show.id.replace(/\D/g, ''), 10)) || 0;
    const status = getUserShowStatus(tmdbId);
    const target: UniversalEditTarget = {
      id: show.id,
      tmdbId,
      title: show.title,
      posterPath: show.posterPath,
      mediaType: 'tv',
      subtitle: show.releaseDate ? String(show.releaseDate.slice(0, 4)) : undefined,
      releaseDate: show.releaseDate,
      runtimeMinutes: show.runtimeMinutes,
      totalEpisodes: show.totalEpisodes,
      totalSeasons: show.totalSeasons,
      existingClassKey: status.classKey,
      watchlistStatus: 'not_in_watchlist',
    };
    setRankingTarget(target);
  };

  // Handle saving from the ranking modal
  const handleRankingSave = async (params: any, goToMedia: boolean) => {
    if (!rankingTarget) return;
    setIsRankingSaving(true);
    try {
      const tmdbId = (rankingTarget.tmdbId ?? parseInt(rankingTarget.id.replace(/\D/g, ''), 10)) || 0;
      
      if (rankingTarget.mediaType === 'movie') {
        const status = getUserMovieStatus(tmdbId);
        
        const records: WatchRecord[] = params.watches.map((w: any) => ({
          id: w.id || crypto.randomUUID(),
          type: w.watchType === 'LONG_AGO' ? 'LONG_AGO' : w.watchType === 'DATE_RANGE' ? 'RANGE' : w.watchStatus === 'WATCHING' ? 'CURRENT' : w.watchStatus === 'DNF' ? 'DNF' : 'DATE',
          year: w.year,
          month: w.month,
          day: w.day,
          endYear: w.endYear,
          endMonth: w.endMonth,
          endDay: w.endDay,
          dnfPercent: w.watchPercent < 100 ? w.watchPercent : undefined,
        }));

        if (status.isRanked && rankingTarget.id) {
          await updateMovieWatchRecords(rankingTarget.id, records);
          
          if (params.classKey && params.classKey !== status.classKey) {
            await moveMovieToClass(rankingTarget.id, params.classKey, {
              toTop: params.position === 'top',
              toMiddle: params.position === 'middle',
            });
          }
        } else {
          // Fetch full TMDB data before adding
          let movieCache: any = null;
          try {
            const tmdbId = (rankingTarget.tmdbId ?? parseInt(rankingTarget.id.replace(/\D/g, ''), 10)) || 0;
            movieCache = await tmdbMovieDetailsFull(tmdbId);
          } catch { /* ignore */ }
          
          await addMovieFromSearch({
            id: rankingTarget.id,
            title: rankingTarget.title,
            posterPath: rankingTarget.posterPath,
            classKey: params.classKey || 'UNRANKED',
            toTop: params.position === 'top',
            toMiddle: params.position === 'middle',
            runtimeMinutes: movieCache?.runtimeMinutes,
            cache: movieCache ?? undefined
          });
          if (records.length > 0 && rankingTarget.id) {
            await updateMovieWatchRecords(rankingTarget.id, records);
          }
        }
      } else {
        const status = getUserShowStatus(tmdbId);
        
        const records: WatchRecord[] = params.watches.map((w: any) => ({
          id: w.id || crypto.randomUUID(),
          type: w.watchType === 'LONG_AGO' ? 'LONG_AGO' : w.watchType === 'DATE_RANGE' ? 'RANGE' : w.watchStatus === 'WATCHING' ? 'CURRENT' : w.watchStatus === 'DNF' ? 'DNF' : 'DATE',
          year: w.year,
          month: w.month,
          day: w.day,
          endYear: w.endYear,
          endMonth: w.endMonth,
          endDay: w.endDay,
          dnfPercent: w.watchPercent < 100 ? w.watchPercent : undefined,
        }));

        if (status.isRanked && rankingTarget.id) {
          await updateTvShowWatchRecords(rankingTarget.id, records);
          
          if (params.classKey && params.classKey !== status.classKey) {
            await moveTvToClass(rankingTarget.id, params.classKey, {
              toTop: params.position === 'top',
              toMiddle: params.position === 'middle',
            });
          }
        } else {
          // Fetch full TMDB data before adding
          let tvCache: any = null;
          try {
            const tmdbId = (rankingTarget.tmdbId ?? parseInt(rankingTarget.id.replace(/\D/g, ''), 10)) || 0;
            tvCache = await tmdbTvDetailsFull(tmdbId);
          } catch { /* ignore */ }
          
          await addTvShowFromSearch({
            id: rankingTarget.id,
            title: rankingTarget.title,
            posterPath: rankingTarget.posterPath,
            classKey: params.classKey || 'UNRANKED',
            position: params.position,
            cache: tvCache ?? undefined
          });
          if (records.length > 0 && rankingTarget.id) {
            await updateTvShowWatchRecords(rankingTarget.id, records);
          }
        }
      }
      
      if (goToMedia) {
        // Navigate and then scroll to the item
        const targetPath = rankingTarget.mediaType === 'movie' ? '/movies' : '/tv';
        navigate(targetPath, { state: { scrollToId: rankingTarget.id } });
      }
    } finally {
      setIsRankingSaving(false);
      setRankingTarget(null);
    }
  };

  // Handle removing entry
  const handleRemoveEntry = async (itemId: string) => {
    if (!rankingTarget) return;
    if (rankingTarget.mediaType === 'movie') {
      await removeMovieEntry(itemId);
    } else {
      await removeTvShowEntry(itemId);
    }
  };

  if (loading) {
    return (
      <div className="friend-profile-page">
        <div className="loading">Loading profile...</div>
      </div>
    );
  }

  if (error || !friendProfile) {
    return (
      <div className="friend-profile-page">
        <Link to="/friends" className="back-button">
          <ArrowLeft size={20} />
          Back to Friends
        </Link>
        <div className="error">
          {error || 'Friend not found'}
        </div>
      </div>
    );
  }

  return (
    <section>
      <header className="page-heading">
        <div>
          <h1 className="page-title">Profile of {friendProfile?.username}</h1>
          <div className="profile-header-actions">
            <Link to="/friends" className="back-button">
              <ArrowLeft size={20} />
              Back to Friends
            </Link>
          </div>
          <RandomQuote />
        </div>
      </header>

      <div className="profile-stats profile-card card-surface">
        <div className="profile-stats-header">
          <h2 className="profile-card-title">Quick stats</h2>
          <button
            type="button"
            className="profile-stats-expand-btn"
            onClick={() => setShowExpandedStats(!showExpandedStats)}
          >
            {showExpandedStats ? '▼' : '▶'} Detailed stats
          </button>
        </div>
        
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
          <div className="profile-stat">
            <span className="profile-stat-value profile-stat-value--hero">{stats.actorsSaved}</span>
            <span className="profile-stat-label">Actors saved</span>
          </div>
          <div className="profile-stat">
            <span className="profile-stat-value profile-stat-value--hero">{stats.directorsSaved}</span>
            <span className="profile-stat-label">Directors saved</span>
          </div>
        </div>

        {showExpandedStats && (
          <div className="profile-stats-expanded">
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
                <span className="profile-stat-value">{stats.episodesWatched || 0}</span>
                <span className="profile-stat-label">Episodes watched</span>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="profile-grid">
        <div className="profile-card card-surface">
          <h2 className="profile-card-title">Top 10 Movies</h2>
          <div className="profile-top-grid">
            {rankedMovies.slice(0, 10).map((m, i) => {
              const tmdbId = (m.tmdbId ?? parseInt(m.id.replace(/\D/g, ''), 10)) || 0;
              const userStatus = getUserMovieStatus(tmdbId);
              return (
                <div 
                  key={m.id} 
                  className="profile-top-item profile-top-item--clickable"
                  onClick={() => handleMovieClick(m)}
                >
                  <div className="profile-top-poster">
                    {m.posterPath ? (
                      <img src={tmdbImagePath(m.posterPath) ?? ''} alt={m.title} loading="lazy" />
                    ) : (
                      <span className="profile-top-poster-placeholder">🎬</span>
                    )}
                    <span className="profile-top-rank">#{i + 1}</span>
                    <div className="profile-top-overlay">
                      <span className={userStatus.isRanked ? 'profile-top-overlay-text profile-top-overlay-text--seen' : 'profile-top-overlay-text'}>
                        {userStatus.isRanked ? 'SEEN' : 'SAVE'}
                      </span>
                    </div>
                  </div>
                  <div className="profile-top-info">
                    <span className="profile-top-title">{m.title}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="profile-card card-surface">
          <h2 className="profile-card-title">Top 10 Shows</h2>
          <div className="profile-top-grid">
            {rankedShows.slice(0, 10).map((s, i) => {
              const tmdbId = (s.tmdbId ?? parseInt(s.id.replace(/\D/g, ''), 10)) || 0;
              const userStatus = getUserShowStatus(tmdbId);
              return (
                <div 
                  key={s.id} 
                  className="profile-top-item profile-top-item--clickable"
                  onClick={() => handleShowClick(s)}
                >
                  <div className="profile-top-poster">
                    {s.posterPath ? (
                      <img src={tmdbImagePath(s.posterPath) ?? ''} alt={s.title} loading="lazy" />
                    ) : (
                      <span className="profile-top-poster-placeholder">📺</span>
                    )}
                    <span className="profile-top-rank">#{i + 1}</span>
                    <div className="profile-top-overlay">
                      <span className={userStatus.isRanked ? 'profile-top-overlay-text profile-top-overlay-text--seen' : 'profile-top-overlay-text'}>
                        {userStatus.isRanked ? 'SEEN' : 'SAVE'}
                      </span>
                    </div>
                  </div>
                  <div className="profile-top-info">
                    <span className="profile-top-title">{s.title}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="profile-recent profile-card card-surface profile-card-wide">
        <div className="profile-recent-header">
          <h2 className="profile-card-title">Recently watched</h2>
          <span className="profile-recent-count">{filteredRecentWatches.length}</span>
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
          {filteredRecentWatches.length === 0 ? (
            <p className="profile-muted">No watches in this range.</p>
          ) : (
            <div className="profile-recent-grid">
              {filteredRecentWatches.map((w, i) => (
                <div key={`${w.item.id}-${getWatchRecordSortKey(w.record)}-${i}`} className="profile-recent-tile">
                  <div className="profile-recent-tile-poster">
                    {w.item.posterPath ? (
                      <img src={tmdbImagePath(w.item.posterPath) ?? ''} alt="" loading="lazy" />
                    ) : (
                      <span>{w.isMovie ? '🎬' : '📺'}</span>
                    )}
                  </div>
                  <div className="profile-recent-tile-info">
                    <span className="profile-recent-tile-title">{w.item.title}</span>
                    <span className="profile-recent-tile-date">
                      {getWatchRecordSortKey(w.record)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {rankingTarget && (
        <UniversalEditModal
          target={rankingTarget}
          rankedClasses={rankingTarget.mediaType === 'movie' ? movieClasses : tvClasses}
          initialWatches={
            rankingTarget.mediaType === 'movie'
              ? (() => {
                  const tmdbId = (rankingTarget.tmdbId ?? parseInt(rankingTarget.id.replace(/\D/g, ''), 10)) || 0;
                  const status = getUserMovieStatus(tmdbId);
                  return status.watchRecords;
                })()
              : (() => {
                  const tmdbId = (rankingTarget.tmdbId ?? parseInt(rankingTarget.id.replace(/\D/g, ''), 10)) || 0;
                  const status = getUserShowStatus(tmdbId);
                  return status.watchRecords;
                })()
          }
          currentClassKey={rankingTarget.existingClassKey}
          currentClassLabel={
            rankingTarget.mediaType === 'movie'
              ? (rankingTarget.existingClassKey ? getMovieClassLabel(rankingTarget.existingClassKey) : undefined)
              : (rankingTarget.existingClassKey ? getTvClassLabel(rankingTarget.existingClassKey) : undefined)
          }
          onSave={handleRankingSave}
          onClose={() => setRankingTarget(null)}
          onRemoveEntry={handleRemoveEntry}
          isSaving={isRankingSaving}
        />
      )}
    </section>
  );
}
