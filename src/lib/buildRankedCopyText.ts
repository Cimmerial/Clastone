import type { MovieShowItem } from '../components/EntryRowMovieShow';

/** Minimal shape for ranked copy (movies, shows, actors, directors). */
export type CopyRankedListItem = {
  title: string;
  id: string;
  tmdbId?: number;
};

export function tmdbIdFromListItem(item: CopyRankedListItem): number {
  if (item.tmdbId != null && !Number.isNaN(Number(item.tmdbId))) {
    return Number(item.tmdbId);
  }
  const n = parseInt(String(item.id).replace(/\D/g, ''), 10);
  return Number.isNaN(n) ? 0 : n;
}

/** @deprecated use tmdbIdFromListItem */
export function itemTmdbId(item: MovieShowItem): number {
  return tmdbIdFromListItem(item);
}

export function buildRankedCopyText(params: {
  classOrder: string[];
  byClass: Record<string, CopyRankedListItem[]>;
  getClassLabel: (classKey: string) => string;
  getClassTagline: (classKey: string) => string | undefined;
  maxItems: number;
  includeTmdbId: boolean;
  includeClassHeaders: boolean;
}): string {
  const lines: string[] = [];
  let num = 1;
  const {
    classOrder,
    byClass,
    getClassLabel,
    getClassTagline,
    maxItems,
    includeTmdbId,
    includeClassHeaders,
  } = params;

  const safeMax = Math.max(0, Math.min(Math.floor(maxItems), 10_000));

  outer: for (const classKey of classOrder) {
    const items = byClass[classKey] ?? [];
    if (items.length === 0) continue;
    if (num > safeMax) break;

    if (includeClassHeaders) {
      const label = getClassLabel(classKey);
      const tagline = (getClassTagline(classKey) ?? '').trim();
      lines.push(tagline ? `${label} | ${tagline}` : `${label} |`);
    }

    for (const item of items) {
      if (num > safeMax) break outer;
      const tid = tmdbIdFromListItem(item);
      const suffix = includeTmdbId ? ` -- ${tid}` : '';
      lines.push(`${num}. ${item.title}${suffix}`);
      num += 1;
    }
  }

  return lines.join('\n');
}

export type WatchlistCopyEntry = { id: string; title: string };

export function buildWatchlistCopyText(
  entries: WatchlistCopyEntry[],
  maxItems: number,
  includeTmdbId: boolean
): string {
  const safeMax = Math.max(0, Math.min(Math.floor(maxItems), 10_000));
  const slice = entries.slice(0, safeMax);
  const lines: string[] = [];
  for (let i = 0; i < slice.length; i++) {
    const e = slice[i];
    const tid = tmdbIdFromListItem(e);
    const suffix = includeTmdbId ? ` -- ${tid}` : '';
    lines.push(`${i + 1}. ${e.title}${suffix}`);
  }
  return lines.join('\n');
}
