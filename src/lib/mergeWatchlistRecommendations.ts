import type { WatchlistEntry } from '../state/watchlistStore';

export type IncomingWatchRecommendation = {
  fromUid: string;
  fromUsername: string;
  toUid: string;
  mediaId: string;
  listType: 'movies' | 'tv';
  title: string;
  posterPath?: string;
  releaseDate?: string;
  createdAt: string;
};

function dedupeRecommenders(list: { uid: string; username?: string }[]): { uid: string; username?: string }[] {
  const seen = new Set<string>();
  const out: { uid: string; username?: string }[] = [];
  for (const r of list) {
    if (seen.has(r.uid)) continue;
    seen.add(r.uid);
    out.push(r);
  }
  return out;
}

/**
 * Reconciles local watchlist rows with active incoming recommendation docs.
 * `recommendedBy` is derived only from incoming docs (not edited manually).
 */
export function mergeWatchlistWithIncoming(
  movies: WatchlistEntry[],
  tv: WatchlistEntry[],
  incoming: IncomingWatchRecommendation[]
): { movies: WatchlistEntry[]; tv: WatchlistEntry[] } {
  type Agg = {
    listType: 'movies' | 'tv';
    recommenders: { uid: string; username?: string }[];
    title: string;
    posterPath?: string;
    releaseDate?: string;
  };

  const byMedia = new Map<string, Agg>();

  for (const r of incoming) {
    const rec = { uid: r.fromUid, username: r.fromUsername };
    const cur = byMedia.get(r.mediaId);
    if (!cur) {
      byMedia.set(r.mediaId, {
        listType: r.listType,
        recommenders: [rec],
        title: r.title,
        posterPath: r.posterPath,
        releaseDate: r.releaseDate
      });
    } else {
      if (!cur.recommenders.some((x) => x.uid === r.fromUid)) {
        cur.recommenders.push(rec);
      }
    }
  }

  function syncList(list: WatchlistEntry[], listType: 'movies' | 'tv'): WatchlistEntry[] {
    const idsInList = new Set(list.map((e) => e.id));

    const out: WatchlistEntry[] = list.map((entry) => {
      const agg = byMedia.get(entry.id);
      if (!agg || agg.listType !== listType) {
        const { recommendedBy: _r, ...rest } = entry;
        return rest;
      }
      return {
        ...entry,
        recommendedBy: dedupeRecommenders(agg.recommenders)
      };
    });

    for (const [mediaId, agg] of byMedia) {
      if (agg.listType !== listType) continue;
      if (idsInList.has(mediaId)) continue;
      out.push({
        id: mediaId,
        title: agg.title,
        posterPath: agg.posterPath,
        releaseDate: agg.releaseDate,
        recommendedBy: dedupeRecommenders(agg.recommenders)
      });
    }

    return out;
  }

  return {
    movies: syncList(movies, 'movies'),
    tv: syncList(tv, 'tv')
  };
}
