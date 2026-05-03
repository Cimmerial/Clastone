import type { MovieShowItem, WatchRecord, WatchReview } from '../components/EntryRowMovieShow';
import { formatWatchLabel, getWatchRecordSortKey } from '../state/moviesStore';

export type ReviewsSourceScope =
  | { kind: 'self' }
  | { kind: 'friend'; friendId: string };

export type ReviewCardItem = {
  id: string;
  entryId: string;
  mediaType: 'movie' | 'tv';
  entryTitle: string;
  posterPath?: string;
  releaseDate?: string;
  runtimeMinutes?: number;
  totalEpisodes?: number;
  classKey?: string;
  watchRecordId: string;
  review: WatchReview;
  reviewTitle: string;
  reviewBody: string;
  favoriteReview: boolean;
  /** Display date for the watch this review is attached to (not last-edited). */
  reviewDateLabel: string;
  watchSortKey: string;
  dayOrder: number;
  searchText: string;
  sourceScope: ReviewsSourceScope;
};

type BuildReviewCardsParams = {
  moviesByClass: Record<string, MovieShowItem[]>;
  tvByClass: Record<string, MovieShowItem[]>;
  sourceScope?: ReviewsSourceScope;
};

function hasReviewContent(review?: WatchReview): review is WatchReview {
  if (!review) return false;
  return Boolean(review.title?.trim() || review.body?.trim());
}

function buildCardsForMedia(
  entries: MovieShowItem[],
  mediaType: 'movie' | 'tv',
  sourceScope: ReviewsSourceScope
): ReviewCardItem[] {
  const cards: ReviewCardItem[] = [];
  for (const entry of entries) {
    for (const watch of entry.watchRecords ?? []) {
      if (!hasReviewContent(watch.review)) continue;
      const review = watch.review;
      const reviewTitle = review.title.trim();
      const reviewBody = review.body.trim();
      cards.push({
        id: `${entry.id}::${watch.id}`,
        entryId: entry.id,
        mediaType,
        entryTitle: entry.title,
        posterPath: entry.posterPath,
        releaseDate: entry.releaseDate,
        runtimeMinutes: entry.runtimeMinutes,
        totalEpisodes: entry.totalEpisodes,
        classKey: entry.classKey,
        watchRecordId: watch.id,
        review,
        reviewTitle,
        reviewBody,
        favoriteReview: review.favoriteReview === true,
        reviewDateLabel: formatWatchLabel(watch),
        watchSortKey: getWatchRecordSortKey(watch),
        dayOrder: watch.dayOrder ?? 0,
        searchText: `${entry.title} ${review.title} ${review.body}`.toLowerCase(),
        sourceScope,
      });
    }
  }
  return cards;
}

export function buildReviewCards({
  moviesByClass,
  tvByClass,
  sourceScope = { kind: 'self' },
}: BuildReviewCardsParams): ReviewCardItem[] {
  const movieEntries = Object.values(moviesByClass).flat();
  const tvEntries = Object.values(tvByClass).flat();
  return [
    ...buildCardsForMedia(movieEntries, 'movie', sourceScope),
    ...buildCardsForMedia(tvEntries, 'tv', sourceScope),
  ];
}

/** When favoritesFirst is false, ordering is by watch date only (newest watch first). */
export function sortReviewCards(cards: ReviewCardItem[], favoritesFirst: boolean): ReviewCardItem[] {
  return [...cards].sort((a, b) => {
    if (favoritesFirst && a.favoriteReview !== b.favoriteReview) {
      return a.favoriteReview ? -1 : 1;
    }
    const keySort = b.watchSortKey.localeCompare(a.watchSortKey);
    if (keySort !== 0) return keySort;
    if (b.dayOrder !== a.dayOrder) return b.dayOrder - a.dayOrder;
    return b.watchRecordId.localeCompare(a.watchRecordId);
  });
}

export function splitRoundRobin<T>(items: T[], columnCount: number): T[][] {
  const safeColumnCount = Math.max(1, columnCount);
  const columns = Array.from({ length: safeColumnCount }, () => [] as T[]);
  items.forEach((item, index) => {
    columns[index % safeColumnCount].push(item);
  });
  return columns;
}
