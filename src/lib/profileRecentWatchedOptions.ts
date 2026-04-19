import type { ThemedDropdownOption } from '../components/ThemedDropdown';

export type ProfileRecentRange = 'this_year' | 'last_month' | 'last_year' | 'all_time' | 'milestones';

export const PROFILE_RECENT_RANGE_OPTIONS: ThemedDropdownOption<ProfileRecentRange>[] = [
  { value: 'this_year', label: 'This year' },
  { value: 'last_month', label: 'In the last month' },
  { value: 'last_year', label: 'In the last year' },
  { value: 'all_time', label: 'All time' },
  { value: 'milestones', label: 'Milestones' }
];

/** 0–100 width for “recently watched” horizontal bars (not Recharts movie category bars). */
export function percentileFillWidthFromBadge(badge: string | null | undefined): number {
  if (!badge) return 0;
  const m = /^(\d+)%$/.exec(String(badge).trim());
  if (m) return Math.min(100, Math.max(0, parseInt(m[1], 10)));
  return 0;
}
