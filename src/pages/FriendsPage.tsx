import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Search, UserPlus, Check, X, Eye, Loader, RefreshCw } from 'lucide-react';
import { collection, query, where, getDocs, doc, setDoc, deleteDoc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Link } from 'react-router-dom';
import './FriendsPage.css';

interface UserProfile {
  uid: string;
  username: string;
  email: string;
  createdAt: string;
}

interface FriendRequest {
  id: string;
  from: string;
  to: string;
  fromUsername: string;
  createdAt: string;
}

interface Friend {
  uid: string;
  username: string;
  email: string;
  addedAt: string;
}

export function FriendsPage() {
  const { user, username } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UserProfile[]>([]);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [sentRequests, setSentRequests] = useState<string[]>([]);
  const [receivedRequests, setReceivedRequests] = useState<FriendRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Load friends and requests
  const loadData = async () => {
    if (!user || !db) return;
    
    try {
      // Debug: Check if user exists in users collection
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      console.log('Current user in users collection:', userDoc.exists());
      if (userDoc.exists()) {
        console.log('User data:', userDoc.data());
      }
      
      // Debug: Check total users in database
      const allUsersQuery = query(collection(db, 'users'));
      const allUsersSnapshot = await getDocs(allUsersQuery);
      console.log('Total users in database:', allUsersSnapshot.size);
      
      // Load friends
      const friendsQuery = query(
        collection(db!, 'friends'),
        where('userId', '==', user.uid)
      );
      const friendsSnapshot = await getDocs(friendsQuery);
      const friendsData = friendsSnapshot.docs.map(doc => ({
        uid: doc.data().friendUid,
        username: doc.data().friendUsername,
        email: doc.data().friendEmail,
        addedAt: doc.data().addedAt
      }));
      setFriends(friendsData);

      // Load sent requests
      const sentRequestsQuery = query(
        collection(db!, 'friendRequests'),
        where('from', '==', user.uid)
      );
      const sentRequestsSnapshot = await getDocs(sentRequestsQuery);
      const sentToUids = sentRequestsSnapshot.docs.map(doc => doc.data().to);
      setSentRequests(sentToUids);

      // Load received requests
      const receivedRequestsQuery = query(
        collection(db!, 'friendRequests'),
        where('to', '==', user.uid)
      );
      const receivedRequestsSnapshot = await getDocs(receivedRequestsQuery);
      const requestsData = receivedRequestsSnapshot.docs.map(doc => ({
        id: doc.id,
        from: doc.data().from,
        to: doc.data().to,
        fromUsername: doc.data().fromUsername,
        createdAt: doc.data().createdAt
      }));
      setReceivedRequests(requestsData);
    } catch (error) {
      console.error('Error loading friends data:', error);
    }
  };

  useEffect(() => {
    if (!user || !db) return;

    loadData();

    // Set up periodic refresh instead of real-time listeners to avoid Firestore issues
    const interval = setInterval(loadData, 30000); // Refresh every 30 seconds

    return () => clearInterval(interval);
  }, [user, db]);

  // Search users
  useEffect(() => {
    if (!searchQuery.trim() || !db) {
      setSearchResults([]);
      return;
    }

    const searchUsers = async () => {
      setSearchLoading(true);
      try {
        // Use a simpler approach - get all users and filter client-side
        const usersQuery = query(collection(db!, 'users'));
        const snapshot = await getDocs(usersQuery);
        
        const users = snapshot.docs
          .map(doc => ({
            uid: doc.id,
            username: doc.data().username,
            email: doc.data().email,
            createdAt: doc.data().createdAt
          }))
          .filter(u => u.uid !== user?.uid)
          .filter(u => u.username.toLowerCase().includes(searchQuery.toLowerCase()));
        
        setSearchResults(users);
      } catch (error) {
        console.error('Error searching users:', error);
      } finally {
        setSearchLoading(false);
      }
    };

    const timeoutId = setTimeout(searchUsers, 300);
    return () => clearTimeout(timeoutId);
  }, [searchQuery, user, db]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const sendFriendRequest = async (targetUser: UserProfile) => {
    if (!user || !db) return;
    
    setLoading(true);
    try {
      await setDoc(doc(collection(db!, 'friendRequests')), {
        from: user.uid,
        to: targetUser.uid,
        fromUsername: username,
        createdAt: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error sending friend request:', error);
    } finally {
      setLoading(false);
    }
  };

  const acceptFriendRequest = async (request: FriendRequest) => {
    if (!user || !db) return;
    
    setLoading(true);
    try {
      // Get the requester's user data
      const requesterDoc = await getDocs(
        query(collection(db!, 'users'), where('username', '==', request.fromUsername))
      );
      const requesterData = requesterDoc.docs[0]?.data();
      
      if (requesterData) {
        // Add to both users' friends lists
        await setDoc(doc(db!, 'friends', `${user.uid}_${request.from}`), {
          userId: user.uid,
          friendUid: request.from,
          friendUsername: request.fromUsername,
          friendEmail: requesterData.email,
          addedAt: new Date().toISOString()
        });
        
        await setDoc(doc(db!, 'friends', `${request.from}_${user.uid}`), {
          userId: request.from,
          friendUid: user.uid,
          friendUsername: username,
          friendEmail: user.email,
          addedAt: new Date().toISOString()
        });
      }
      
      // Delete the request
      await deleteDoc(doc(db!, 'friendRequests', request.id));
      
      // Refresh data after accepting
      await loadData();
    } catch (error) {
      console.error('Error accepting friend request:', error);
    } finally {
      setLoading(false);
    }
  };

  const rejectFriendRequest = async (requestId: string) => {
    if (!db) return;
    
    setLoading(true);
    try {
      await deleteDoc(doc(db!, 'friendRequests', requestId));
      
      // Refresh data after rejecting
      await loadData();
    } catch (error) {
      console.error('Error rejecting friend request:', error);
    } finally {
      setLoading(false);
    }
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
