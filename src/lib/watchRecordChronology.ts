import type { MovieShowItem, WatchRecord } from '../components/EntryRowMovieShow';

/** One dated (or sortable) watch flattened with its parent item. */
export type FlatWatchEvent = {
  item: MovieShowItem;
  record: WatchRecord;
  sortKey: string;
  isMovie: boolean;
};

export function getWatchRecordDayOrder(r: WatchRecord): number {
  return r.dayOrder ?? 0;
}

/** Newest first: sortKey desc, then later-in-day (higher dayOrder) first, then record id. */
export function compareRecentWatchEvents(a: FlatWatchEvent, b: FlatWatchEvent): number {
  const sk = b.sortKey.localeCompare(a.sortKey);
  if (sk !== 0) return sk;
  const ord = getWatchRecordDayOrder(b.record) - getWatchRecordDayOrder(a.record);
  if (ord !== 0) return ord;
  return String(b.record.id ?? '').localeCompare(String(a.record.id ?? ''));
}

/** Oldest first for cross-title first-watch lists: sortKey asc, dayOrder asc, item id, record id. */
export function compareChronologicalFirstWatchList(a: FlatWatchEvent, b: FlatWatchEvent): number {
  let c = a.sortKey.localeCompare(b.sortKey);
  if (c !== 0) return c;
  c = getWatchRecordDayOrder(a.record) - getWatchRecordDayOrder(b.record);
  if (c !== 0) return c;
  c = a.item.id.localeCompare(b.item.id);
  if (c !== 0) return c;
  return String(a.record.id ?? '').localeCompare(String(b.record.id ?? ''));
}
