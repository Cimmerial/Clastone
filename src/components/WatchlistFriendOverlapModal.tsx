import { useEffect, useMemo } from 'react';
import type { WatchlistData } from '../lib/firestoreWatchlist';
import { lockBodyScroll, unlockBodyScroll } from '../lib/bodyScrollLock';
import type { FriendOverlapModeMap, FriendOverlapMode } from '../hooks/useWatchlistFriendOverlap';

export function WatchlistFriendOverlapModal({
  isOpen,
  friends,
  selectedModes,
  onClose,
  onSelectionChange,
  onCommit,
  isLoading,
  myMovieIds,
  myTvIds,
  friendWatchlists,
  friendWatchlistErrors,
  refreshingFriendUids,
  onFriendToggle,
}: {
  isOpen: boolean;
  friends: Array<{ uid: string; username: string }>;
  selectedModes: FriendOverlapModeMap;
  onClose: () => void;
  onSelectionChange: (modes: FriendOverlapModeMap) => void;
  onCommit: (modes: FriendOverlapModeMap) => void;
  isLoading: boolean;
  myMovieIds: string[];
  myTvIds: string[];
  friendWatchlists: Record<string, WatchlistData>;
  friendWatchlistErrors: Record<string, true | undefined>;
  refreshingFriendUids?: Record<string, true | undefined>;
  onFriendToggle?: (uid: string) => void;
}) {
  const selectedCount = useMemo(
    () => Object.values(selectedModes).filter((mode) => mode === 'overlap' || mode === 'boycott').length,
    [selectedModes]
  );

  useEffect(() => {
    if (!isOpen) return;
    lockBodyScroll();
    return () => {
      unlockBodyScroll();
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  const setMode = (uid: string, nextMode: FriendOverlapMode | undefined) => {
    const current = selectedModes[uid];
    const resolvedMode = current === nextMode ? undefined : nextMode;
    const next = { ...selectedModes, [uid]: resolvedMode };
    onSelectionChange(next);
    if (onFriendToggle) onFriendToggle(uid);
  };

  const sortedFriends = useMemo(() => {
    return [...friends].sort((a, b) => {
      const wlA = friendWatchlists[a.uid];
      const wlB = friendWatchlists[b.uid];
      const totalA = wlA ? wlA.movies.length + wlA.tv.length : -1;
      const totalB = wlB ? wlB.movies.length + wlB.tv.length : -1;
      if (totalA !== totalB) return totalB - totalA;
      return a.username.localeCompare(b.username);
    });
  }, [friends, friendWatchlists]);

  const preview = useMemo(() => {
    const activeEntries = Object.entries(selectedModes).filter(([, mode]) => mode === 'overlap' || mode === 'boycott');
    if (activeEntries.length === 0) {
      return { loading: false, unavailable: false, movies: myMovieIds.length, tv: myTvIds.length };
    }

    const hasError = activeEntries.some(([uid]) => friendWatchlistErrors[uid]);
    if (hasError) return { loading: false, unavailable: true, movies: 0, tv: 0 };

    const missing = activeEntries.some(([uid]) => !friendWatchlists[uid]);
    if (missing) return { loading: true, unavailable: false, movies: 0, tv: 0 };

    const movieSet = new Set<string>(myMovieIds);
    const tvSet = new Set<string>(myTvIds);

    for (const [uid, mode] of activeEntries) {
      const wl = friendWatchlists[uid];
      const friendMovieIds = new Set(wl.movies.map((m) => m.id));
      const friendTvIds = new Set(wl.tv.map((t) => t.id));

      if (mode === 'overlap') {
        for (const id of Array.from(movieSet)) {
          if (!friendMovieIds.has(id)) movieSet.delete(id);
        }
        for (const id of Array.from(tvSet)) {
          if (!friendTvIds.has(id)) tvSet.delete(id);
        }
      } else {
        for (const id of Array.from(movieSet)) {
          if (friendMovieIds.has(id)) movieSet.delete(id);
        }
        for (const id of Array.from(tvSet)) {
          if (friendTvIds.has(id)) tvSet.delete(id);
        }
      }
    }

    return {
      loading: false,
      unavailable: false,
      movies: movieSet.size,
      tv: tvSet.size,
    };
  }, [selectedModes, friendWatchlists, friendWatchlistErrors, myMovieIds, myTvIds]);

  if (!isOpen) return null;

  return (
    <div className="watchlist-overlap-backdrop">
      <div className="watchlist-overlap-modal">
        <div className="watchlist-overlap-modal-header">
          <div>
            <div className="watchlist-overlap-modal-title">View overlap with friends</div>
            <div className="watchlist-overlap-modal-subtitle">Toggle friends to keep their overlap fresh.</div>
          </div>
          <button type="button" className="watchlist-overlap-modal-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="watchlist-overlap-modal-body">
          <div className="watchlist-overlap-preview">
            <div className="watchlist-overlap-preview-row">
              <span className="watchlist-overlap-preview-label">Your watchlist</span>
              <span className="watchlist-overlap-preview-value">Movies {myMovieIds.length} · Shows {myTvIds.length}</span>
            </div>
            <div className="watchlist-overlap-preview-row">
              <span className="watchlist-overlap-preview-label">After overlap</span>
              <span className="watchlist-overlap-preview-value">
                {preview.loading
                  ? 'Loading…'
                  : preview.unavailable
                    ? 'Unavailable'
                    : `Movies ${preview.movies} · Shows ${preview.tv}`}
              </span>
            </div>
            <div className="watchlist-overlap-preview-row watchlist-overlap-preview-row--muted">
              <span className="watchlist-overlap-preview-label">Selected friends</span>
              <span className="watchlist-overlap-preview-value">{selectedCount}</span>
            </div>
          </div>

          {friends.length === 0 ? (
            <div className="watchlist-overlap-empty">You don&apos;t have any friends added yet.</div>
          ) : (
            <div className="watchlist-overlap-friends-list" role="list">
              {sortedFriends.map((f) => {
                const mode = selectedModes[f.uid];
                const overlapChecked = mode === 'overlap';
                const boycottChecked = mode === 'boycott';
                const wl = friendWatchlists[f.uid];
                const hasError = !!friendWatchlistErrors[f.uid];
                const isRefreshing = !!refreshingFriendUids?.[f.uid];
                const subLabel = hasError
                  ? 'Unavailable'
                  : wl
                    ? `Movies ${wl.movies.length} · Shows ${wl.tv.length}`
                    : 'Loading…';
                return (
                  <label
                    key={f.uid}
                    className={`watchlist-overlap-friend-row ${(overlapChecked || boycottChecked) ? 'watchlist-overlap-friend-row--checked' : ''}`}
                    role="listitem"
                  >
                    <div className="watchlist-overlap-friend-meta">
                      <div className="watchlist-overlap-friend-name">{f.username}</div>
                      <div className="watchlist-overlap-friend-sub">
                        {isRefreshing ? 'Refreshing…' : subLabel}
                      </div>
                    </div>
                    <div className="watchlist-overlap-friend-switches">
                      <label className="watchlist-overlap-switch watchlist-overlap-switch--labeled">
                        <input type="checkbox" checked={overlapChecked} onChange={() => setMode(f.uid, 'overlap')} />
                        <span className="watchlist-overlap-switch-track" />
                        <span className="watchlist-overlap-switch-label">Overlap</span>
                      </label>
                      <label className="watchlist-overlap-switch watchlist-overlap-switch--labeled">
                        <input type="checkbox" checked={boycottChecked} onChange={() => setMode(f.uid, 'boycott')} />
                        <span className="watchlist-overlap-switch-track" />
                        <span className="watchlist-overlap-switch-label">Boycott</span>
                      </label>
                    </div>
                  </label>
                );
              })}
            </div>
          )}
        </div>

        <div className="watchlist-overlap-modal-footer">
          <button type="button" className="watchlist-overlap-btn watchlist-overlap-btn--ghost" onClick={onClose} disabled={isLoading}>
            Cancel
          </button>
          <button
            type="button"
            className="watchlist-overlap-btn watchlist-overlap-btn--primary"
            onClick={() => onCommit(selectedModes)}
            disabled={isLoading}
            title={friends.length === 0 ? 'Add friends first' : undefined}
          >
            {isLoading ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
