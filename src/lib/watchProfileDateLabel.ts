import type { WatchRecord } from '../components/EntryRowMovieShow';
import { getWatchRecordSortKey } from '../state/moviesStore';

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

/**
 * Turn a watch sort key (YYYY-MM-DD, with 00 for unknown parts) into a profile-friendly label.
 * Full day: "Sat, April 18, 2026". Year only: "Sometime 2025". Month + year: "April 2025".
 */
export function formatSortKeyAsProfileLabel(sortKey: string): string {
  if (sortKey === '0000-00-00') return 'Unknown date';

  const parts = sortKey.split('-');
  if (parts.length !== 3) return sortKey;

  const y = parseInt(parts[0], 10);
  const mo = parseInt(parts[1], 10);
  const d = parseInt(parts[2], 10);

  if (!Number.isFinite(y) || y <= 0) return 'Unknown date';
  if (!Number.isFinite(mo) || !Number.isFinite(d)) return sortKey;

  if (mo === 0 && d === 0) return `Sometime ${y}`;
  if (mo > 0 && d === 0) {
    if (mo < 1 || mo > 12) return `Sometime ${y}`;
    return `${MONTH_NAMES[mo - 1]} ${y}`;
  }
  if (mo > 0 && d > 0) {
    if (mo < 1 || mo > 12) return `Sometime ${y}`;
    const date = new Date(y, mo - 1, d);
    const wd = date.toLocaleDateString('en-US', { weekday: 'short' });
    const monthName = MONTH_NAMES[mo - 1];
    return `${wd}, ${monthName} ${d}, ${y}`;
  }
  return `Sometime ${y}`;
}

/**
 * Human-readable watch date for profile "Recently watched" / milestones (own + friend profiles).
 */
export function formatProfileWatchDateLabel(record: WatchRecord): string {
  const sk = getWatchRecordSortKey(record);
  if (sk === '0000-00-00') {
    const t = record.type ?? 'DATE';
    if (t === 'LONG_AGO' || t === 'DNF_LONG_AGO') return 'Long ago';
    return 'Unknown date';
  }
  return formatSortKeyAsProfileLabel(sk);
}
