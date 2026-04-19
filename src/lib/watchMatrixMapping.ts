import type { WatchRecord } from '../components/EntryRowMovieShow';
import type { WatchMatrixEntry } from '../components/UniversalEditModal';

/** Build a WatchRecord from matrix state (same rules as page save handlers). */
export function watchMatrixEntryToWatchRecord(entry: WatchMatrixEntry): WatchRecord | null {
  let type: WatchRecord['type'] = 'DATE';
  if (entry.watchType === 'DATE_RANGE') type = 'RANGE';
  else if (entry.watchType === 'LONG_AGO') {
    type = entry.watchStatus === 'DNF' ? 'DNF_LONG_AGO' : 'LONG_AGO';
  }

  if (entry.watchStatus === 'WATCHING' && entry.watchType !== 'LONG_AGO') type = 'CURRENT';
  else if (entry.watchStatus === 'DNF' && entry.watchType !== 'LONG_AGO') type = 'DNF';

  const r: WatchRecord = {
    id: entry.id,
    type,
    year: entry.year,
    month: entry.month,
    day: entry.day,
    endYear: entry.endYear,
    endMonth: entry.endMonth,
    endDay: entry.endDay,
    dnfPercent: entry.watchPercent < 100 ? entry.watchPercent : undefined,
    dayOrder: entry.dayOrder,
    review: entry.review,
  };

  if (type === 'LONG_AGO' || type === 'DNF_LONG_AGO') return r;
  if ((type === 'DNF' || type === 'CURRENT') && !entry.year) return null;
  if (!entry.year) return null;
  return r;
}

export function watchMatrixEntriesToWatchRecords(entries: WatchMatrixEntry[]): WatchRecord[] {
  return entries.map(watchMatrixEntryToWatchRecord).filter((r): r is WatchRecord => r !== null);
}
