import { useState, useEffect, useRef } from 'react';
import { useFriends } from '../context/FriendsContext';
import { Search, UserPlus, Check, X, Eye, Loader, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import './FriendsPage.css';

interface UserProfile {
  uid: string;
  username: string;
  email: string;
  createdAt: string;
}

export function FriendsPage() {
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
    isDataLoaded 
  } = useFriends();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UserProfile[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const searchTimeoutRef = useRef<NodeJS.Timeout>();

  // Search users with debouncing
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

  return (
    <div className="friends-page">
      <div className="friends-container">
        <header className="friends-header">
          <h1>Friends</h1>
          <div className="friends-header-actions">
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="refresh-btn"
              title="Refresh friends list"
            >
              <RefreshCw size={18} className={refreshing ? 'spinning' : ''} />
            </button>
          </div>
          <p>Connect and share your movie rankings</p>
        </header>

        {/* Friend Requests */}
        {receivedRequests.length > 0 && (
          <section className="friend-requests">
            <h2>Friend Requests</h2>
            <div className="requests-list">
              {receivedRequests.map(request => (
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

        {/* Search */}
        <section className="search-section">
          <h2>Find Friends</h2>
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

        {/* Search Results */}
        {searchResults.length > 0 && (
          <section className="search-results">
            <h3>Search Results</h3>
            <div className="results-list">
              {searchResults.map(result => {
                const isFriend = friends.some(f => f.uid === result.uid);
                const requestSent = sentRequests.includes(result.uid);
                
                return (
                  <div key={result.uid} className="result-item">
                    <div className="user-info">
                      <div className="user-avatar">
                        {result.username.charAt(0).toUpperCase()}
                      </div>
                      <div className="user-details">
                        <strong>{result.username}</strong>
                        <span>{result.email}</span>
                      </div>
                    </div>
                    <div className="user-actions">
                      {isFriend ? (
                        <Link to={`/friends/${result.uid}`} className="view-profile-btn">
                          <Eye size={16} />
                          View Profile
                        </Link>
                      ) : requestSent ? (
                        <button disabled className="request-sent-btn">
                          <Check size={16} />
                          Request Sent
                        </button>
                      ) : (
                        <button
                          onClick={() => sendFriendRequest(result)}
                          disabled={loading}
                          className="add-friend-btn"
                        >
                          <UserPlus size={16} />
                          Add Friend
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Friends List */}
        {friends.length > 0 && (
          <section className="friends-list">
            <h2>Your Friends ({friends.length})</h2>
            <div className="friends-grid">
              {friends.map(friend => (
                <Link
                  key={friend.uid}
                  to={`/friends/${friend.uid}`}
                  className="friend-card"
                >
                  <div className="friend-avatar">
                    {friend.username.charAt(0).toUpperCase()}
                  </div>
                  <div className="friend-info">
                    <strong>{friend.username}</strong>
                    <span>View profile</span>
                  </div>
                  <Eye size={16} className="view-icon" />
                </Link>
              ))}
            </div>
          </section>
        )}

        {friends.length === 0 && receivedRequests.length === 0 && !searchQuery && (
          <div className="empty-state">
            <UserPlus size={48} />
            <h3>No friends yet</h3>
            <p>Search for users by username to start connecting!</p>
          </div>
        )}
      </div>
    </div>
  );
}
