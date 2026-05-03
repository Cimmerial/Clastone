import type { MovieShowItem, WatchRecord, WatchReview } from '../components/EntryRowMovieShow';
import { getWatchRecordSortKey } from '../state/moviesStore';

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
  reviewUpdatedAtMs: number;
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

function parseUpdatedAtMs(value?: string): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatReviewDate(value: string | undefined, fallback: WatchRecord): string {
  const updatedMs = parseUpdatedAtMs(value);
  if (updatedMs > 0) {
    return new Date(updatedMs).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }
  const sortKey = getWatchRecordSortKey(fallback);
  if (sortKey === '0000-00-00') return 'Long Ago';
  const [y, m, d] = sortKey.split('-').map((part) => Number.parseInt(part, 10));
  if (!y || !m || !d) return 'Unknown date';
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
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
      const reviewTitle = review.title.trim() || entry.title;
      const reviewBody = review.body.trim();
      const reviewUpdatedAtMs = parseUpdatedAtMs(review.updatedAt);
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
        reviewUpdatedAtMs,
        reviewDateLabel: formatReviewDate(review.updatedAt, watch),
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

export function sortReviewCards(cards: ReviewCardItem[], favoritesFirst: boolean): ReviewCardItem[] {
  return [...cards].sort((a, b) => {
    if (favoritesFirst && a.favoriteReview !== b.favoriteReview) {
      return a.favoriteReview ? -1 : 1;
    }
    if (b.reviewUpdatedAtMs !== a.reviewUpdatedAtMs) {
      return b.reviewUpdatedAtMs - a.reviewUpdatedAtMs;
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

export function findFirstMatchingReview(cards: ReviewCardItem[], query: string): ReviewCardItem | null {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return null;
  return cards.find((card) => card.searchText.includes(normalized)) ?? null;
}
