import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useFriends } from '../context/FriendsContext';
import { lockBodyScroll, unlockBodyScroll } from '../lib/bodyScrollLock';
import { db } from '../lib/firebase';
import { loadWatchlist } from '../lib/firestoreWatchlist';
import {
  getWatchRecommendationExists,
  removeWatchRecommendation,
  setWatchRecommendation,
  WATCH_RECOMMEND_DEBUG,
  logWatchRecommendFirestoreDebug
} from '../lib/firestoreWatchRecommendations';
import { friendHasSeenMedia } from '../lib/friendMediaSeen';
import './RecommendToFriendModal.css';

export type RecommendToFriendTarget = {
  id: string;
  title: string;
  posterPath?: string;
  releaseDate?: string;
  mediaType: 'movie' | 'tv';
};

type FriendRow = {
  uid: string;
  username: string;
  onTheirWatchlist: boolean;
  hasSeen: boolean;
  recommended: boolean;
  busy: boolean;
};

type Props = {
  isOpen: boolean;
  target: RecommendToFriendTarget | null;
  onClose: () => void;
};

export function formatRecommendersLabel(by: { uid: string; username?: string }[]): string {
  if (!by.length) return '';
  return by.map((r) => r.username || 'Friend').join(', ');
}

export function RecommendToFriendModal({ isOpen, target, onClose }: Props) {
  const { user, username: myUsername } = useAuth();
  const { friends } = useFriends();
  const [rows, setRows] = useState<FriendRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingList, setLoadingList] = useState(false);

  const listType = target?.mediaType === 'movie' ? 'movies' : 'tv';
  const mediaKind = target?.mediaType === 'movie' ? 'movie' : 'tv';

  const refreshRows = useCallback(async () => {
    if (!isOpen || !target || !db || !user || friends.length === 0) {
      setRows([]);
      return;
    }
    setLoadingList(true);
    setLoadError(null);
    try {
      const next = await Promise.all(
        friends.map(async (f) => {
          const [wl, seen, rec] = await Promise.all([
            loadWatchlist(db!, f.uid),
            friendHasSeenMedia(db!, f.uid, target.id, mediaKind),
            getWatchRecommendationExists(db!, user.uid, f.uid, target.id)
          ]);
          const onTheirWatchlist =
            listType === 'movies'
              ? wl.movies.some((m) => m.id === target.id)
              : wl.tv.some((t) => t.id === target.id);
          return {
            uid: f.uid,
            username: f.username,
            onTheirWatchlist,
            hasSeen: seen,
            recommended: rec,
            busy: false
          } satisfies FriendRow;
        })
      );
      setRows(next);
    } catch (e: unknown) {
      const err = e as { code?: string; message?: string };
      console.error(WATCH_RECOMMEND_DEBUG, 'refreshRows:failed', {
        targetId: target.id,
        friendCount: friends.length,
        authUid: user?.uid,
        code: err?.code,
        message: err?.message
      });
      setLoadError(e instanceof Error ? e.message : 'Could not load friends');
      setRows([]);
    } finally {
      setLoadingList(false);
    }
  }, [isOpen, target, user, friends, listType, mediaKind]);

  useEffect(() => {
    if (!isOpen) return;
    void refreshRows();
  }, [isOpen, refreshRows]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    lockBodyScroll();
    return () => {
      unlockBodyScroll();
    };
  }, [isOpen]);

  const sortedRows = useMemo(() => {
    const copy = [...rows];
    const isTop = (r: FriendRow) => !r.hasSeen || !r.recommended;
    copy.sort((a, b) => {
      const ta = isTop(a) ? 0 : 1;
      const tb = isTop(b) ? 0 : 1;
      if (ta !== tb) return ta - tb;
      return a.username.localeCompare(b.username, undefined, { sensitivity: 'base' });
    });
    return copy;
  }, [rows]);

  const toggleRecommend = async (friendUid: string, next: boolean) => {
    if (!db || !user || !target) return;
    setRows((prev) =>
      prev.map((r) => (r.uid === friendUid ? { ...r, busy: true } : r))
    );
    try {
      const fromUsername = myUsername?.trim() || user.email || 'Friend';
      if (next) {
        await setWatchRecommendation(db, {
          fromUid: user.uid,
          fromUsername,
          toUid: friendUid,
          mediaId: target.id,
          listType,
          title: target.title,
          posterPath: target.posterPath,
          releaseDate: target.releaseDate
        });
      } else {
        await removeWatchRecommendation(db, user.uid, friendUid, target.id);
      }
      const rec = await getWatchRecommendationExists(db, user.uid, friendUid, target.id);
      setRows((prev) =>
        prev.map((r) => (r.uid === friendUid ? { ...r, recommended: rec, busy: false } : r))
      );
    } catch (e: unknown) {
      const err = e as { code?: string; message?: string };
      console.error(WATCH_RECOMMEND_DEBUG, 'toggleRecommend:failed', {
        friendUid,
        next,
        targetId: target.id,
        authUid: user.uid,
        code: err?.code,
        message: err?.message
      });
      if (db && err?.code === 'permission-denied') {
        void logWatchRecommendFirestoreDebug(db, 'toggleRecommend:permissionDenied', {
          fromUid: user.uid,
          toUid: friendUid,
          mediaId: target.id
        });
      }
      setRows((prev) =>
        prev.map((r) => (r.uid === friendUid ? { ...r, busy: false } : r))
      );
    }
  };

  if (!isOpen || !target) return null;

  const portal = typeof document !== 'undefined' ? document.body : null;
  if (!portal) return null;

  return createPortal(
    <div className="rtf-backdrop" role="presentation" onClick={onClose}>
      <div className="rtf-modal" role="dialog" aria-labelledby="rtf-title" onClick={(e) => e.stopPropagation()}>
        <div className="rtf-header">
          <div>
            <h2 id="rtf-title" className="rtf-title">
              Recommend to a friend
            </h2>
            <p className="rtf-subtitle">{target.title}</p>
          </div>
          <button type="button" className="rtf-close" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="rtf-body">
          {friends.length === 0 ? (
            <p className="rtf-empty">Add friends first to recommend titles.</p>
          ) : loadingList ? (
            <p className="rtf-muted">Loading…</p>
          ) : loadError ? (
            <p className="rtf-error">{loadError}</p>
          ) : (
            <>
              <p className="rtf-hint">
                Toggle on to add this to their watchlist (they can still remove it). Friends who have already
                watched it and received your recommendation are listed below others.
              </p>
              <ul className="rtf-friend-list">
                {sortedRows.map((r) => {
                  const topGroup = !r.hasSeen || !r.recommended;
                  return (
                    <li key={r.uid} className={`rtf-friend-row ${topGroup ? 'rtf-friend-row--primary' : ''}`}>
                      <div className="rtf-friend-bubble">
                        <div className="rtf-friend-meta">
                          <span className="rtf-friend-name">{r.username}</span>
                          <span className="rtf-friend-tags">
                            {r.onTheirWatchlist ? (
                              <span className="rtf-tag rtf-tag--watchlist">On their watchlist</span>
                            ) : (
                              <span className="rtf-tag">Not on watchlist</span>
                            )}
                            {r.hasSeen ? <span className="rtf-tag rtf-tag--seen">Already watched</span> : null}
                          </span>
                        </div>
                        <label className="rtf-toggle">
                          <input
                            type="checkbox"
                            checked={r.recommended}
                            disabled={r.busy}
                            onChange={(e) => void toggleRecommend(r.uid, e.target.checked)}
                          />
                          <span className="rtf-toggle-ui" aria-hidden />
                          <span className="rtf-toggle-label">{r.recommended ? 'Recommended' : 'Recommend'}</span>
                        </label>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      </div>
    </div>,
    portal
  );
}
