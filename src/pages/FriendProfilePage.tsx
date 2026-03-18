import { useMemo, useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useFriends, type UserProfile } from '../context/FriendsContext';
import { doc, getDoc, collection, query, where, getDocs, deleteDoc, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { ArrowLeft, Calendar, Film, Tv, Users, Star, Trophy, User, Video, BarChart3, UserX, Users2, UserPlus } from 'lucide-react';
import { loadMovies } from '../lib/firestoreMovies';
import { loadTvShows } from '../lib/firestoreTvShows';
import { loadPeople } from '../lib/firestorePeople';
import { loadDirectors } from '../lib/firestoreDirectors';
import { loadWatchlist } from '../lib/firestoreWatchlist';
import type { MovieShowItem, WatchRecord } from '../components/EntryRowMovieShow';
import { tmdbImagePath, tmdbMovieDetailsFull, tmdbTvDetailsFull, getMovieImageSrc, isBigMovie } from '../lib/tmdb';
import { 
  useMoviesStore,
  getTotalMinutesFromRecords, 
  getTotalEpisodesFromRecords, 
  formatDuration, 
  getWatchRecordSortKey, 
  formatWatchLabel 
} from '../state/moviesStore';
import { useTvStore } from '../state/tvStore';
import { useWatchlistStore } from '../state/watchlistStore';
import { usePeopleStore } from '../state/peopleStore';
import { useDirectorsStore } from '../state/directorsStore';
import { UniversalEditModal, type UniversalEditTarget, type UniversalEditSaveParams } from '../components/UniversalEditModal';
import { PersonRankingModal, type PersonRankingTarget, type PersonRankingSaveParams } from '../components/PersonRankingModal';
import { RandomQuote } from '../components/RandomQuote';
import { ProfileWatchlist } from '../components/ProfileWatchlist';
import { PageSearch } from '../components/PageSearch';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import './FriendProfilePage.css';
import '../components/ProfileSplitLayout.css';

interface FriendProfile {
  uid: string;
  username: string;
  email: string;
  createdAt: string;
}

interface Friend {
  uid: string;
  username: string;
  email: string;
  addedAt: string;
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
  const { unfriend, refreshFriends, sendFriendRequest, sentRequests, friends } = useFriends();
  const [friendProfile, setFriendProfile] = useState<FriendProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Unfriend modal state
  const [showUnfriendModal, setShowUnfriendModal] = useState(false);
  const [unfriendConfirmation, setUnfriendConfirmation] = useState('');
  const [unfriending, setUnfriending] = useState(false);

  // Friend's friends modal state
  const [showFriendsOfFriendModal, setShowFriendsOfFriendModal] = useState(false);
  const [friendsOfFriend, setFriendsOfFriend] = useState<Friend[]>([]);
  const [loadingFriendsOfFriend, setLoadingFriendsOfFriend] = useState(false);

  // Ranking modal state
  const [rankingTarget, setRankingTarget] = useState<UniversalEditTarget | null>(null);
  const [isRankingSaving, setIsRankingSaving] = useState(false);
  const [personRankingTarget, setPersonRankingTarget] = useState<PersonRankingTarget | null>(null);
  const [isPersonRankingSaving, setIsPersonRankingSaving] = useState(false);

  // Current user's stores (to check SEEN vs SAVE status)
  const {
    byClass: myMoviesByClass,
    classOrder: myMovieClassOrder,
    getClassLabel: getMovieClassLabel,
    classes: movieClasses,
    globalRanks: moviesGlobalRanks,
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
    globalRanks: tvGlobalRanks,
    addTvShowFromSearch,
    updateTvShowWatchRecords,
    moveItemToClass: moveTvToClass,
    removeTvShowEntry,
  } = useTvStore();
  const watchlist = useWatchlistStore();
  const {
    addPersonFromSearch,
    removePersonEntry,
    byClass: myPeopleByClass,
    classOrder: myPeopleClassOrder,
    classes: myPeopleClasses
  } = usePeopleStore();
  const {
    addDirectorFromSearch,
    removeDirectorEntry,
    byClass: myDirectorsByClass,
    classOrder: myDirectorsClassOrder,
    classes: myDirectorsClasses
  } = useDirectorsStore();
  
  const { addToWatchlist, removeFromWatchlist, isInWatchlist } = useWatchlistStore();

  // Friend data states
  const [friendMoviesData, setFriendMoviesData] = useState<any>(null);
  const [friendTvData, setFriendTvData] = useState<any>(null);
  const [friendPeopleData, setFriendPeopleData] = useState<any>(null);
  const [friendDirectorsData, setFriendDirectorsData] = useState<any>(null);
  const [friendWatchlistData, setFriendWatchlistData] = useState<{ movies: any[], tv: any[] } | null>(null);

  const [recentRange, setRecentRange] = useState<'this_year' | 'last_month' | 'last_year' | 'all_time'>('this_year');
  const [showExpandedStats, setShowExpandedStats] = useState(false);
  const [chartMode, setChartMode] = useState<'count' | 'time'>('count');
  const [showAllMoviesWithClasses, setShowAllMoviesWithClasses] = useState(false);
  const [showAllShowsWithClasses, setShowAllShowsWithClasses] = useState(false);
  const [showAllActorsWithClasses, setShowAllActorsWithClasses] = useState(false);
  const [showAllDirectorsWithClasses, setShowAllDirectorsWithClasses] = useState(false);

  // Cache for friends data to avoid repeated requests
  const [friendsCache, setFriendsCache] = useState<Map<string, any>>(new Map());

  // Calculate ranked counts for display
  const rankedMoviesCount = useMemo(() => {
    if (!friendMoviesData?.classes) return 0;
    return friendMoviesData.classes
      .filter((c: any) => c.key !== 'UNRANKED')
      .reduce((count: number, classDef: any) => count + (friendMoviesData.byClass[classDef.key]?.length || 0), 0);
  }, [friendMoviesData]);

  const rankedShowsCount = useMemo(() => {
    if (!friendTvData?.classes) return 0;
    return friendTvData.classes
      .filter((c: any) => c.key !== 'UNRANKED')
      .reduce((count: number, classDef: any) => count + (friendTvData.byClass[classDef.key]?.length || 0), 0);
  }, [friendTvData]);

  const rankedActorsCount = useMemo(() => {
    if (!friendPeopleData?.classes) return 0;
    return friendPeopleData.classes
      .filter((c: any) => c.isRanked)
      .reduce((count: number, classDef: any) => count + (friendPeopleData.byClass[classDef.key]?.length || 0), 0);
  }, [friendPeopleData]);

  const rankedDirectorsCount = useMemo(() => {
    if (!friendDirectorsData?.classes) return 0;
    return friendDirectorsData.classes
      .filter((c: any) => c.isRanked)
      .reduce((count: number, classDef: any) => count + (friendDirectorsData.byClass[classDef.key]?.length || 0), 0);
  }, [friendDirectorsData]);

  // NOTE: The UI already shows "Top 10 Movies" and "Top 10 Shows" - 
  // charts removed as requested

  useEffect(() => {
    const loadFriendProfile = async () => {
      if (!friendId || !db) return;

      try {
        console.log('🔍 Starting friend profile load for:', friendId);
        console.log('👤 Current user:', user?.uid);

        let actualFriendUid = friendId;
        let skipFriendshipCheck = false;

        // Allow users to view their own profile
        if (friendId === user?.uid) {
          console.log('✅ User viewing own profile - skipping friendship check');
          skipFriendshipCheck = true;
        } else {
          // Check if friendId is a username (contains @) or UID
          const isUsername = friendId.includes('@');
          
          if (isUsername) {
            // For usernames, we need to look up the UID first
            console.log('🔍 FriendId is username, looking up UID...');
            const userQuery = query(
              collection(db!, 'users'),
              where('username', '==', friendId)
            );
            const userSnapshot = await getDocs(userQuery);
            
            if (userSnapshot.empty) {
              console.log('❌ Username not found');
              setError('User not found');
              return;
            }
            
            actualFriendUid = userSnapshot.docs[0].id;
            console.log('✅ Found UID for username:', actualFriendUid);
          }
          
          // Check friendship (unless it's the admin user which has public access)
          if (friendId !== 'cimmerial@clastone.local') {
            await checkFriendship(actualFriendUid);
          } else {
            console.log('✅ Admin user - public access allowed');
          }
        }

        // Helper function to check friendship
        async function checkFriendship(uid: string) {
          console.log('🤝 Checking friendship...');
          const friendsQuery1 = query(
            collection(db!, 'friends'),
            where('userId', '==', user?.uid),
            where('friendUid', '==', uid)
          );
          const friendsQuery2 = query(
            collection(db!, 'friends'),
            where('userId', '==', uid),
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
        }

        // Load friend's profile using the actual UID
        console.log('👤 Loading friend profile...');
        const friendDoc = await getDoc(doc(db!, 'users', actualFriendUid));
        if (friendDoc.exists()) {
          console.log('✅ Friend profile loaded:', friendDoc.data());
          
          let profileData = friendDoc.data();
          
          // Fix admin username display
          if (friendId === 'cimmerial@clastone.local' && profileData.username === 'cimmerial@clastone.local') {
            console.log('🔧 Fixing admin username display');
            profileData = { ...profileData, username: 'Cimmerial' };
          }
          
          setFriendProfile({
            uid: actualFriendUid,
            ...profileData
          } as FriendProfile);
        } else {
          console.log('❌ Friend profile not found');
          setError('Friend profile not found');
          return;
        }

        // Load all friend data using the same functions as the user's profile
        console.log('📼 Loading friend movie data...');
        const moviesData = await loadMovies(db!, actualFriendUid);
        console.log('✅ Movies loaded:', moviesData);

        console.log('📺 Loading friend TV data...');
        const tvData = await loadTvShows(db!, actualFriendUid);
        console.log('✅ TV shows loaded:', tvData);

        console.log('🎭 Loading friend actors data...');
        const peopleData = await loadPeople(db!, actualFriendUid);
        console.log('✅ Actors loaded:', peopleData);

        console.log('🎬 Loading friend directors data...');
        const directorsData = await loadDirectors(db!, actualFriendUid);
        console.log('✅ Directors loaded:', directorsData);

        console.log('📝 Loading friend watchlist data...');
        const watchlistData = await loadWatchlist(db!, actualFriendUid);
        console.log('✅ Watchlist loaded:', watchlistData);

        setFriendMoviesData(moviesData);
        setFriendTvData(tvData);
        setFriendPeopleData(peopleData);
        setFriendDirectorsData(directorsData);
        setFriendWatchlistData(watchlistData);

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

  // Load friends of friend
  const loadFriendsOfFriend = useCallback(async () => {
    if (!friendId || !db) return;
    
    setLoadingFriendsOfFriend(true);
    try {
      const friendsQuery = query(
        collection(db!, 'friends'),
        where('userId', '==', friendId)
      );
      const friendsSnapshot = await getDocs(friendsQuery);
      const friendsData = friendsSnapshot.docs.map(doc => ({
        uid: doc.data().friendUid,
        username: doc.data().friendUsername,
        email: doc.data().friendEmail,
        addedAt: doc.data().addedAt
      }));
      setFriendsOfFriend(friendsData);
    } catch (error) {
      console.error('Error loading friends of friend:', error);
    } finally {
      setLoadingFriendsOfFriend(false);
    }
  }, [friendId, db]);

  // Handle unfriend
  const handleUnfriend = useCallback(async () => {
    if (!user || !friendId || unfriendConfirmation !== 'UNFRIEND') return;
    
    setUnfriending(true);
    try {
      await unfriend(friendId);
      
      // Close modal and navigate back
      setShowUnfriendModal(false);
      setUnfriendConfirmation('');
      navigate('/friends');
    } catch (error) {
      console.error('Error unfriending:', error);
    } finally {
      setUnfriending(false);
    }
  }, [user, friendId, unfriendConfirmation, unfriend, navigate]);

  // Handle view friends of friend
  const handleViewFriendsOfFriend = useCallback(() => {
    if (!showFriendsOfFriendModal) {
      loadFriendsOfFriend();
    }
    setShowFriendsOfFriendModal(!showFriendsOfFriendModal);
  }, [showFriendsOfFriendModal, loadFriendsOfFriend]);

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

  const allMoviesExceptUnranked = useMemo(() => {
    if (!friendMoviesData || !friendMoviesData.byClass || !friendMoviesData.classes) return [];
    const list: MovieShowItem[] = [];
    for (const classDef of friendMoviesData.classes) {
      const classKey = classDef.key;
      if (classKey === 'UNRANKED') continue;
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

  const allShowsExceptUnranked = useMemo(() => {
    if (!friendTvData || !friendTvData.byClass || !friendTvData.classes) return [];
    const list: MovieShowItem[] = [];
    for (const classDef of friendTvData.classes) {
      const classKey = classDef.key;
      if (classKey === 'UNRANKED') continue;
      for (const item of friendTvData.byClass[classKey] ?? []) list.push(item);
    }
    return list;
  }, [friendTvData]);

  const rankedActors = useMemo(() => {
    if (!friendPeopleData || !friendPeopleData.byClass || !friendPeopleData.classes) return [];
    const list: any[] = [];
    for (const classDef of friendPeopleData.classes) {
      if (classDef.isRanked) {
        const classKey = classDef.key;
        for (const item of friendPeopleData.byClass[classKey] ?? []) list.push(item);
      }
    }
    // Only return actual ranked actors, don't pad with random ones
    return list;
  }, [friendPeopleData]);

  const top5Actors = useMemo(() => rankedActors.slice(0, 5), [rankedActors]);

  const rankedDirectors = useMemo(() => {
    if (!friendDirectorsData || !friendDirectorsData.byClass || !friendDirectorsData.classes) return [];
    const list: any[] = [];
    for (const classDef of friendDirectorsData.classes) {
      if (classDef.isRanked) {
        const classKey = classDef.key;
        for (const item of friendDirectorsData.byClass[classKey] ?? []) list.push(item);
      }
    }
    // Only return actual ranked directors, don't pad with random ones
    return list;
  }, [friendDirectorsData]);

  const top5Directors = useMemo(() => rankedDirectors.slice(0, 5), [rankedDirectors]);

  const hasActors = rankedActors.length > 0;
  const hasDirectors = rankedDirectors.length > 0;

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
        tvWatchYearData: [],
        movieTotalWatches: 0,
        movieDNFCount: 0,
        movieRewatchCount: 0,
        tvTotalWatches: 0,
        tvDNFCount: 0,
        tvRewatchCount: 0,
        avgWatchtimePerMovie: 0,
        avgWatchtimePerShow: 0,
        movieAvgRuntimeByCategory: [],
        showAvgRuntimeByCategory: []
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

    // Calculate ranked category data for bar charts
    const movieRankedCategories = friendMoviesData.classes
      ?.filter((c: any) => c.isRanked)
      .map((c: any) => {
        const classKey = c.key;
        const items = friendMoviesData.byClass[classKey] ?? [];
        const watchTime = items.reduce((sum: number, item: any) => 
          sum + getTotalMinutesFromRecords(item.watchRecords ?? [], item.runtimeMinutes), 0
        );
        return {
          key: classKey,
          count: items.length,
          watchTime
        };
      }) || [];

    const tvRankedCategories = friendTvData.classes
      ?.filter((c: any) => c.isRanked)
      .map((c: any) => {
        const classKey = c.key;
        const items = friendTvData.byClass[classKey] ?? [];
        const watchTime = items.reduce((sum: number, item: any) => 
          sum + getTotalMinutesFromRecords(item.watchRecords ?? [], item.runtimeMinutes), 0
        );
        return {
          key: classKey,
          count: items.length,
          watchTime
        };
      }) || [];

    // Calculate release year distribution
    const movieReleaseYearData: { year: number; count: number }[] = [];
    const movieYearCounts: Record<number, number> = {};
    if (friendMoviesData.classes) {
      for (const classDef of friendMoviesData.classes) {
        const classKey = classDef.key;
        for (const item of friendMoviesData.byClass[classKey] ?? []) {
          if (item.releaseDate) {
            const year = parseInt(item.releaseDate.slice(0, 4), 10);
            if (!Number.isNaN(year)) {
              movieYearCounts[year] = (movieYearCounts[year] || 0) + 1;
            }
          }
        }
      }
    }
    Object.entries(movieYearCounts)
      .forEach(([year, count]) => {
        movieReleaseYearData.push({ year: parseInt(year), count });
      });
    movieReleaseYearData.sort((a, b) => a.year - b.year);

    const tvReleaseYearData: { year: number; count: number }[] = [];
    const tvYearCounts: Record<number, number> = {};
    if (friendTvData.classes) {
      for (const classDef of friendTvData.classes) {
        const classKey = classDef.key;
        for (const item of friendTvData.byClass[classKey] ?? []) {
          if (item.releaseDate) {
            const year = parseInt(item.releaseDate.slice(0, 4), 10);
            if (!Number.isNaN(year)) {
              tvYearCounts[year] = (tvYearCounts[year] || 0) + 1;
            }
          }
        }
      }
    }
    Object.entries(tvYearCounts)
      .forEach(([year, count]) => {
        tvReleaseYearData.push({ year: parseInt(year), count });
      });
    tvReleaseYearData.sort((a, b) => a.year - b.year);

    // Calculate watch count per year
    const movieWatchYearData: { year: number; count: number; watchTime: number }[] = [];
    const movieYearWatchCounts: Record<number, { count: number; watchTime: number }> = {};
    if (friendMoviesData.classes) {
      for (const classDef of friendMoviesData.classes) {
        const classKey = classDef.key;
        for (const item of friendMoviesData.byClass[classKey] ?? []) {
          for (const record of item.watchRecords ?? []) {
            if (record.year && (record.type ?? 'DATE') !== 'DNF') {
              const year = record.year;
              if (!movieYearWatchCounts[year]) {
                movieYearWatchCounts[year] = { count: 0, watchTime: 0 };
              }
              movieYearWatchCounts[year].count += 1;
              movieYearWatchCounts[year].watchTime += getTotalMinutesFromRecords([record], item.runtimeMinutes);
            }
          }
        }
      }
    }
    Object.entries(movieYearWatchCounts)
      .forEach(([year, data]) => {
        movieWatchYearData.push({ year: parseInt(year), count: data.count, watchTime: data.watchTime });
      });
    movieWatchYearData.sort((a, b) => a.year - b.year);

    const tvWatchYearData: { year: number; count: number; watchTime: number }[] = [];
    const tvYearWatchCounts: Record<number, { count: number; watchTime: number }> = {};
    if (friendTvData.classes) {
      for (const classDef of friendTvData.classes) {
        const classKey = classDef.key;
        for (const item of friendTvData.byClass[classKey] ?? []) {
          for (const record of item.watchRecords ?? []) {
            if (record.year && (record.type ?? 'DATE') !== 'DNF') {
              const year = record.year;
              if (!tvYearWatchCounts[year]) {
                tvYearWatchCounts[year] = { count: 0, watchTime: 0 };
              }
              tvYearWatchCounts[year].count += 1;
              tvYearWatchCounts[year].watchTime += getTotalMinutesFromRecords([record], item.runtimeMinutes);
            }
          }
        }
      }
    }
    Object.entries(tvYearWatchCounts)
      .forEach(([year, data]) => {
        tvWatchYearData.push({ year: parseInt(year), count: data.count, watchTime: data.watchTime });
      });
    tvWatchYearData.sort((a, b) => a.year - b.year);

    // Calculate DNF and rewatch stats
    let movieTotalWatches = 0;
    let movieDNFCount = 0;
    let movieRewatchCount = 0;
    if (friendMoviesData.classes) {
      for (const classDef of friendMoviesData.classes) {
        const classKey = classDef.key;
        for (const item of friendMoviesData.byClass[classKey] ?? []) {
          const watches = item.watchRecords ?? [];
          movieTotalWatches += watches.length;
          movieDNFCount += watches.filter((r: any) => (r.type ?? 'DATE') === 'DNF').length;
          if (watches.length > 1) {
            movieRewatchCount += watches.length - 1;
          }
        }
      }
    }

    let tvTotalWatches = 0;
    let tvDNFCount = 0;
    let tvRewatchCount = 0;
    if (friendTvData.classes) {
      for (const classDef of friendTvData.classes) {
        const classKey = classDef.key;
        for (const item of friendTvData.byClass[classKey] ?? []) {
          const watches = item.watchRecords ?? [];
          tvTotalWatches += watches.length;
          tvDNFCount += watches.filter((r: any) => (r.type ?? 'DATE') === 'DNF').length;
          if (watches.length > 1) {
            tvRewatchCount += watches.length - 1;
          }
        }
      }
    }

    // Calculate average watchtime per movie and show (including rewatches)
    let totalMovieWatches = 0;
    let totalShowWatches = 0;
    if (friendMoviesData.classes) {
      for (const classDef of friendMoviesData.classes) {
        const classKey = classDef.key;
        for (const item of friendMoviesData.byClass[classKey] ?? []) {
          totalMovieWatches += (item.watchRecords ?? []).filter((r: any) => (r.type ?? 'DATE') !== 'DNF').length;
        }
      }
    }
    if (friendTvData.classes) {
      for (const classDef of friendTvData.classes) {
        const classKey = classDef.key;
        for (const item of friendTvData.byClass[classKey] ?? []) {
          totalShowWatches += (item.watchRecords ?? []).filter((r: any) => (r.type ?? 'DATE') !== 'DNF').length;
        }
      }
    }

    const avgWatchtimePerMovie = totalMovieWatches > 0 ? Math.round(moviesMinutes / totalMovieWatches) : 0;
    const avgWatchtimePerShow = totalShowWatches > 0 ? Math.round(showsMinutes / totalShowWatches) : 0;

    // Calculate average runtime per ranked category for movies
    const movieAvgRuntimeByCategory = friendMoviesData.classes
      ?.filter((c: any) => c.isRanked)
      .map((c: any) => {
        const classKey = c.key;
        const items = friendMoviesData.byClass[classKey] ?? [];
        const runtimes = items
          .filter((item: any) => item.runtimeMinutes && item.runtimeMinutes > 0)
          .map((item: any) => item.runtimeMinutes!);
        const avgRuntime = runtimes.length > 0 ? Math.round(runtimes.reduce((a: number, b: number) => a + b, 0) / runtimes.length) : 0;
        return {
          key: classKey,
          avgRuntime,
          count: items.length
        };
      }) || [];

    // Calculate average runtime per ranked category for shows
    const showAvgRuntimeByCategory = friendTvData.classes
      ?.filter((c: any) => c.isRanked)
      .map((c: any) => {
        const classKey = c.key;
        const items = friendTvData.byClass[classKey] ?? [];
        const runtimes = items
          .filter((item: any) => item.runtimeMinutes && item.runtimeMinutes > 0)
          .map((item: any) => item.runtimeMinutes!);
        const avgRuntime = runtimes.length > 0 ? Math.round(runtimes.reduce((a: number, b: number) => a + b, 0) / runtimes.length) : 0;
        return {
          key: classKey,
          avgRuntime,
          count: items.length
        };
      }) || [];

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
      recentWatches,
      movieRankedCategories,
      tvRankedCategories,
      movieReleaseYearData,
      tvReleaseYearData,
      movieWatchYearData,
      tvWatchYearData,
      movieTotalWatches,
      movieDNFCount,
      movieRewatchCount,
      tvTotalWatches,
      tvDNFCount,
      tvRewatchCount,
      avgWatchtimePerMovie,
      avgWatchtimePerShow,
      movieAvgRuntimeByCategory,
      showAvgRuntimeByCategory
    };
  }, [friendMoviesData, friendTvData, friendPeopleData, friendDirectorsData, rankedMovies, rankedShows]);

  const searchableMovies = useMemo(() => rankedMovies.map(m => ({ id: m.id, title: m.title })), [rankedMovies]);
  const searchableShows = useMemo(() => rankedShows.map(s => ({ id: s.id, title: s.title })), [rankedShows]);
  const searchableActors = useMemo(() => rankedActors.map(a => ({ id: a.id, title: a.title })), [rankedActors]);
  const searchableDirectors = useMemo(() => rankedDirectors.map(d => ({ id: d.id, title: d.title })), [rankedDirectors]);

  const handleScrollToId = useCallback((id: string) => {
    const el = document.getElementById(`profile-entry-${id}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('highlighted-entry');
      setTimeout(() => el.classList.remove('highlighted-entry'), 2000);
    }
  }, []);

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

  // Helper to check if friend has a movie ranked (using FRIEND's data)
  const getFriendMovieStatus = useCallback((itemId: string): { isRanked: boolean; classKey?: string; watchRecords?: WatchRecord[] } => {
    if (!friendMoviesData?.byClass || !friendMoviesData?.classes) return { isRanked: false };
    
    for (const classDef of friendMoviesData.classes) {
      const classKey = classDef.key;
      const items = friendMoviesData.byClass[classKey] ?? [];
      const found = items.find((item: MovieShowItem) => item.id === itemId);
      if (found) {
        return { isRanked: classDef.isRanked, classKey, watchRecords: found.watchRecords };
      }
    }
    return { isRanked: false };
  }, [friendMoviesData]);

  // Helper to check if friend has a show ranked (using FRIEND's data)
  const getFriendShowStatus = useCallback((itemId: string): { isRanked: boolean; classKey?: string; watchRecords?: WatchRecord[] } => {
    if (!friendTvData?.byClass || !friendTvData?.classes) return { isRanked: false };
    
    for (const classDef of friendTvData.classes) {
      const classKey = classDef.key;
      const items = friendTvData.byClass[classKey] ?? [];
      const found = items.find((item: MovieShowItem) => item.id === itemId);
      if (found) {
        return { isRanked: classDef.isRanked, classKey, watchRecords: found.watchRecords };
      }
    }
    return { isRanked: false };
  }, [friendTvData]);

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

  // Helper to check if current user has an actor ranked
  const getUserActorStatus = useCallback((tmdbId: number): { isRanked: boolean; classKey?: string } => {
    if (!tmdbId) return { isRanked: false };
    
    // Check current user's actors from people store
    for (const classKey of myPeopleClassOrder) {
      const items = myPeopleByClass[classKey] ?? [];
      const found = items.find(item => 
        item.tmdbId === tmdbId || 
        item.id === `person-${tmdbId}` ||
        item.id === `tmdb-person-${tmdbId}`
      );
      if (found) {
        return { isRanked: true, classKey };
      }
    }
    
    return { isRanked: false };
  }, [myPeopleByClass, myPeopleClassOrder]);

  // Helper to check if current user has a director ranked
  const getUserDirectorStatus = useCallback((tmdbId: number): { isRanked: boolean; classKey?: string } => {
    if (!tmdbId) return { isRanked: false };
    
    // Check current user's directors
    for (const classKey of myDirectorsClassOrder) {
      const items = myDirectorsByClass[classKey] ?? [];
      const found = items.find(item => 
        item.tmdbId === tmdbId || 
        item.id === `director-${tmdbId}` ||
        item.id === `tmdb-director-${tmdbId}`
      );
      if (found) {
        return { isRanked: true, classKey };
      }
    }
    
    return { isRanked: false };
  }, [myDirectorsByClass, myDirectorsClassOrder]);

  // Calculate friend's global ranks for percentile display
  const friendMoviesGlobalRanks = useMemo(() => {
    if (!friendMoviesData?.byClass || !friendMoviesData?.classes) return new Map();
    
    const rankedItems: any[] = [];
    for (const classDef of friendMoviesData.classes) {
      if (!classDef.isRanked) continue;
      const classKey = classDef.key;
      const items = friendMoviesData.byClass[classKey] ?? [];
      for (const item of items) rankedItems.push(item);
    }
    const total = rankedItems.length || 1;
    const map = new Map<string, { absoluteRank: string; percentileRank: string }>();
    rankedItems.forEach((item, index) => {
      map.set(item.id, {
        absoluteRank: `${index + 1} / ${total}`,
        percentileRank: `${Math.round(((total - index) / total) * 100)}%`
      });
    });
    return map;
  }, [friendMoviesData]);

  const friendTvGlobalRanks = useMemo(() => {
    if (!friendTvData?.byClass || !friendTvData?.classes) return new Map();
    
    const rankedItems: any[] = [];
    for (const classDef of friendTvData.classes) {
      if (!classDef.isRanked) continue;
      const classKey = classDef.key;
      const items = friendTvData.byClass[classKey] ?? [];
      for (const item of items) rankedItems.push(item);
    }
    const total = rankedItems.length || 1;
    const map = new Map<string, { absoluteRank: string; percentileRank: string }>();
    rankedItems.forEach((item, index) => {
      map.set(item.id, {
        absoluteRank: `${index + 1} / ${total}`,
        percentileRank: `${Math.round(((total - index) / total) * 100)}%`
      });
    });
    return map;
  }, [friendTvData]);

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

  // Handle clicking a top 5 actor
  const handleActorClick = (actor: any) => {
    const tmdbId = (actor.tmdbId ?? parseInt(actor.id.replace(/\D/g, ''), 10)) || 0;
    const status = getUserActorStatus(tmdbId);
    const target: PersonRankingTarget = {
      id: actor.id,
      tmdbId,
      name: actor.title,
      profilePath: actor.profilePath,
      mediaType: 'actor',
      existingClassKey: status.classKey,
    };
    setPersonRankingTarget(target);
  };

  // Handle clicking a top 5 director
  const handleDirectorClick = (director: any) => {
    const tmdbId = (director.tmdbId ?? parseInt(director.id.replace(/\D/g, ''), 10)) || 0;
    const status = getUserDirectorStatus(tmdbId);
    const target: PersonRankingTarget = {
      id: director.id,
      tmdbId,
      name: director.title,
      profilePath: director.profilePath,
      mediaType: 'director',
      existingClassKey: status.classKey,
    };
    setPersonRankingTarget(target);
  };

  // Handle saving from the person ranking modal
  const handlePersonRankingSave = async (params: PersonRankingSaveParams, goToList: boolean) => {
    if (!personRankingTarget) return;
    setIsPersonRankingSaving(true);
    try {
      if (personRankingTarget.mediaType === 'actor') {
        if (params.classKey) {
          addPersonFromSearch({
            id: personRankingTarget.id,
            title: personRankingTarget.name,
            profilePath: personRankingTarget.profilePath,
            classKey: params.classKey,
            position: params.position ?? 'top'
          });
        }
      } else if (personRankingTarget.mediaType === 'director') {
        if (params.classKey) {
          addDirectorFromSearch({
            id: personRankingTarget.id,
            title: personRankingTarget.name,
            profilePath: personRankingTarget.profilePath,
            classKey: params.classKey,
            position: params.position ?? 'top'
          });
        }
      }
      
      setPersonRankingTarget(null);
      if (goToList) {
        // Navigate without page reload and scroll to the specific entry
        const targetUrl = personRankingTarget.mediaType === 'actor' ? '/actors' : '/directors';
        const entryId = personRankingTarget.id;
        
        window.history.pushState({}, '', targetUrl);
        window.dispatchEvent(new PopStateEvent('popstate'));
        
        // Wait a bit for the page to render, then scroll to the entry
        setTimeout(() => {
          const element = document.getElementById(`entry-${entryId}`);
          if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            // Add a highlight effect
            element.classList.add('highlighted-entry');
            setTimeout(() => {
              element.classList.remove('highlighted-entry');
            }, 2000);
          } else {
            // Fallback to top if entry not found
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }
        }, 100);
      }
    } catch (err) {
      console.error('Failed to save person ranking:', err);
    } finally {
      setIsPersonRankingSaving(false);
    }
  };

  // Handle removing person entry
  const handleRemovePersonEntry = (itemId: string) => {
    if (personRankingTarget?.mediaType === 'actor') {
      removePersonEntry(itemId);
    } else if (personRankingTarget?.mediaType === 'director') {
      removeDirectorEntry(itemId);
    }
    setPersonRankingTarget(null);
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

  // Custom tooltip for category charts
  const CategoryTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="profile-chart-tooltip">
          <p className="profile-chart-tooltip-category">{data.key}</p>
          <p className="profile-chart-tooltip-count">{data.count} items</p>
          <p className="profile-chart-tooltip-watchtime">{formatDuration(data.watchTime)}</p>
        </div>
      );
    }
    return null;
  };

  // Custom tooltip for release year charts
  const YearTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="profile-chart-tooltip">
          <p className="profile-chart-tooltip-year">{data.year}</p>
          <p className="profile-chart-tooltip-count">{data.count} items</p>
        </div>
      );
    }
    return null;
  };

  // Custom tooltip for watch year charts
  const WatchYearTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="profile-chart-tooltip">
          <p className="profile-chart-tooltip-year">{data.year}</p>
          <p className="profile-chart-tooltip-count">{data.count} watches</p>
          {chartMode === 'time' && (
            <p className="profile-chart-tooltip-watchtime">{formatDuration(data.watchTime)}</p>
          )}
        </div>
      );
    }
    return null;
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
          <div className="profile-stats-header-actions">
            <button
              type="button"
              className="profile-view-friends-btn"
              onClick={handleViewFriendsOfFriend}
              disabled={loadingFriendsOfFriend}
            >
              <Users2 size={16} />
              {showFriendsOfFriendModal ? 'Hide Friends' : 'View Their Friends'}
            </button>
            <button
              type="button"
              className="profile-unfriend-btn"
              onClick={() => setShowUnfriendModal(true)}
            >
              <UserX size={16} />
              Unfriend
            </button>
            <button
              type="button"
              className="profile-stats-expand-btn"
              onClick={() => setShowExpandedStats(!showExpandedStats)}
            >
              {showExpandedStats ? '▼' : '▶'} Detailed stats
            </button>
          </div>
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
              <div className="profile-stat">
                <span className="profile-stat-value profile-stat-value--sub">{formatDuration(stats.avgWatchtimePerMovie || 0)}</span>
                <span className="profile-stat-label">Avg per movie</span>
              </div>
              <div className="profile-stat">
                <span className="profile-stat-value profile-stat-value--sub">{formatDuration(stats.avgWatchtimePerShow || 0)}</span>
                <span className="profile-stat-label">Avg per show</span>
              </div>
            </div>
            
            <div className="profile-stats-grid">
              <div className="profile-stat">
                <span className="profile-stat-value">{stats.episodesWatched || 0}</span>
                <span className="profile-stat-label">Episodes watched</span>
              </div>
              <div className="profile-stat">
                <span className="profile-stat-value">{stats.movieTotalWatches ?? 0}</span>
                <span className="profile-stat-label">Total movie watches</span>
              </div>
              <div className="profile-stat">
                <span className="profile-stat-value">{(stats.movieTotalWatches ?? 0) > 0 ? Math.round((stats.movieDNFCount ?? 0) / (stats.movieTotalWatches ?? 1) * 100) : 0}%</span>
                <span className="profile-stat-label">Movie DNF rate</span>
              </div>
              <div className="profile-stat">
                <span className="profile-stat-value">{(stats.movieTotalWatches ?? 0) > 0 ? Math.round((stats.movieRewatchCount ?? 0) / (stats.movieTotalWatches ?? 1) * 100) : 0}%</span>
                <span className="profile-stat-label">Movie rewatch rate</span>
              </div>
              <div className="profile-stat">
                <span className="profile-stat-value">{(stats.tvTotalWatches ?? 0) > 0 ? Math.round((stats.tvDNFCount ?? 0) / (stats.tvTotalWatches ?? 1) * 100) : 0}%</span>
                <span className="profile-stat-label">Show DNF rate</span>
              </div>
              <div className="profile-stat">
                <span className="profile-stat-value">{(stats.tvTotalWatches ?? 0) > 0 ? Math.round((stats.tvRewatchCount ?? 0) / (stats.tvTotalWatches ?? 1) * 100) : 0}%</span>
                <span className="profile-stat-label">Show rewatch rate</span>
              </div>
            </div>

            <div className="profile-stats-charts">
              <div className="profile-chart-section">
                <div className="profile-chart-header">
                  <h3 className="profile-chart-title">Movies Watched by Year</h3>
                  <div className="profile-chart-toggle">
                    <button
                      type="button"
                      className={`profile-chart-toggle-btn ${chartMode === 'count' ? 'active' : ''}`}
                      onClick={() => setChartMode('count')}
                    >
                      Count
                    </button>
                    <button
                      type="button"
                      className={`profile-chart-toggle-btn ${chartMode === 'time' ? 'active' : ''}`}
                      onClick={() => setChartMode('time')}
                    >
                      Time
                    </button>
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={stats.movieWatchYearData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                    <XAxis dataKey="year" stroke="rgba(255,255,255,0.5)" />
                    <YAxis stroke="rgba(255,255,255,0.5)" />
                    <Tooltip content={<WatchYearTooltip />} />
                    <Bar dataKey={chartMode === 'count' ? 'count' : 'watchTime'} fill="var(--accent)" />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="profile-chart-section">
                <div className="profile-chart-header">
                  <h3 className="profile-chart-title">Shows Watched by Year</h3>
                  <div className="profile-chart-toggle">
                    <button
                      type="button"
                      className={`profile-chart-toggle-btn ${chartMode === 'count' ? 'active' : ''}`}
                      onClick={() => setChartMode('count')}
                    >
                      Count
                    </button>
                    <button
                      type="button"
                      className={`profile-chart-toggle-btn ${chartMode === 'time' ? 'active' : ''}`}
                      onClick={() => setChartMode('time')}
                    >
                      Time
                    </button>
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={stats.tvWatchYearData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                    <XAxis dataKey="year" stroke="rgba(255,255,255,0.5)" />
                    <YAxis stroke="rgba(255,255,255,0.5)" />
                    <Tooltip content={<WatchYearTooltip />} />
                    <Bar dataKey={chartMode === 'count' ? 'count' : 'watchTime'} fill="var(--accent)" />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="profile-chart-section">
                <div className="profile-chart-header">
                  <h3 className="profile-chart-title">Movies by Ranked Category</h3>
                  <div className="profile-chart-toggle">
                    <button
                      type="button"
                      className={`profile-chart-toggle-btn ${chartMode === 'count' ? 'active' : ''}`}
                      onClick={() => setChartMode('count')}
                    >
                      Count
                    </button>
                    <button
                      type="button"
                      className={`profile-chart-toggle-btn ${chartMode === 'time' ? 'active' : ''}`}
                      onClick={() => setChartMode('time')}
                    >
                      Time
                    </button>
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={stats.movieRankedCategories}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                    <XAxis dataKey="key" stroke="rgba(255,255,255,0.5)" angle={-45} textAnchor="end" height={80} />
                    <YAxis stroke="rgba(255,255,255,0.5)" />
                    <Tooltip content={<CategoryTooltip />} />
                    <Bar dataKey={chartMode === 'time' ? 'watchTime' : 'count'} fill="var(--accent)">
                      {stats.movieRankedCategories.map((entry: any, index: number) => (
                        <Cell key={`cell-${index}`} fill={`hsl(${30 + index * 40}, 70%, 60%)`} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="profile-chart-section">
                <div className="profile-chart-header">
                  <h3 className="profile-chart-title">Shows by Ranked Category</h3>
                  <div className="profile-chart-toggle">
                    <button
                      type="button"
                      className={`profile-chart-toggle-btn ${chartMode === 'count' ? 'active' : ''}`}
                      onClick={() => setChartMode('count')}
                    >
                      Count
                    </button>
                    <button
                      type="button"
                      className={`profile-chart-toggle-btn ${chartMode === 'time' ? 'active' : ''}`}
                      onClick={() => setChartMode('time')}
                    >
                      Time
                    </button>
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={stats.tvRankedCategories}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                    <XAxis dataKey="key" stroke="rgba(255,255,255,0.5)" angle={-45} textAnchor="end" height={80} />
                    <YAxis stroke="rgba(255,255,255,0.5)" />
                    <Tooltip content={<CategoryTooltip />} />
                    <Bar dataKey={chartMode === 'time' ? 'watchTime' : 'count'} fill="var(--accent)">
                      {stats.tvRankedCategories.map((entry: any, index: number) => (
                        <Cell key={`cell-${index}`} fill={`hsl(${200 + index * 40}, 70%, 60%)`} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="profile-chart-section">
                <h3 className="profile-chart-title">Movies by Release Year</h3>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={stats.movieReleaseYearData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                    <XAxis dataKey="year" stroke="rgba(255,255,255,0.5)" />
                    <YAxis stroke="rgba(255,255,255,0.5)" />
                    <Tooltip content={<YearTooltip />} />
                    <Bar dataKey="count" fill="var(--accent-soft)" />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="profile-chart-section">
                <h3 className="profile-chart-title">Shows by Release Year</h3>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={stats.tvReleaseYearData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                    <XAxis dataKey="year" stroke="rgba(255,255,255,0.5)" />
                    <YAxis stroke="rgba(255,255,255,0.5)" />
                    <Tooltip content={<YearTooltip />} />
                    <Bar dataKey="count" fill="var(--accent-soft)" />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="profile-chart-section">
                <h3 className="profile-chart-title">Avg Total Runtime per Movie Category</h3>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={stats.movieAvgRuntimeByCategory}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                    <XAxis dataKey="key" stroke="rgba(255,255,255,0.5)" angle={-45} textAnchor="end" height={80} />
                    <YAxis stroke="rgba(255,255,255,0.5)" />
                    <Tooltip content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        return (
                          <div className="profile-chart-tooltip">
                            <p className="profile-chart-tooltip-category">{data.key}</p>
                            <p className="profile-chart-tooltip-count">{data.avgRuntime} min avg</p>
                            <p className="profile-chart-tooltip-count">{data.count} movies</p>
                          </div>
                        );
                      }
                      return null;
                    }} />
                    <Bar dataKey="avgRuntime" fill="var(--accent)">
                      {stats.movieAvgRuntimeByCategory.map((entry: any, index: number) => (
                        <Cell key={`cell-${index}`} fill={`hsl(${30 + index * 40}, 70%, 60%)`} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="profile-chart-section">
                <h3 className="profile-chart-title">Avg Total Runtime per Show Category</h3>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={stats.showAvgRuntimeByCategory}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                    <XAxis dataKey="key" stroke="rgba(255,255,255,0.5)" angle={-45} textAnchor="end" height={80} />
                    <YAxis stroke="rgba(255,255,255,0.5)" />
                    <Tooltip content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        return (
                          <div className="profile-chart-tooltip">
                            <p className="profile-chart-tooltip-category">{data.key}</p>
                            <p className="profile-chart-tooltip-count">{data.avgRuntime} min avg</p>
                            <p className="profile-chart-tooltip-count">{data.count} shows</p>
                          </div>
                        );
                      }
                      return null;
                    }} />
                    <Bar dataKey="avgRuntime" fill="var(--accent)">
                      {stats.showAvgRuntimeByCategory.map((entry: any, index: number) => (
                        <Cell key={`cell-${index}`} fill={`hsl(${200 + index * 40}, 70%, 60%)`} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="profile-grid">
        <div className="profile-card card-surface">
          <div className="profile-card-header">
            <h2 className="profile-card-title">
              {showAllMoviesWithClasses ? `All ${rankedMoviesCount} Movies` : 'Top 10 Movies'}
            </h2>
            <button
              type="button"
              className="profile-stats-expand-btn profile-tiny-expand-btn"
              onClick={() => setShowAllMoviesWithClasses(!showAllMoviesWithClasses)}
            >
              {showAllMoviesWithClasses ? 'Show Top 10' : 'Show all with classes'}
            </button>
          </div>
          {showAllMoviesWithClasses && (
            <PageSearch 
              items={searchableMovies} 
              onSelect={handleScrollToId} 
              placeholder="Search all movies..." 
              className="profile-section-search"
              pageKey="friend-profile-movies"
            />
          )}
          {showAllMoviesWithClasses ? (
            <div className="profile-classes-view">
              {friendMoviesData?.classes?.filter((c: any) => c.key !== 'UNRANKED' && friendMoviesData.byClass[c.key]?.length > 0).map((classDef: any) => (
                <div key={classDef.key} className="profile-class-section">
                  <h3 className="profile-class-title">{classDef.label}</h3>
                  <div className="profile-class-grid">
                    {friendMoviesData.byClass[classDef.key].map((m: any, i: number) => {
                      const tmdbId = (m.tmdbId ?? parseInt(m.id.replace(/\D/g, ''), 10)) || 0;
                      const userStatus = getUserMovieStatus(tmdbId);
                      return (
                        <div 
                          key={m.id} 
                          id={`profile-entry-${m.id}`}
                          className="profile-top-item profile-top-item--clickable"
                          onClick={() => handleMovieClick(m)}
                        >
                          <div className="profile-top-poster">
                            {getMovieImageSrc(m.posterPath, m.title, m.tmdbId) ? (
                              <img src={getMovieImageSrc(m.posterPath, m.title, m.tmdbId) ?? ''} alt={m.title} loading="lazy" />
                            ) : (
                              <span className="profile-top-poster-placeholder">{isBigMovie(m.title, m.tmdbId) ? 'B' : '🎬'}</span>
                            )}
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
              ))}
            </div>
          ) : (
            <div className="profile-top-grid">
              {allMoviesExceptUnranked.slice(0, 10).map((m, i) => {
                const tmdbId = (m.tmdbId ?? parseInt(m.id.replace(/\D/g, ''), 10)) || 0;
                const userStatus = getUserMovieStatus(tmdbId);
                return (
                  <div 
                    key={m.id} 
                    className="profile-top-item profile-top-item--clickable"
                    onClick={() => handleMovieClick(m)}
                  >
                    <div className="profile-top-poster">
                      {getMovieImageSrc(m.posterPath, m.title, m.tmdbId) ? (
                        <img src={getMovieImageSrc(m.posterPath, m.title, m.tmdbId) ?? ''} alt={m.title} loading="lazy" />
                      ) : (
                        <span className="profile-top-poster-placeholder">{isBigMovie(m.title, m.tmdbId) ? 'B' : '🎬'}</span>
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
          )}
        </div>

        <div className="profile-card card-surface">
          <div className="profile-card-header">
            <h2 className="profile-card-title">
              {showAllShowsWithClasses ? `All ${rankedShowsCount} Shows` : 'Top 10 Shows'}
            </h2>
            <button
              type="button"
              className="profile-stats-expand-btn profile-tiny-expand-btn"
              onClick={() => setShowAllShowsWithClasses(!showAllShowsWithClasses)}
            >
              {showAllShowsWithClasses ? 'Show Top 10' : 'Show all with classes'}
            </button>
          </div>
          {showAllShowsWithClasses && (
            <PageSearch 
              items={searchableShows} 
              onSelect={handleScrollToId} 
              placeholder="Search all shows..." 
              className="profile-section-search"
              pageKey="friend-profile-shows"
            />
          )}
          {showAllShowsWithClasses ? (
            <div className="profile-classes-view">
              {friendTvData?.classes?.filter((c: any) => c.key !== 'UNRANKED' && friendTvData.byClass[c.key]?.length > 0).map((classDef: any) => (
                <div key={classDef.key} className="profile-class-section">
                  <h3 className="profile-class-title">{classDef.label}</h3>
                  <div className="profile-class-grid">
                    {friendTvData.byClass[classDef.key].map((s: any, i: number) => {
                      const tmdbId = (s.tmdbId ?? parseInt(s.id.replace(/\D/g, ''), 10)) || 0;
                      const userStatus = getUserShowStatus(tmdbId);
                      return (
                        <div 
                          key={s.id} 
                          id={`profile-entry-${s.id}`}
                          className="profile-top-item profile-top-item--clickable"
                          onClick={() => handleShowClick(s)}
                        >
                          <div className="profile-top-poster">
                            {s.posterPath ? (
                              <img src={tmdbImagePath(s.posterPath) ?? ''} alt={s.title} loading="lazy" />
                            ) : (
                              <span className="profile-top-poster-placeholder">📺</span>
                            )}
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
              ))}
            </div>
          ) : (
            <div className="profile-top-grid">
              {allShowsExceptUnranked.slice(0, 10).map((s, i) => {
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
          )}
        </div>
      </div>

      {(hasActors || hasDirectors) && (
        <div className="profile-grid">
          {hasActors && (
            <div className="profile-card card-surface">
              <div className="profile-card-header">
                <h2 className="profile-card-title">
                  {showAllActorsWithClasses ? `All ${rankedActorsCount} Actors` : 'Top 5 Actors'}
                </h2>
                <button
                  type="button"
                  className="profile-stats-expand-btn profile-tiny-expand-btn"
                  onClick={() => setShowAllActorsWithClasses(!showAllActorsWithClasses)}
                >
                  {showAllActorsWithClasses ? 'Show Top 5' : 'Show all with classes'}
                </button>
              </div>
              {showAllActorsWithClasses && (
                <PageSearch 
                  items={searchableActors} 
                  onSelect={handleScrollToId} 
                  placeholder="Search all actors..." 
                  className="profile-section-search"
                  pageKey="friend-profile-actors"
                />
              )}
              {showAllActorsWithClasses ? (
                <div className="profile-classes-view">
                  {friendPeopleData?.classes?.filter((c: any) => c.isRanked && friendPeopleData.byClass[c.key]?.length > 0).map((classDef: any) => (
                    <div key={classDef.key} className="profile-class-section">
                      <h3 className="profile-class-title">{classDef.label}</h3>
                      <div className="profile-class-grid">
                        {friendPeopleData.byClass[classDef.key].map((a: any, i: number) => {
                          const tmdbId = (a.tmdbId ?? parseInt(a.id.replace(/\D/g, ''), 10)) || 0;
                          const userStatus = getUserActorStatus(tmdbId);
                          return (
                            <div 
                              key={a.id} 
                              id={`profile-entry-${a.id}`}
                              className="profile-top-item profile-top-item--clickable"
                              onClick={() => handleActorClick(a)}
                            >
                              <div className="profile-top-poster">
                                {a.profilePath ? (
                                  <img src={tmdbImagePath(a.profilePath) ?? ''} alt={a.title} loading="lazy" />
                                ) : (
                                  <span className="profile-top-poster-placeholder">🎭</span>
                                )}
                                <div className="profile-top-overlay">
                                  <span className={userStatus.isRanked ? 'profile-top-overlay-text profile-top-overlay-text--seen' : 'profile-top-overlay-text'}>
                                    {userStatus.isRanked ? 'EDIT' : 'SAVE'}
                                  </span>
                                </div>
                              </div>
                              <div className="profile-top-info">
                                <span className="profile-top-title">{a.title}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="profile-top-grid">
                  {top5Actors.map((a: any, i: number) => {
                    const tmdbId = (a.tmdbId ?? parseInt(a.id.replace(/\D/g, ''), 10)) || 0;
                    const userStatus = getUserActorStatus(tmdbId);
                    return (
                      <div 
                        key={a.id} 
                        className="profile-top-item profile-top-item--clickable"
                        onClick={() => handleActorClick(a)}
                      >
                        <div className="profile-top-poster">
                          {a.profilePath ? (
                            <img src={tmdbImagePath(a.profilePath) ?? ''} alt={a.title} loading="lazy" />
                          ) : (
                            <span className="profile-top-poster-placeholder">🎭</span>
                          )}
                          <span className="profile-top-rank">#{i + 1}</span>
                          <div className="profile-top-overlay">
                            <span className={userStatus.isRanked ? 'profile-top-overlay-text profile-top-overlay-text--seen' : 'profile-top-overlay-text'}>
                              {userStatus.isRanked ? 'EDIT' : 'SAVE'}
                            </span>
                          </div>
                        </div>
                        <div className="profile-top-info">
                          <span className="profile-top-title">{a.title}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {hasDirectors && (
            <div className="profile-card card-surface">
              <div className="profile-card-header">
                <h2 className="profile-card-title">
                  {showAllDirectorsWithClasses ? `All ${rankedDirectorsCount} Directors` : 'Top 5 Directors'}
                </h2>
                <button
                  type="button"
                  className="profile-stats-expand-btn profile-tiny-expand-btn"
                  onClick={() => setShowAllDirectorsWithClasses(!showAllDirectorsWithClasses)}
                >
                  {showAllDirectorsWithClasses ? 'Show Top 5' : 'Show all with classes'}
                </button>
              </div>
              {showAllDirectorsWithClasses && (
                <PageSearch 
                  items={searchableDirectors} 
                  onSelect={handleScrollToId} 
                  placeholder="Search all directors..." 
                  className="profile-section-search"
                  pageKey="friend-profile-directors"
                />
              )}
              {showAllDirectorsWithClasses ? (
                <div className="profile-classes-view">
                  {friendDirectorsData?.classes?.filter((c: any) => c.isRanked && friendDirectorsData.byClass[c.key]?.length > 0).map((classDef: any) => (
                    <div key={classDef.key} className="profile-class-section">
                      <h3 className="profile-class-title">{classDef.label}</h3>
                      <div className="profile-class-grid">
                        {friendDirectorsData.byClass[classDef.key].map((d: any, i: number) => {
                          const tmdbId = (d.tmdbId ?? parseInt(d.id.replace(/\D/g, ''), 10)) || 0;
                          const userStatus = getUserDirectorStatus(tmdbId);
                          return (
                            <div 
                              key={d.id} 
                              id={`profile-entry-${d.id}`}
                              className="profile-top-item profile-top-item--clickable"
                              onClick={() => handleDirectorClick(d)}
                            >
                              <div className="profile-top-poster">
                                {d.profilePath ? (
                                  <img src={tmdbImagePath(d.profilePath) ?? ''} alt={d.title} loading="lazy" />
                                ) : (
                                  <span className="profile-top-poster-placeholder">🎬</span>
                                )}
                                <div className="profile-top-overlay">
                                  <span className={userStatus.isRanked ? 'profile-top-overlay-text profile-top-overlay-text--seen' : 'profile-top-overlay-text'}>
                                    {userStatus.isRanked ? 'EDIT' : 'SAVE'}
                                  </span>
                                </div>
                              </div>
                              <div className="profile-top-info">
                                <span className="profile-top-title">{d.title}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="profile-top-grid">
                  {top5Directors.map((d: any, i: number) => {
                    const tmdbId = (d.tmdbId ?? parseInt(d.id.replace(/\D/g, ''), 10)) || 0;
                    const userStatus = getUserDirectorStatus(tmdbId);
                    return (
                      <div 
                        key={d.id} 
                        className="profile-top-item profile-top-item--clickable"
                        onClick={() => handleDirectorClick(d)}
                      >
                        <div className="profile-top-poster">
                          {d.profilePath ? (
                            <img src={tmdbImagePath(d.profilePath) ?? ''} alt={d.title} loading="lazy" />
                          ) : (
                            <span className="profile-top-poster-placeholder">🎬</span>
                          )}
                          <span className="profile-top-rank">#{i + 1}</span>
                          <div className="profile-top-overlay">
                            <span className={userStatus.isRanked ? 'profile-top-overlay-text profile-top-overlay-text--seen' : 'profile-top-overlay-text'}>
                              {userStatus.isRanked ? 'EDIT' : 'SAVE'}
                            </span>
                          </div>
                        </div>
                        <div className="profile-top-info">
                          <span className="profile-top-title">{d.title}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="profile-split-layout">
        <div className="profile-recent profile-card card-surface">
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
                {filteredRecentWatches.map((w, i) => {
                  const userStatus = w.isMovie 
                    ? getUserMovieStatus(w.item.tmdbId || 0)
                    : getUserShowStatus(w.item.tmdbId || 0);
                  
                  // Get friend's status for ranking display
                  const friendStatus = w.isMovie 
                    ? getFriendMovieStatus(w.item.id)
                    : getFriendShowStatus(w.item.id);
                  
                  const handleClick = () => {
                    if (w.isMovie) {
                      handleMovieClick(w.item);
                    } else {
                      handleShowClick(w.item);
                    }
                  };
                  
                  // Get percentile ranking or special class text using FRIEND's data
                  let displayText = null;
                  if (friendStatus.isRanked) {
                    const globalRanks = w.isMovie ? friendMoviesGlobalRanks : friendTvGlobalRanks;
                    const rankInfo = globalRanks.get(w.item.id);
                    displayText = rankInfo?.percentileRank;
                  } else if (friendStatus.classKey === 'DELICIOUS_GARBAGE') {
                    displayText = 'GARB';
                  } else if (friendStatus.classKey === 'BABY') {
                    displayText = 'BABY';
                  } else {
                    displayText = 'N/A';
                  }
                  
                  return (
                    <div 
                      key={`${w.item.id}-${getWatchRecordSortKey(w.record)}-${i}`} 
                      className="profile-recent-tile profile-top-item--clickable"
                      onClick={handleClick}
                    >
                      <div className="profile-recent-tile-poster">
                        {getMovieImageSrc(w.item.posterPath, w.item.title, w.item.tmdbId) ? (
                          <img src={getMovieImageSrc(w.item.posterPath, w.item.title, w.item.tmdbId) ?? ''} alt="" loading="lazy" />
                        ) : (
                          <span>{isBigMovie(w.item.title, w.item.tmdbId) ? 'B' : (w.isMovie ? '🎬' : '📺')}</span>
                        )}
                        <div className="profile-top-overlay">
                          <span className={userStatus.isRanked ? 'profile-top-overlay-text profile-top-overlay-text--seen' : 'profile-top-overlay-text'}>
                            {userStatus.isRanked ? 'SEEN' : 'SAVE'}
                          </span>
                        </div>
                        {displayText && (
                          <div className={`profile-recent-percentile ${!friendStatus.isRanked ? 'profile-recent-percentile--unranked' : ''} ${w.isMovie ? 'profile-recent-percentile--movie' : 'profile-recent-percentile--tv'}`}>
                            {displayText}
                          </div>
                        )}
                      </div>
                      <div className="profile-recent-tile-info">
                        <span className="profile-recent-tile-title">{w.item.title}</span>
                        <span className="profile-recent-tile-date">
                          {getWatchRecordSortKey(w.record)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <ProfileWatchlist 
          isOwnProfile={false} 
          friendWatchlistData={friendWatchlistData}
          onMovieClick={(entry) => {
            const tmdbId = (entry.id.includes('-') ? parseInt(entry.id.split('-').pop() || '0', 10) : parseInt(entry.id.replace(/\D/g, ''), 10)) || 0;
            const movie = {
              id: entry.id,
              tmdbId,
              title: entry.title,
              posterPath: entry.posterPath,
              releaseDate: entry.releaseDate,
              classKey: '',
            } as MovieShowItem;
            handleMovieClick(movie);
          }}
          onShowClick={(entry) => {
            const tmdbId = (entry.id.includes('-') ? parseInt(entry.id.split('-').pop() || '0', 10) : parseInt(entry.id.replace(/\D/g, ''), 10)) || 0;
            const show = {
              id: entry.id,
              tmdbId,
              title: entry.title,
              posterPath: entry.posterPath,
              releaseDate: entry.releaseDate,
              classKey: '',
            } as MovieShowItem;
            handleShowClick(show);
          }}
          getUserMovieStatus={(tmdbId) => {
            // Convert tmdbId to itemId format for friend status lookup
            const possibleIds = [
              `tmdb-movie-${tmdbId}`,
              `movie-${tmdbId}`,
              `${tmdbId}`
            ];
            for (const id of possibleIds) {
              const status = getFriendMovieStatus(id);
              if (status.classKey) return status;
            }
            return { isRanked: false };
          }}
          getUserShowStatus={(tmdbId) => {
            // Convert tmdbId to itemId format for friend status lookup
            const possibleIds = [
              `tmdb-tv-${tmdbId}`,
              `tv-${tmdbId}`,
              `${tmdbId}`
            ];
            for (const id of possibleIds) {
              const status = getFriendShowStatus(id);
              if (status.classKey) return status;
            }
            return { isRanked: false };
          }}
        />
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
          isWatchlistItem={isInWatchlist(rankingTarget.id)}
          onAddToWatchlist={() => {
            const entry = {
              id: rankingTarget.id,
              title: rankingTarget.title,
              posterPath: rankingTarget.posterPath,
              releaseDate: rankingTarget.releaseDate,
            };
            addToWatchlist(entry, rankingTarget.mediaType === 'movie' ? 'movies' : 'tv');
          }}
          onRemoveFromWatchlist={() => {
            removeFromWatchlist(rankingTarget.id);
          }}
          onSave={handleRankingSave}
          onClose={() => setRankingTarget(null)}
          onRemoveEntry={handleRemoveEntry}
          isSaving={isRankingSaving}
        />
      )}

      {/* Person Ranking Modal for Actors/Directors */}
      {personRankingTarget && (
        <PersonRankingModal
          target={personRankingTarget}
          rankedClasses={personRankingTarget.mediaType === 'actor' ? myPeopleClasses : myDirectorsClasses}
          currentClassKey={personRankingTarget.existingClassKey}
          currentClassLabel={personRankingTarget.existingClassKey ? 
            (personRankingTarget.mediaType === 'actor' ? 
              myPeopleClasses.find(c => c.key === personRankingTarget.existingClassKey)?.label :
              myDirectorsClasses.find(c => c.key === personRankingTarget.existingClassKey)?.label
            ) : undefined
          }
          onSave={handlePersonRankingSave}
          onClose={() => setPersonRankingTarget(null)}
          onRemoveEntry={handleRemovePersonEntry}
          isSaving={isPersonRankingSaving}
        />
      )}

      {/* Friends of Friend Modal */}
      {showFriendsOfFriendModal && (
        <div className="friends-of-friend-modal-overlay">
          <div className="friends-of-friend-modal">
            <div className="friends-of-friend-modal-header">
              <Users2 size={24} className="friends-of-friend-modal-icon" />
              <h2>{friendProfile?.username}'s Friends ({friendsOfFriend.length})</h2>
              <button
                type="button"
                className="friends-of-friend-modal-close"
                onClick={() => setShowFriendsOfFriendModal(false)}
              >
                ×
              </button>
            </div>
            <div className="friends-of-friend-modal-content">
              {loadingFriendsOfFriend ? (
                <div className="friends-of-friend-loading">Loading friends...</div>
              ) : friendsOfFriend.length > 0 ? (
                <div className="friends-of-friend-grid">
                  {friendsOfFriend.map(friend => {
                    const isCurrentUser = friend.uid === user?.uid;
                    const isAlreadyFriend = friends.some(f => f.uid === friend.uid);
                    const isRequestSent = sentRequests.includes(friend.uid);
                    
                    return (
                      <div key={friend.uid} className="friends-of-friend-item">
                        <div className="friends-of-friend-avatar">
                          {friend.username.charAt(0).toUpperCase()}
                        </div>
                        <div className="friends-of-friend-info">
                          <strong>{friend.username}</strong>
                          <span>{friend.email}</span>
                        </div>
                        <div className="friends-of-friend-actions">
                          {isCurrentUser ? (
                            <span className="friends-of-friend-self">Self</span>
                          ) : isAlreadyFriend ? (
                            <button
                              type="button"
                              className="friends-of-friend-view-btn"
                              onClick={() => {
                                setShowFriendsOfFriendModal(false);
                                navigate(`/friends/${friend.uid}`);
                              }}
                            >
                              View Profile
                            </button>
                          ) : isRequestSent ? (
                            <span className="friends-of-friend-sent">Request Sent</span>
                          ) : (
                            <button
                              type="button"
                              className="friends-of-friend-add-btn"
                              onClick={() => sendFriendRequest({
                                uid: friend.uid,
                                username: friend.username,
                                email: friend.email,
                                createdAt: friend.addedAt
                              })}
                            >
                              <UserPlus size={14} />
                              Add Friend
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="friends-of-friend-empty">
                  <Users2 size={48} />
                  <p>No friends found</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Unfriend Modal */}
      {showUnfriendModal && (
        <div className="unfriend-modal-overlay">
          <div className="unfriend-modal">
            <div className="unfriend-modal-header">
              <UserX size={24} className="unfriend-modal-icon" />
              <h2>Unfriend {friendProfile?.username}?</h2>
            </div>
            <div className="unfriend-modal-content">
              <p>This action cannot be undone. You will need to send a new friend request if you want to reconnect.</p>
              <div className="unfriend-modal-confirmation">
                <label htmlFor="unfriend-input">
                  Type <strong>"UNFRIEND"</strong> to confirm:
                </label>
                <input
                  id="unfriend-input"
                  type="text"
                  value={unfriendConfirmation}
                  onChange={(e) => setUnfriendConfirmation(e.target.value)}
                  placeholder="Type UNFRIEND"
                  className="unfriend-modal-input"
                />
              </div>
            </div>
            <div className="unfriend-modal-actions">
              <button
                type="button"
                className="unfriend-modal-btn unfriend-modal-btn--cancel"
                onClick={() => {
                  setShowUnfriendModal(false);
                  setUnfriendConfirmation('');
                }}
                disabled={unfriending}
              >
                Cancel
              </button>
              <button
                type="button"
                className="unfriend-modal-btn unfriend-modal-btn--confirm"
                onClick={handleUnfriend}
                disabled={unfriendConfirmation !== 'UNFRIEND' || unfriending}
              >
                {unfriending ? 'Unfriending...' : 'Unfriend'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
