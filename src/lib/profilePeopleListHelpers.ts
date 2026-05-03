import type { ThemedDropdownOption } from '../components/ThemedDropdown';

export type ProfilePeopleListMode = 'rank_top' | 'by_birthyear' | 'all_classes';

export const PROFILE_PEOPLE_LIST_MODE_OPTIONS: ThemedDropdownOption<ProfilePeopleListMode>[] = [
  { value: 'rank_top', label: 'Top 10' },
  { value: 'by_birthyear', label: 'Top 5 by Birth Year' },
  { value: 'all_classes', label: 'Show All' },
];

/** Calendar birth year from TMDB-style birthday string, or null if unknown. */
export function birthYearFromBirthday(birthday?: string): number | null {
  if (!birthday?.trim()) return null;
  const trimmed = birthday.trim();
  const ts = Date.parse(trimmed);
  if (Number.isFinite(ts)) {
    const y = new Date(ts).getFullYear();
    return y >= 1000 && y <= 9999 ? y : null;
  }
  const m = trimmed.match(/^(\d{4})/);
  if (m) {
    const y = parseInt(m[1], 10);
    if (Number.isFinite(y) && y >= 1000) return y;
  }
  return null;
}

export type BirthYearSection<T> = { year: number | 'unknown'; items: T[] };

/**
 * For each birth year (newest year first), up to five people in global rank order.
 * Unknown birth years get one trailing section (up to five), in rank order.
 */
export function buildTopFivePerBirthYearInRankOrder<T>(
  ranked: T[],
  getBirthday: (item: T) => string | undefined
): BirthYearSection<T>[] {
  const yearSet = new Set<number>();
  for (const p of ranked) {
    const y = birthYearFromBirthday(getBirthday(p));
    if (y != null) yearSet.add(y);
  }
  const years = Array.from(yearSet).sort((a, b) => b - a);
  const out: BirthYearSection<T>[] = [];
  for (const year of years) {
    const items: T[] = [];
    for (const p of ranked) {
      if (items.length >= 5) break;
      if (birthYearFromBirthday(getBirthday(p)) === year) items.push(p);
    }
    if (items.length > 0) out.push({ year, items });
  }
  const unknown: T[] = [];
  for (const p of ranked) {
    if (unknown.length >= 5) break;
    if (birthYearFromBirthday(getBirthday(p)) == null) unknown.push(p);
  }
  if (unknown.length > 0) out.push({ year: 'unknown', items: unknown });
  return out;
}

/**
 * Rank-order preview: up to ten when extended mode is on and the list is long;
 * otherwise up to five (or fewer if the list is short).
 */
export function rankTopPeopleDisplayCount(totalRanked: number, extendedTop: boolean): number {
  if (extendedTop && totalRanked > 10) return 10;
  return Math.min(5, totalRanked);
}
