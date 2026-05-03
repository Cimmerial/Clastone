/**
 * Filters long-running “noise” TV credits from actor/director filmographies.
 * Uses title text only (TMDB credit titles).
 */
export function isActorProjectTitleExcluded(
  title: string,
  opts: { excludeSimpsons: boolean; excludeFamilyGuy: boolean }
): boolean {
  const t = title.toLowerCase().trim();
  if (opts.excludeSimpsons && /\b(the\s+)?simpsons\b/i.test(t)) {
    return true;
  }
  if (opts.excludeFamilyGuy && /\bfamily\s+guy\b/i.test(t)) {
    return true;
  }
  return false;
}
