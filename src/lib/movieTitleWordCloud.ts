/** Common English stop words for “fun” title token clouds. */
const STOP_WORDS = new Set(
  [
    'a',
    'an',
    'the',
    'and',
    'or',
    'but',
    'if',
    'in',
    'on',
    'at',
    'to',
    'for',
    'of',
    'as',
    'is',
    'was',
    'are',
    'were',
    'be',
    'been',
    'being',
    'have',
    'has',
    'had',
    'do',
    'does',
    'did',
    'will',
    'would',
    'could',
    'should',
    'may',
    'might',
    'must',
    'shall',
    'can',
    'it',
    'its',
    'this',
    'that',
    'these',
    'those',
    'i',
    'you',
    'he',
    'she',
    'we',
    'they',
    'me',
    'him',
    'her',
    'us',
    'them',
    'my',
    'your',
    'his',
    'our',
    'their',
    'from',
    'by',
    'with',
    'about',
    'into',
    'through',
    'over',
    'after',
    'before',
    'between',
    'under',
    'against',
    'during',
    'without',
    'upon',
    'versus',
    'vs',
    'also',
    'too',
    'just',
    'only',
    'even',
    'both',
    'either',
    'such',
    'than',
    'when',
    'where',
    'while',
    'because',
    'how',
    'why',
    'what',
    'who',
    'which',
    'whose',
    'there',
    'here',
    'some',
    'any',
    'every',
    'each',
    'no',
    'not',
    'nor',
    'same',
    'another',
    'again',
    'once',
    'yet',
    'still',
    'already',
    'soon',
    'never',
    'always',
    'very',
    'quite',
    'rather',
    'really',
    'most',
    'more',
    'less',
    'few',
    'many',
    'much',
    'own',
    'other',
    'so',
    'up',
    'out',
    'off',
    'down',
    'now',
    'then',
    'ever',
    'all',
    'am',
  ]
);

function tokenizeTitle(title: string): string[] {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .map((w) => w.trim())
    .filter(Boolean);
}

export function buildMovieTitleWordList(
  titles: string[],
  excludeStopWords: boolean
): [string, number][] {
  return buildCombinedWordCloudList([{ texts: titles, enabled: true }], excludeStopWords);
}

export function buildCombinedWordCloudList(
  parts: readonly { readonly texts: readonly string[]; enabled: boolean }[],
  excludeStopWords: boolean
): [string, number][] {
  const counts = new Map<string, number>();
  for (const part of parts) {
    if (!part.enabled) continue;
    for (const title of part.texts) {
      for (const raw of tokenizeTitle(title)) {
        const w = raw;
        if (w.length < 2) continue;
        if (excludeStopWords && STOP_WORDS.has(w)) continue;
        counts.set(w, (counts.get(w) ?? 0) + 1);
      }
    }
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 250);
}

export const MOVIE_WORD_CLOUD_SHAPES = [
  'circle',
  'cardioid',
  'diamond',
  'triangle-forward',
  'triangle',
  'pentagon',
  'star',
] as const;

export type MovieWordCloudShape = (typeof MOVIE_WORD_CLOUD_SHAPES)[number];

export function pickRandomWordCloudShape(): MovieWordCloudShape {
  const i = Math.floor(Math.random() * MOVIE_WORD_CLOUD_SHAPES.length);
  return MOVIE_WORD_CLOUD_SHAPES[i] ?? 'circle';
}
