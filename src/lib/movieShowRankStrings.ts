/** Matches strings like `92%` shown on movie/show rows. */
export function parsePercentileRankString(s: string): number | null {
  const m = s.trim().match(/^(\d+)%$/);
  return m ? Number(m[1]) : null;
}

export type ParsedAbsoluteRankParts = { rank: number; total: number };

/** Matches strings like `120 / 455` from global ranks. */
export function parseAbsoluteRankParts(s: string): ParsedAbsoluteRankParts | null {
  const m = s.trim().match(/^(\d+)\s*\/\s*(\d+)$/);
  return m ? { rank: Number(m[1]), total: Number(m[2]) } : null;
}

/**
 * Summary line segment from the first and last visible rows in a class:
 * e.g. `83%-74% | #120-#155`
 */
export function formatMovieShowClassRankSpan(
  items: { percentileRank: string; absoluteRank: string }[]
): string {
  if (items.length === 0) return '';
  const top = items[0];
  const bottom = items[items.length - 1];
  const pctT = parsePercentileRankString(top.percentileRank);
  const pctB = parsePercentileRankString(bottom.percentileRank);
  const absT = parseAbsoluteRankParts(top.absoluteRank);
  const absB = parseAbsoluteRankParts(bottom.absoluteRank);
  const parts: string[] = [];
  if (pctT != null && pctB != null) {
    parts.push(`${pctT}%-${pctB}%`);
  }
  if (absT != null && absB != null) {
    parts.push(`#${absT.rank}-#${absB.rank}`);
  }
  return parts.join(' | ');
}
