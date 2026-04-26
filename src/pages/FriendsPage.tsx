import { useState, useEffect, useRef, useMemo } from 'react';
import { useFriends } from '../context/FriendsContext';
import { useAuth } from '../context/AuthContext';
import { Search, UserPlus, Check, X, Eye, Loader, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { db } from '../lib/firebase';
import { loadMovies } from '../lib/firestoreMovies';
import { loadTvShows } from '../lib/firestoreTvShows';
import { tmdbImagePath } from '../lib/tmdb';
import './FriendsPage.css';

interface UserProfile {
  uid: string;
  username: string;
  email: string;
  createdAt: string;
  pfpPosterPath?: string;
  pfpPhotoUrl?: string;
}

function hashString(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function pickPosterCollageFixedCount(posters: string[], seedKey: string, count: number): string[] {
  if (count <= 0 || posters.length === 0) return [];
  const unique = Array.from(new Set(posters));
  const sorted = unique
    .map((poster) => ({ poster, score: hashString(`${seedKey}:${poster}`) }))
    .sort((a, b) => a.score - b.score)
    .map((item) => item.poster);
  const base = sorted.slice(0, Math.min(count, sorted.length));
  if (base.length >= count) return base;
  const filled: string[] = [];
  for (let i = 0; i < count; i += 1) {
    filled.push(base[i % base.length]);
  }
  return filled;
}

function topMoviePosterPathsFromMoviesData(moviesData: any, maxCount = 10): string[] {
  if (!moviesData?.classes || !moviesData?.byClass) return [];
  const posters: string[] = [];
  for (const classDef of moviesData.classes as Array<{ key: string }>) {
    if (classDef.key === 'UNRANKED') continue;
    const classItems = (moviesData.byClass[classDef.key] ?? []) as Array<{ posterPath?: string }>;
    for (const item of classItems) {
      if (item.posterPath) posters.push(item.posterPath);
      if (posters.length >= maxCount) return posters;
    }
  }
  return posters;
}

export function FriendsPage() {
  const { user } = useAuth();
  const {
    friends,
    sentRequests,
    receivedRequests,
    loading,
    refreshFriends,
    sendFriendRequest,
    acceptFriendRequest,
    rejectFriendRequest,
    searchUsers,
  } = useFriends();

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UserProfile[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [friendCountsByUid, setFriendCountsByUid] = useState<Record<string, { movies: number; shows: number }>>({});
  const [friendTopMoviePostersByUid, setFriendTopMoviePostersByUid] = useState<Record<string, string[]>>({});
  const [cachedOrderByUid, setCachedOrderByUid] = useState<Record<string, number>>({});
  const pagePosterShuffleSeed = useMemo(() => `${Date.now()}-${Math.random().toString(36).slice(2)}`, []);
  const searchTimeoutRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    searchTimeoutRef.current = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const results = await searchUsers(searchQuery);
        setSearchResults(results);
      } catch (error) {
        console.error('Error searching users:', error);
      } finally {
        setSearchLoading(false);
      }
    }, 300);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchQuery, searchUsers]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refreshFriends();
    setRefreshing(false);
  };

  const loggedIn = !!user;
  const cacheKeyBase = user?.uid ? `clastone:friends-page:${user.uid}` : null;

  useEffect(() => {
    if (!loggedIn || !cacheKeyBase) return;
    try {
      const cachedCountsRaw = localStorage.getItem(`${cacheKeyBase}:counts`);
      if (cachedCountsRaw) {
        const cachedCounts = JSON.parse(cachedCountsRaw) as Record<string, { movies: number; shows: number }>;
        setFriendCountsByUid(cachedCounts);
      }
      const cachedMoviePostersRaw = localStorage.getItem(`${cacheKeyBase}:top-movie-posters`);
      if (cachedMoviePostersRaw) {
        const cachedMoviePosters = JSON.parse(cachedMoviePostersRaw) as Record<string, string[]>;
        setFriendTopMoviePostersByUid(cachedMoviePosters);
      }
      const cachedOrderRaw = localStorage.getItem(`${cacheKeyBase}:order`);
      if (cachedOrderRaw) {
        const cachedOrder = JSON.parse(cachedOrderRaw) as string[];
        const orderMap: Record<string, number> = {};
        cachedOrder.forEach((uid, idx) => {
          orderMap[uid] = idx;
        });
        setCachedOrderByUid(orderMap);
      }
    } catch {
      // Ignore local cache parsing issues; we can always rebuild from live data.
    }
  }, [loggedIn, cacheKeyBase]);

  const sortedFriends = useMemo(() => {
    const uniqueFriends = Array.from(
      friends.reduce((map, friend) => {
        if (!map.has(friend.uid)) map.set(friend.uid, friend);
        return map;
      }, new Map<string, (typeof friends)[number]>()).values()
    );
    return uniqueFriends.sort((a, b) => {
      const countsA = friendCountsByUid[a.uid] ?? { movies: 0, shows: 0 };
      const countsB = friendCountsByUid[b.uid] ?? { movies: 0, shows: 0 };
      const totalA = countsA.movies + countsA.shows;
      const totalB = countsB.movies + countsB.shows;
      if (totalA !== totalB) return totalB - totalA;
      const cachedA = cachedOrderByUid[a.uid];
      const cachedB = cachedOrderByUid[b.uid];
      if (cachedA != null && cachedB != null && cachedA !== cachedB) return cachedA - cachedB;
      return a.username.localeCompare(b.username);
    });
  }, [friends, friendCountsByUid, cachedOrderByUid]);

  useEffect(() => {
    if (!loggedIn || !db || friends.length === 0) {
      setFriendCountsByUid({});
      setFriendTopMoviePostersByUid({});
      return;
    }
    const firestoreDb = db;

    let cancelled = false;
    (async () => {
      const results = await Promise.all(
        friends.map(async (friend) => {
          try {
            const [moviesData, tvData] = await Promise.all([
              loadMovies(firestoreDb, friend.uid),
              loadTvShows(firestoreDb, friend.uid),
            ]);
            const movies = Object.values(moviesData.byClass).reduce((acc, list) => acc + list.length, 0);
            const shows = Object.values(tvData.byClass).reduce((acc, list) => acc + list.length, 0);
            const topMoviePosters = topMoviePosterPathsFromMoviesData(moviesData, 10);
            return [friend.uid, { movies, shows, topMoviePosters }] as const;
          } catch {
            return [friend.uid, { movies: 0, shows: 0, topMoviePosters: [] as string[] }] as const;
          }
        })
      );
      if (cancelled) return;
      const nextCounts = Object.fromEntries(results.map(([uid, value]) => [uid, { movies: value.movies, shows: value.shows }]));
      const nextTopMoviePostersByUid = Object.fromEntries(results.map(([uid, value]) => [uid, value.topMoviePosters]));
      setFriendCountsByUid(nextCounts);
      setFriendTopMoviePostersByUid(nextTopMoviePostersByUid);
      if (cacheKeyBase) {
        try {
          localStorage.setItem(`${cacheKeyBase}:counts`, JSON.stringify(nextCounts));
          localStorage.setItem(`${cacheKeyBase}:top-movie-posters`, JSON.stringify(nextTopMoviePostersByUid));
        } catch {
          // Ignore localStorage failures (e.g. quota/private mode).
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [loggedIn, friends, cacheKeyBase]);

  useEffect(() => {
    if (!cacheKeyBase || sortedFriends.length === 0) return;
    const order = sortedFriends.map((f) => f.uid);
    try {
      localStorage.setItem(`${cacheKeyBase}:order`, JSON.stringify(order));
    } catch {
      // Ignore localStorage failures (e.g. quota/private mode).
    }
    const orderMap: Record<string, number> = {};
    order.forEach((uid, idx) => {
      orderMap[uid] = idx;
    });
    setCachedOrderByUid(orderMap);
  }, [sortedFriends, cacheKeyBase]);

  return (
    <div className="friends-page">
      <div className={`friends-container ${loggedIn && receivedRequests.length === 0 ? 'friends-container--no-requests' : ''}`}>
        <header className="friends-header">
          <h1>People</h1>
          {loggedIn && (
            <div className="friends-header-actions">
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="refresh-btn"
                title="Refresh list"
              >
                <RefreshCw size={18} className={refreshing ? 'spinning' : ''} />
              </button>
            </div>
          )}
          <p>{loggedIn ? 'Connect and share your movie rankings' : 'Browse public profiles by username'}</p>
        </header>

        {loggedIn && receivedRequests.length > 0 && (
          <section className="friend-requests">
            <h2>Friend Requests</h2>
            <div className="requests-list">
              {receivedRequests.map((request) => (
                <div key={request.id} className="request-item">
                  <div className="request-info">
                    <strong>{request.fromUsername}</strong>
                    <span>wants to be your friend</span>
                  </div>
                  <div className="request-actions">
                    <button
                      onClick={() => acceptFriendRequest(request)}
                      disabled={loading}
                      className="accept-btn"
                    >
                      <Check size={16} />
                    </button>
                    <button
                      onClick={() => rejectFriendRequest(request.id)}
                      disabled={loading}
                      className="reject-btn"
                    >
                      <X size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="search-section">
          <h2>Find people</h2>
          <div className="search-container">
            <input
              type="text"
              placeholder="Search by username..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="search-input"
            />
            {searchLoading && <Loader size={20} className="search-loading" />}
          </div>
        </section>

        {searchResults.length > 0 && (
          <section className="search-results">
            <h3>Search Results</h3>
            <div className="results-list">
              {searchResults.map((result) => {
                const isFriend = loggedIn && friends.some((f) => f.uid === result.uid);
                const requestSent = loggedIn && sentRequests.includes(result.uid);

                return (
                  <div key={result.uid} className="result-item">
                    <div className="user-info">
                      <div className="user-avatar">
                        {result.pfpPosterPath ? (
                          <img
                            src={tmdbImagePath(result.pfpPosterPath, 'w92') ?? ''}
                            alt={result.username}
                            loading="lazy"
                          />
                        ) : result.pfpPhotoUrl ? (
                          <img
                            src={result.pfpPhotoUrl}
                            alt={result.username}
                            loading="lazy"
                          />
                        ) : (
                          result.username.charAt(0).toUpperCase()
                        )}
                      </div>
                      <div className="user-details">
                        <strong>{result.username}</strong>
                      </div>
                    </div>
                    <div className="user-actions">
                      {!loggedIn ? (
                        <Link to={`/friends/${result.uid}`} className="view-profile-btn">
                          <Eye size={16} />
                          View Profile
                        </Link>
                      ) : isFriend ? (
                        <Link to={`/friends/${result.uid}`} className="view-profile-btn">
                          <Eye size={16} />
                          View Profile
                        </Link>
                      ) : requestSent ? (
                        <>
                          <Link
                            to={`/friends/${result.uid}`}
                            className="view-profile-icon-btn"
                            title="View profile"
                          >
                            <Eye size={18} />
                          </Link>
                          <button disabled className="request-sent-btn">
                            <Check size={16} />
                            Request Sent
                          </button>
                        </>
                      ) : (
                        <>
                          <Link
                            to={`/friends/${result.uid}`}
                            className="view-profile-icon-btn"
                            title="View profile"
                          >
                            <Eye size={18} />
                          </Link>
                          <button
                            onClick={() => sendFriendRequest(result)}
                            disabled={loading}
                            className="add-friend-btn"
                          >
                            <UserPlus size={16} />
                            Add Friend
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {loggedIn && friends.length > 0 && (
          <section className="friends-list">
            <h2>Your friends</h2>
            <div className="friends-grid">
              {sortedFriends.map((friend) => {
                const counts = friendCountsByUid[friend.uid] ?? { movies: 0, shows: 0 };
                const topMoviePosters = friendTopMoviePostersByUid[friend.uid] ?? [];
                const posterBackgrounds = pickPosterCollageFixedCount(
                  topMoviePosters,
                  `friend:${friend.uid}:${pagePosterShuffleSeed}`,
                  12
                );
                return (
                  <Link key={friend.uid} to={`/friends/${friend.uid}`} className="friend-card">
                    {posterBackgrounds.length > 0 ? (
                      <div className="friend-card-bg" aria-hidden="true">
                        {posterBackgrounds.map((posterPath, index) => (
                          <div key={`${posterPath}-${index}`} className="friend-card-bg-item">
                            <img src={tmdbImagePath(posterPath, 'w185') ?? ''} alt="" loading="lazy" />
                          </div>
                        ))}
                      </div>
                    ) : null}
                    <div className="friend-avatar">
                      {friend.pfpPosterPath ? (
                        <img src={tmdbImagePath(friend.pfpPosterPath, 'w92') ?? ''} alt={friend.username} loading="lazy" />
                      ) : friend.pfpPhotoUrl ? (
                        <img src={friend.pfpPhotoUrl} alt={friend.username} loading="lazy" />
                      ) : (
                        friend.username.charAt(0).toUpperCase()
                      )}
                    </div>
                    <div className="friend-info">
                      <strong>{friend.username}</strong>
                      <span className="friend-info-stat-line">{counts.movies} Movies</span>
                      <span className="friend-info-stat-line">{counts.shows} Shows</span>
                    </div>
                    <Eye size={16} className="view-icon" />
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        {loggedIn && friends.length === 0 && receivedRequests.length === 0 && !searchQuery && (
          <div className="empty-state">
            <UserPlus size={48} />
            <h3>No friends yet</h3>
            <p>Search for people by username to start connecting!</p>
          </div>
        )}

        {!loggedIn && !searchQuery && searchResults.length === 0 && (
          <div className="empty-state">
            <Search size={48} />
            <h3>Find someone</h3>
            <p>Search by username to open a public profile.</p>
          </div>
        )}
      </div>
    </div>
  );
}
