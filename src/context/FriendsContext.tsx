import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { collection, query, where, getDocs, doc, setDoc, deleteDoc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { rankByFuzzyUsernameMatch } from '../lib/fuzzySearch';

interface Friend {
  uid: string;
  username: string;
  email: string;
  addedAt: string;
  pfpPosterPath?: string;
  pfpPhotoUrl?: string;
}

interface FriendRequest {
  id: string;
  from: string;
  to: string;
  fromUsername: string;
  createdAt: string;
}

export interface UserProfile {
  uid: string;
  username: string;
  email: string;
  createdAt: string;
  pfpPosterPath?: string;
  pfpPhotoUrl?: string;
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
  unfriend: (friendUid: string) => Promise<void>;
  searchUsers: (query: string) => Promise<UserProfile[]>;
  isDataLoaded: boolean;
}

const FriendsContext = createContext<FriendsContextType | null>(null);

function upsertUniqueFriend(list: Friend[], next: Friend): Friend[] {
  const idx = list.findIndex((f) => f.uid === next.uid);
  if (idx === -1) return [...list, next];
  const copy = [...list];
  copy[idx] = {
    ...copy[idx],
    ...next,
    // Keep older timestamp if next is missing; otherwise update.
    addedAt: next.addedAt || copy[idx].addedAt,
  };
  return copy;
}

function dedupeFriendsByUid(list: Friend[]): Friend[] {
  const byUid = new Map<string, Friend>();
  for (const entry of list) {
    const existing = byUid.get(entry.uid);
    if (!existing) {
      byUid.set(entry.uid, entry);
      continue;
    }
    // Prefer the latest addedAt if both exist.
    const existingTs = Date.parse(existing.addedAt || '') || 0;
    const entryTs = Date.parse(entry.addedAt || '') || 0;
    byUid.set(entry.uid, entryTs >= existingTs ? { ...existing, ...entry } : existing);
  }
  return Array.from(byUid.values());
}

function dedupeStrings(values: string[]): string[] {
  return Array.from(new Set(values));
}

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
      const friendsData = dedupeFriendsByUid(
        friendsSnapshot.docs.map(doc => ({
          uid: doc.data().friendUid,
          username: doc.data().friendUsername,
          email: doc.data().friendEmail,
          addedAt: doc.data().addedAt,
          pfpPosterPath: doc.data().friendPfpPosterPath,
          pfpPhotoUrl: doc.data().friendPfpPhotoUrl
        }))
      );
      const enrichedFriends = await Promise.all(
        friendsData.map(async (friend) => {
          try {
            const userSnap = await getDoc(doc(db!, 'users', friend.uid));
            const userData = userSnap.data();
            const pfpPosterPath = typeof userData?.pfpPosterPath === 'string' ? userData.pfpPosterPath : undefined;
            const pfpPhotoUrl = typeof userData?.pfpPhotoUrl === 'string' ? userData.pfpPhotoUrl : undefined;
            return { ...friend, pfpPosterPath, pfpPhotoUrl };
          } catch {
            return friend;
          }
        })
      );
      setFriends(dedupeFriendsByUid(enrichedFriends));

      // Load sent requests
      const sentRequestsQuery = query(
        collection(db!, 'friendRequests'),
        where('from', '==', user.uid)
      );
      const sentRequestsSnapshot = await getDocs(sentRequestsQuery);
      const sentToUids = dedupeStrings(sentRequestsSnapshot.docs.map(doc => doc.data().to));
      const friendUidSet = new Set(friendsData.map((f) => f.uid));
      setSentRequests(sentToUids.filter((uid) => !friendUidSet.has(uid)));

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
      const latestBySender = new Map<string, FriendRequest>();
      for (const req of requestsData) {
        if (friendUidSet.has(req.from)) continue;
        const existing = latestBySender.get(req.from);
        const existingTs = Date.parse(existing?.createdAt || '') || 0;
        const reqTs = Date.parse(req.createdAt || '') || 0;
        if (!existing || reqTs >= existingTs) latestBySender.set(req.from, req);
      }
      setReceivedRequests(Array.from(latestBySender.values()));
      
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
      const myFriendDocId = `${user.uid}_${targetUser.uid}`;
      const theirFriendDocId = `${targetUser.uid}_${user.uid}`;
      const nowIso = new Date().toISOString();

      // If already friends, do nothing and clean stale local pending state.
      const [myFriendDoc, theirFriendDoc] = await Promise.all([
        getDoc(doc(db!, 'friends', myFriendDocId)),
        getDoc(doc(db!, 'friends', theirFriendDocId)),
      ]);
      if (myFriendDoc.exists() || theirFriendDoc.exists()) {
        setSentRequests(prev => prev.filter((uid) => uid !== targetUser.uid));
        return;
      }

      // If they already sent me a request, auto-friend both sides.
      const reverseRequestQuery = query(
        collection(db!, 'friendRequests'),
        where('from', '==', targetUser.uid),
        where('to', '==', user.uid)
      );
      const reverseRequestSnapshot = await getDocs(reverseRequestQuery);
      if (!reverseRequestSnapshot.empty) {
        const myUserSnap = await getDoc(doc(db!, 'users', user.uid));
        const myUserData = myUserSnap.data();
        const myPoster = typeof myUserData?.pfpPosterPath === 'string' ? myUserData.pfpPosterPath : null;
        const myPhoto = typeof myUserData?.pfpPhotoUrl === 'string' ? myUserData.pfpPhotoUrl : null;

        await Promise.all([
          setDoc(doc(db!, 'friends', myFriendDocId), {
            userId: user.uid,
            friendUid: targetUser.uid,
            friendUsername: targetUser.username,
            friendEmail: targetUser.email,
            friendPfpPosterPath: targetUser.pfpPosterPath ?? null,
            friendPfpPhotoUrl: targetUser.pfpPhotoUrl ?? null,
            addedAt: nowIso
          }),
          setDoc(doc(db!, 'friends', theirFriendDocId), {
            userId: targetUser.uid,
            friendUid: user.uid,
            friendUsername: username,
            friendEmail: user.email,
            friendPfpPosterPath: myPoster,
            friendPfpPhotoUrl: myPhoto,
            addedAt: nowIso
          }),
          ...reverseRequestSnapshot.docs.map((d) => deleteDoc(doc(db!, 'friendRequests', d.id))),
        ]);

        setFriends(prev => dedupeFriendsByUid(upsertUniqueFriend(prev, {
          uid: targetUser.uid,
          username: targetUser.username,
          email: targetUser.email,
          pfpPosterPath: targetUser.pfpPosterPath,
          pfpPhotoUrl: targetUser.pfpPhotoUrl,
          addedAt: nowIso
        })));
        setReceivedRequests(prev => prev.filter((r) => r.from !== targetUser.uid));
        setSentRequests(prev => prev.filter((uid) => uid !== targetUser.uid));
        return;
      }

      // Avoid duplicate outgoing requests.
      const existingRequestQuery = query(
        collection(db!, 'friendRequests'),
        where('from', '==', user.uid),
        where('to', '==', targetUser.uid)
      );
      const existingRequestSnapshot = await getDocs(existingRequestQuery);
      if (existingRequestSnapshot.empty) {
        await setDoc(doc(collection(db!, 'friendRequests')), {
          from: user.uid,
          to: targetUser.uid,
          fromUsername: username,
          createdAt: nowIso
        });
      }
      
      // Update local state
      setSentRequests(prev => dedupeStrings([...prev, targetUser.uid]));
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
      // Get the requester's user data by UID (safer than username).
      const requesterSnap = await getDoc(doc(db!, 'users', request.from));
      const requesterData = requesterSnap.data();
      const nowIso = new Date().toISOString();
      const myUserSnap = await getDoc(doc(db!, 'users', user.uid));
      const myUserData = myUserSnap.data();
      
      if (requesterData) {
        // Add to both users' friends lists
        await setDoc(doc(db!, 'friends', `${user.uid}_${request.from}`), {
          userId: user.uid,
          friendUid: request.from,
          friendUsername: requesterData.username ?? request.fromUsername,
          friendEmail: requesterData.email,
          friendPfpPosterPath: requesterData.pfpPosterPath ?? null,
          friendPfpPhotoUrl: requesterData.pfpPhotoUrl ?? null,
          addedAt: nowIso
        });
        
        await setDoc(doc(db!, 'friends', `${request.from}_${user.uid}`), {
          userId: request.from,
          friendUid: user.uid,
          friendUsername: username,
          friendEmail: user.email,
          friendPfpPosterPath: myUserData?.pfpPosterPath ?? null,
          friendPfpPhotoUrl: myUserData?.pfpPhotoUrl ?? null,
          addedAt: nowIso
        });
        
        // Update local state
        setFriends(prev => dedupeFriendsByUid(upsertUniqueFriend(prev, {
          uid: request.from,
          username: requesterData.username ?? request.fromUsername,
          email: requesterData.email,
          pfpPosterPath: requesterData.pfpPosterPath ?? undefined,
          pfpPhotoUrl: requesterData.pfpPhotoUrl ?? undefined,
          addedAt: nowIso
        })));
      }
      
      // Delete this request and any duplicate reciprocal/outgoing request docs.
      await deleteDoc(doc(db!, 'friendRequests', request.id));
      const duplicateIncomingQuery = query(
        collection(db!, 'friendRequests'),
        where('from', '==', request.from),
        where('to', '==', user.uid)
      );
      const outgoingMirrorQuery = query(
        collection(db!, 'friendRequests'),
        where('from', '==', user.uid),
        where('to', '==', request.from)
      );
      const [dupIncomingSnap, outgoingMirrorSnap] = await Promise.all([
        getDocs(duplicateIncomingQuery),
        getDocs(outgoingMirrorQuery),
      ]);
      await Promise.all([
        ...dupIncomingSnap.docs.map((d) => deleteDoc(doc(db!, 'friendRequests', d.id))),
        ...outgoingMirrorSnap.docs.map((d) => deleteDoc(doc(db!, 'friendRequests', d.id))),
      ]);
      
      // Update local state
      setReceivedRequests(prev => prev.filter(r => r.id !== request.id && r.from !== request.from));
      setSentRequests(prev => prev.filter((uid) => uid !== request.from));
    } catch (error) {
      console.error('Error accepting friend request:', error);
    } finally {
      setLoading(false);
    }
  }, [user, db, username]);

  const rejectFriendRequest = useCallback(async (requestId: string) => {
    if (!user || !db) return;

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
    if (!searchQuery.trim() || !db) return [];

    try {
      const usersQuery = query(collection(db!, 'users'));
      const snapshot = await getDocs(usersQuery);

      const users = snapshot.docs
        .map((d) => ({
          uid: d.id,
          username: d.data().username,
          email: d.data().email,
          createdAt: d.data().createdAt,
          pfpPosterPath: d.data().pfpPosterPath,
          pfpPhotoUrl: d.data().pfpPhotoUrl
        }))
        .filter((u) => (user ? u.uid !== user.uid : true));
      return rankByFuzzyUsernameMatch(users, searchQuery);
    } catch (error: any) {
      console.error('Error searching users:', error);
      if (error?.code === 'permission-denied') {
        console.warn(
          '[Clastone] People search permission-denied: deploy firestore.rules. ' +
            'Unfiltered /users list requires every user doc to pass userProfileDocPublicSafe() (no top-level fields named password, hash, salt).'
        );
      }
      return [];
    }
  }, [db, user]);

  const unfriend = useCallback(async (friendUid: string) => {
    if (!user || !db) return;
    
    setLoading(true);
    try {
      // Delete both friendship records
      await deleteDoc(doc(db!, 'friends', `${user.uid}_${friendUid}`));
      await deleteDoc(doc(db!, 'friends', `${friendUid}_${user.uid}`));
      
      // Update local state
      setFriends(prev => prev.filter(f => f.uid !== friendUid));
    } catch (error) {
      console.error('Error unfriending:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, [user, db]);

  const value: FriendsContextType = {
    friends,
    sentRequests,
    receivedRequests,
    loading,
    refreshFriends,
    sendFriendRequest,
    acceptFriendRequest,
    rejectFriendRequest,
    unfriend,
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
