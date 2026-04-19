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
  const [cachedOrderByUid, setCachedOrderByUid] = useState<Record<string, number>>({});
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
    return [...friends].sort((a, b) => {
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
            return [friend.uid, { movies, shows }] as const;
          } catch {
            return [friend.uid, { movies: 0, shows: 0 }] as const;
          }
        })
      );
      if (cancelled) return;
      const nextCounts = Object.fromEntries(results);
      setFriendCountsByUid(nextCounts);
      if (cacheKeyBase) {
        try {
          localStorage.setItem(`${cacheKeyBase}:counts`, JSON.stringify(nextCounts));
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
            <h2>Your friends ({friends.length})</h2>
            <div className="friends-grid">
              {sortedFriends.map((friend) => {
                const counts = friendCountsByUid[friend.uid] ?? { movies: 0, shows: 0 };
                const countParts: string[] = [];
                if (counts.movies > 1) countParts.push(`${counts.movies} Movies`);
                if (counts.shows > 1) countParts.push(`${counts.shows} Shows`);
                const subtitle = countParts.length > 0 ? countParts.join(' - ') : 'View profile';
                return (
                  <Link key={friend.uid} to={`/friends/${friend.uid}`} className="friend-card">
                    <div className="friend-avatar">
                      {friend.pfpPosterPath ? (
                        <img src={tmdbImagePath(friend.pfpPosterPath, 'w92') ?? ''} alt={friend.username} loading="lazy" />
                      ) : (
                        friend.username.charAt(0).toUpperCase()
                      )}
                    </div>
                    <div className="friend-info">
                      <strong>{friend.username}</strong>
                      <span>{subtitle}</span>
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
