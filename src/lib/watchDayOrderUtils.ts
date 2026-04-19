import type { MovieShowItem, WatchRecord } from '../components/EntryRowMovieShow';
import { getWatchRecordSortKey } from '../state/moviesStore';
import type { FlatWatchEvent } from './watchRecordChronology';
import { compareRecentWatchEvents, getWatchRecordDayOrder } from './watchRecordChronology';

/** All dated watches across movies + TV (excludes sortKey 0000-00-00). */
export function collectFlatDatedWatchEvents(
  moviesByClass: Record<string, MovieShowItem[]>,
  tvByClass: Record<string, MovieShowItem[]>,
  movieClassOrder: string[],
  tvClassOrder: string[]
): FlatWatchEvent[] {
  const out: FlatWatchEvent[] = [];
  for (const classKey of movieClassOrder) {
    for (const item of moviesByClass[classKey] ?? []) {
      for (const r of item.watchRecords ?? []) {
        const sortKey = getWatchRecordSortKey(r);
        if (sortKey === '0000-00-00') continue;
        out.push({ item, record: r, sortKey, isMovie: true });
      }
    }
  }
  for (const classKey of tvClassOrder) {
    for (const item of tvByClass[classKey] ?? []) {
      for (const r of item.watchRecords ?? []) {
        const sortKey = getWatchRecordSortKey(r);
        if (sortKey === '0000-00-00') continue;
        out.push({ item, record: r, sortKey, isMovie: false });
      }
    }
  }
  return out;
}

export function filterEventsExcludingEntry(events: FlatWatchEvent[], entryId: string): FlatWatchEvent[] {
  return events.filter((e) => e.item.id !== entryId);
}

export function countWatchesOnSortKey(events: FlatWatchEvent[], sortKey: string): number {
  return events.filter((e) => e.sortKey === sortKey).length;
}

export function getMaxDayOrderForSortKey(events: FlatWatchEvent[], sortKey: string): number {
  let max = -1;
  for (const e of events) {
    if (e.sortKey !== sortKey) continue;
    const d = getWatchRecordDayOrder(e.record);
    if (d > max) max = d;
  }
  return max;
}

/** Modal list: end of day first (high dayOrder at top), then title, then id. */
export function sortEventsForDayOrderModal(events: FlatWatchEvent[]): FlatWatchEvent[] {
  return [...events].sort((a, b) => {
    const o = getWatchRecordDayOrder(b.record) - getWatchRecordDayOrder(a.record);
    if (o !== 0) return o;
    const t = a.item.title.localeCompare(b.item.title);
    if (t !== 0) return t;
    return String(a.record.id ?? '').localeCompare(String(b.record.id ?? ''));
  });
}

/** After user orders top=end of day, assign dayOrder = n - 1 - index. */
export function dayOrdersFromOrderedRecordIds(orderedRecordIds: string[]): Map<string, number> {
  const n = orderedRecordIds.length;
  const map = new Map<string, number>();
  orderedRecordIds.forEach((id, i) => {
    map.set(String(id), n - 1 - i);
  });
  return map;
}

/**
 * For records missing dayOrder, assign sequential max+1 per sortKey using
 * library max (excluding current entry) plus earlier rows in this batch.
 */
export function applyDefaultDayOrdersToRecords(
  records: WatchRecord[],
  entryId: string,
  libraryExcludingEntry: FlatWatchEvent[]
): WatchRecord[] {
  const maxByDay = new Map<string, number>();
  for (const e of libraryExcludingEntry) {
    const cur = maxByDay.get(e.sortKey) ?? -1;
    maxByDay.set(e.sortKey, Math.max(cur, getWatchRecordDayOrder(e.record)));
  }

  return records.map((r) => {
    const sk = getWatchRecordSortKey(r);
    if (sk === '0000-00-00') return r;
    if (r.dayOrder !== undefined && r.dayOrder !== null) return r;
    const curMax = maxByDay.get(sk) ?? -1;
    const next = curMax + 1;
    maxByDay.set(sk, next);
    return { ...r, dayOrder: next };
  });
}

/** Single new watch: append at end of day for that sortKey. */
export function nextDayOrderForNewWatch(sortKey: string, libraryAll: FlatWatchEvent[]): number {
  if (sortKey === '0000-00-00') return 0;
  return getMaxDayOrderForSortKey(libraryAll, sortKey) + 1;
}

export function eventsForSortKeySortedRecent(events: FlatWatchEvent[], sortKey: string): FlatWatchEvent[] {
  return events.filter((e) => e.sortKey === sortKey).sort(compareRecentWatchEvents);
}

/** Assign default dayOrder for records missing it before persisting. */
export function prepareWatchRecordsForSave(
  records: WatchRecord[],
  entryId: string,
  moviesByClass: Record<string, MovieShowItem[]>,
  tvByClass: Record<string, MovieShowItem[]>,
  movieClassOrder: string[],
  tvClassOrder: string[]
): WatchRecord[] {
  const all = collectFlatDatedWatchEvents(moviesByClass, tvByClass, movieClassOrder, tvClassOrder);
  const ex = filterEventsExcludingEntry(all, entryId);
  return applyDefaultDayOrdersToRecords(records, entryId, ex);
}
