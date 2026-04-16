/** Levenshtein distance for short strings (usernames). */
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const row = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) row[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = row[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + cost);
      prev = tmp;
    }
  }
  return row[n];
}

/**
 * Higher is better. 0 means not a match worth showing.
 * Handles substring, subsequence (gaps), and light typo tolerance via Levenshtein on comparable length.
 */
export function fuzzyUsernameScore(query: string, username: string): number {
  const q = query.trim().toLowerCase();
  const u = (username || '').toLowerCase();
  if (!q || !u) return 0;

  if (u === q) return 10_000;
  if (u.startsWith(q)) return 5000 + 100 / u.length;
  if (u.includes(q)) return 3000 + 100 / u.length;

  // Subsequence: all query chars appear in order (classic fuzzy filter).
  let qi = 0;
  for (let i = 0; i < u.length && qi < q.length; i++) {
    if (u[i] === q[qi]) qi++;
  }
  if (qi === q.length) {
    const density = q.length / u.length;
    return 1500 + density * 500;
  }

  const maxCompare = Math.min(Math.max(q.length, u.length), 64);
  const a = q.slice(0, maxCompare);
  const b = u.slice(0, maxCompare);
  const dist = levenshtein(a, b);
  const maxLen = Math.max(a.length, b.length) || 1;
  const similarity = 1 - dist / maxLen;
  if (similarity >= 0.55) return similarity * 1000;

  return 0;
}

export function rankByFuzzyUsernameMatch<T extends { username?: string }>(
  items: T[],
  query: string,
  minScore = 200
): T[] {
  const q = query.trim();
  if (!q) return items;
  const scored = items
    .map((item) => ({
      item,
      score: fuzzyUsernameScore(q, item.username ?? ''),
    }))
    .filter((x) => x.score >= minScore)
    .sort((a, b) => b.score - a.score);
  return scored.map((x) => x.item);
}
