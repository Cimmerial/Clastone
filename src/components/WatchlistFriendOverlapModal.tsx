import { useEffect, useMemo } from 'react';
import type { WatchlistData } from '../lib/firestoreWatchlist';

export function WatchlistFriendOverlapModal({
  isOpen,
  friends,
  selectedUids,
  onClose,
  onSelectionChange,
  onCommit,
  isLoading,
  myMovieIds,
  myTvIds,
  friendWatchlists,
  friendWatchlistErrors,
}: {
  isOpen: boolean;
  friends: Array<{ uid: string; username: string }>;
  selectedUids: string[];
  onClose: () => void;
  onSelectionChange: (uids: string[]) => void;
  onCommit: (uids: string[]) => void;
  isLoading: boolean;
  myMovieIds: string[];
  myTvIds: string[];
  friendWatchlists: Record<string, WatchlistData>;
  friendWatchlistErrors: Record<string, true | undefined>;
}) {
  const selected = useMemo(() => new Set(selectedUids), [selectedUids]);

  useEffect(() => {
    if (!isOpen) return;
    const orig = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = orig || 'unset';
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

  const toggleUid = (uid: string) => {
    const next = new Set(selected);
    if (next.has(uid)) next.delete(uid);
    else next.add(uid);
    onSelectionChange(Array.from(next));
  };

  const selectedArray = selectedUids;
  const selectedCount = selectedArray.length;

  const preview = useMemo(() => {
    if (selectedCount === 0) {
      return { loading: false, unavailable: false, movies: myMovieIds.length, tv: myTvIds.length };
    }

    const hasError = selectedArray.some((uid) => friendWatchlistErrors[uid]);
    if (hasError) return { loading: false, unavailable: true, movies: 0, tv: 0 };

    const missing = selectedArray.some((uid) => !friendWatchlists[uid]);
    if (missing) return { loading: true, unavailable: false, movies: 0, tv: 0 };

    const movieIntersection = new Set<string>(myMovieIds);
    const tvIntersection = new Set<string>(myTvIds);

    for (const uid of selectedArray) {
      const wl = friendWatchlists[uid];
      const friendMovieIds = new Set(wl.movies.map((m) => m.id));
      const friendTvIds = new Set(wl.tv.map((t) => t.id));

      for (const id of Array.from(movieIntersection)) {
        if (!friendMovieIds.has(id)) movieIntersection.delete(id);
      }
      for (const id of Array.from(tvIntersection)) {
        if (!friendTvIds.has(id)) tvIntersection.delete(id);
      }
    }

    return {
      loading: false,
      unavailable: false,
      movies: movieIntersection.size,
      tv: tvIntersection.size,
    };
  }, [selectedArray, selectedCount, friendWatchlists, friendWatchlistErrors, myMovieIds, myTvIds]);

  if (!isOpen) return null;

  return (
    <div className="watchlist-overlap-backdrop" onClick={onClose}>
      <div className="watchlist-overlap-modal" onClick={(e) => e.stopPropagation()}>
        <div className="watchlist-overlap-modal-header">
          <div className="watchlist-overlap-modal-title">View overlap with friends</div>
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
              {friends.map((f) => {
                const checked = selected.has(f.uid);
                return (
                  <label key={f.uid} className="watchlist-overlap-friend-row" role="listitem">
                    <input type="checkbox" checked={checked} onChange={() => toggleUid(f.uid)} />
                    <div className="watchlist-overlap-friend-meta">
                      <div className="watchlist-overlap-friend-name">{f.username}</div>
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
            onClick={() => onCommit(selectedArray)}
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
