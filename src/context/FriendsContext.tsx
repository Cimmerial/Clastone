import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { collection, query, where, getDocs, doc, setDoc, deleteDoc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';

interface Friend {
  uid: string;
  username: string;
  email: string;
  addedAt: string;
}

interface FriendRequest {
  id: string;
  from: string;
  to: string;
  fromUsername: string;
  createdAt: string;
}

interface UserProfile {
  uid: string;
  username: string;
  email: string;
  createdAt: string;
}

interface FriendsContextType {
  friends: Friend[];
  sentRequests: string[];
  receivedRequests: FriendRequest[];
  loading: boolean;
  refreshFriends: () => Promise<void>;
  sendFriendRequest: (targetUser: UserProfile) => Promise<void>;
  acceptFriendRequest: (request: FriendRequest) => Promise<void>;
  rejectFriendRequest: (requestId: string) => Promise<void>;
  searchUsers: (query: string) => Promise<UserProfile[]>;
  isDataLoaded: boolean;
}

const FriendsContext = createContext<FriendsContextType | null>(null);

export function FriendsProvider({ children }: { children: React.ReactNode }) {
  const { user, username } = useAuth();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [sentRequests, setSentRequests] = useState<string[]>([]);
  const [receivedRequests, setReceivedRequests] = useState<FriendRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [isDataLoaded, setIsDataLoaded] = useState(false);

  const loadFriendsData = useCallback(async () => {
    if (!user || !db) return;
    
    setLoading(true);
    try {
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
      
      setIsDataLoaded(true);
    } catch (error) {
      console.error('Error loading friends data:', error);
    } finally {
      setLoading(false);
    }
  }, [user, db]);

  // Load data once when user changes
  useEffect(() => {
    if (user && db) {
      loadFriendsData();
    } else {
      // Clear data when user logs out
      setFriends([]);
      setSentRequests([]);
      setReceivedRequests([]);
      setIsDataLoaded(false);
    }
  }, [user, db, loadFriendsData]);

  const refreshFriends = useCallback(async () => {
    await loadFriendsData();
  }, [loadFriendsData]);

  const sendFriendRequest = useCallback(async (targetUser: UserProfile) => {
    if (!user || !db) return;
    
    setLoading(true);
    try {
      await setDoc(doc(collection(db!, 'friendRequests')), {
        from: user.uid,
        to: targetUser.uid,
        fromUsername: username,
        createdAt: new Date().toISOString()
      });
      
      // Update local state
      setSentRequests(prev => [...prev, targetUser.uid]);
    } catch (error) {
      console.error('Error sending friend request:', error);
    } finally {
      setLoading(false);
    }
  }, [user, db, username]);

  const acceptFriendRequest = useCallback(async (request: FriendRequest) => {
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
        
        // Update local state
        setFriends(prev => [...prev, {
          uid: request.from,
          username: request.fromUsername,
          email: requesterData.email,
          addedAt: new Date().toISOString()
        }]);
      }
      
      // Delete the request
      await deleteDoc(doc(db!, 'friendRequests', request.id));
      
      // Update local state
      setReceivedRequests(prev => prev.filter(r => r.id !== request.id));
    } catch (error) {
      console.error('Error accepting friend request:', error);
    } finally {
      setLoading(false);
    }
  }, [user, db, username]);

  const rejectFriendRequest = useCallback(async (requestId: string) => {
    if (!db) return;
    
    setLoading(true);
    try {
      await deleteDoc(doc(db!, 'friendRequests', requestId));
      
      // Update local state
      setReceivedRequests(prev => prev.filter(r => r.id !== requestId));
    } catch (error) {
      console.error('Error rejecting friend request:', error);
    } finally {
      setLoading(false);
    }
  }, [db]);

  const searchUsers = useCallback(async (searchQuery: string): Promise<UserProfile[]> => {
    if (!searchQuery.trim() || !db || !user) return [];

    try {
      const usersQuery = query(collection(db!, 'users'));
      const snapshot = await getDocs(usersQuery);
      
      return snapshot.docs
        .map(doc => ({
          uid: doc.id,
          username: doc.data().username,
          email: doc.data().email,
          createdAt: doc.data().createdAt
        }))
        .filter(u => u.uid !== user.uid)
        .filter(u => u.username.toLowerCase().includes(searchQuery.toLowerCase()));
    } catch (error) {
      console.error('Error searching users:', error);
      return [];
    }
  }, [db, user]);

  const value: FriendsContextType = {
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
  };

  return (
    <FriendsContext.Provider value={value}>
      {children}
    </FriendsContext.Provider>
  );
}

export function useFriends() {
  const ctx = useContext(FriendsContext);
  if (!ctx) throw new Error('useFriends must be used within FriendsProvider');
  return ctx;
}
