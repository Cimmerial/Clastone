import type { MovieShowItem } from '../components/EntryRowMovieShow';
import { getWatchRecordSortKey } from '../state/moviesStore';
import type { ThemedDropdownOption } from '../components/ThemedDropdown';

export type ProfileMediaListMode =
  | 'top10'
  | 'all_with_classes'
  | 'top5_each_year'
  | 'top10_by_watch_year'
  | 'top30_most_seen'
  | 'bottom10'
  | 'bottom5_each_year'
  | 'bottom10_by_watch_year';
export type ProfileWatchYearFilter = 'all' | 'first_watch' | 'rewatch';

export const PROFILE_MEDIA_LIST_MODE_OPTIONS: ThemedDropdownOption<ProfileMediaListMode>[] = [
  { value: 'top10', label: 'Top 10' },
  { value: 'top5_each_year', label: 'Top 5 by Release Year' },
  { value: 'top10_by_watch_year', label: 'Top 10 by Watch Year' },
  { value: 'all_with_classes', label: 'Show All' },
  { value: 'top30_most_seen', label: 'Top 30 Most Seen' },
  { value: 'bottom10', label: 'Bottom 10' },
  { value: 'bottom5_each_year', label: 'Bottom 5 by Release Year' },
  { value: 'bottom10_by_watch_year', label: 'Bottom 10 by Watch Year' },
];

function sortKeyToCalendarYear(sortKey: string): number | null {
  if (!sortKey || sortKey === '0000-00-00') return null;
  const y = parseInt(sortKey.slice(0, 4), 10);
  return Number.isFinite(y) && y > 0 ? y : null;
}

/** Dated watch entries per title, oldest first. */
function collectDatedWatchEntries(item: MovieShowItem): { sortKey: string; calYear: number }[] {
  const out: { sortKey: string; calYear: number }[] = [];
  for (const r of item.watchRecords ?? []) {
    const sk = getWatchRecordSortKey(r);
    const calYear = sortKeyToCalendarYear(sk);
    if (calYear == null) continue;
    out.push({ sortKey: sk, calYear });
  }
  out.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  return out;
}

/**
 * For each calendar year, up to 10 titles from `items` (in list order) that qualify.
 * - all: any watch dated in that year
 * - first_watch: global first dated watch falls in that year
 * - rewatch: at least one dated watch in that year is not the title’s first watch
 */
export function buildTopTenByWatchYear(
  items: MovieShowItem[],
  filter: ProfileWatchYearFilter
): { year: number; items: MovieShowItem[] }[] {
  const yearsSet = new Set<number>();
  for (const item of items) {
    for (const e of collectDatedWatchEntries(item)) {
      yearsSet.add(e.calYear);
    }
  }
  const years = Array.from(yearsSet).sort((a, b) => b - a);
  const result: { year: number; items: MovieShowItem[] }[] = [];

  for (const year of years) {
    const picked: MovieShowItem[] = [];
    for (const item of items) {
      if (picked.length >= 10) break;
      const entries = collectDatedWatchEntries(item);
      if (entries.length === 0) continue;

      if (filter === 'all') {
        if (entries.some((e) => e.calYear === year)) picked.push(item);
      } else if (filter === 'first_watch') {
        if (entries[0].calYear === year) picked.push(item);
      } else {
        for (let i = 1; i < entries.length; i++) {
          if (entries[i].calYear === year) {
            picked.push(item);
            break;
          }
        }
      }
    }
    if (picked.length > 0) result.push({ year, items: picked });
  }
  return result;
}

export function buildBottomTenByWatchYear(
  items: MovieShowItem[],
  filter: ProfileWatchYearFilter
): { year: number; items: MovieShowItem[] }[] {
  const yearsSet = new Set<number>();
  for (const item of items) {
    for (const e of collectDatedWatchEntries(item)) yearsSet.add(e.calYear);
  }
  const years = Array.from(yearsSet).sort((a, b) => b - a);
  const result: { year: number; items: MovieShowItem[] }[] = [];

  for (const year of years) {
    const picked: MovieShowItem[] = [];
    for (let idx = items.length - 1; idx >= 0; idx -= 1) {
      if (picked.length >= 10) break;
      const item = items[idx];
      const entries = collectDatedWatchEntries(item);
      if (entries.length === 0) continue;

      if (filter === 'all') {
        if (entries.some((e) => e.calYear === year)) picked.push(item);
      } else if (filter === 'first_watch') {
        if (entries[0].calYear === year) picked.push(item);
      } else {
        for (let i = 1; i < entries.length; i += 1) {
          if (entries[i].calYear === year) {
            picked.push(item);
            break;
          }
        }
      }
    }
    if (picked.length > 0) result.push({ year, items: picked });
  }
  return result;
}
