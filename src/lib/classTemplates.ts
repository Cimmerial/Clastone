import type { ClassKey } from '../components/RankedList';
import type { MovieShowItem } from '../components/EntryRowMovieShow';
import type { MovieClassDef } from '../mock/movies';
import type { PeopleClassDef } from '../state/peopleStore';
import type { DirectorsClassDef } from '../state/directorsStore';

/** Single class every new account starts with for movies/TV (and template reset). */
export const ONLY_UNRANKED_MOVIE_CLASS: MovieClassDef[] = [{ key: 'UNRANKED', label: 'UNRANKED', isRanked: false }];

export const ONLY_UNRANKED_PERSON_CLASS: PeopleClassDef[] = [{ key: 'UNRANKED', label: 'UNRANKED', isRanked: false }];

export const ONLY_UNRANKED_DIRECTOR_CLASS: DirectorsClassDef[] = [{ key: 'UNRANKED', label: 'UNRANKED', isRanked: false }];

export type MovieShowTemplateId = 'classic_clastone' | 'letterboxd_simp' | 'the_michael';

export type PersonTemplateId = 'classic_clastone' | 'stars';

const CLASSIC_UNRANKED_MOVIE: MovieClassDef[] = [
  { key: 'DELICIOUS_GARBAGE', label: 'DELICIOUS GARBAGE', tagline: 'So bad its good', isRanked: false },
  { key: 'BABY', label: 'BABY', tagline: 'for babies', isRanked: false },
  { key: 'DONT_REMEMBER', label: "DON'T REMEMBER", isRanked: false },
  { key: 'PENDING', label: 'PENDING', tagline: 'need to think about it', isRanked: false },
  { key: 'UNRANKED', label: 'UNRANKED', isRanked: false }
];

const MICHAEL_UNRANKED_MOVIE: MovieClassDef[] = [
  { key: 'DELICIOUS_GARBAGE', label: 'DELICIOUS GARBAGE', tagline: "So Bad... It's Good", isRanked: false },
  { key: 'BABY', label: 'BABY', tagline: 'FOR BABIES', isRanked: false },
  { key: 'DONT_REMEMBER', label: "DON'T REMEMBER", isRanked: false },
  { key: 'PENDING', label: 'PENDING', tagline: 'need to think about it', isRanked: false },
  { key: 'UNRANKED', label: 'UNRANKED', isRanked: false }
];

export const movieShowTemplates: Record<
  MovieShowTemplateId,
  { title: string; description: string; classes: MovieClassDef[] }
> = {
  classic_clastone: {
    title: 'Classic Clastone',
    description: 'Broad tiers from Olympus down to God Awful, plus curated unranked buckets.',
    classes: [
      { key: 'OLYMPUS', label: 'OLYMPUS', isRanked: true },
      { key: 'AMAZING', label: 'AMAZING', isRanked: true },
      { key: 'GREAT', label: 'GREAT', isRanked: true },
      { key: 'GOOD', label: 'GOOD', isRanked: true },
      { key: 'MID', label: 'MID', isRanked: true },
      { key: 'ACTION_SLOP', label: 'ACTION SLOP', isRanked: true },
      { key: 'BAD', label: 'BAD', isRanked: true },
      { key: 'GOD_AWFUL', label: 'GOD AWFUL', isRanked: true },
      ...CLASSIC_UNRANKED_MOVIE
    ]
  },
  letterboxd_simp: {
    title: 'Letterboxd Simp',
    description: 'Half-star scale from 5 down to 0.5, plus the same unranked buckets as Classic.',
    classes: [
      { key: 'STAR_5', label: '5 STAR', isRanked: true },
      { key: 'STAR_4_5', label: '4.5 STAR', isRanked: true },
      { key: 'STAR_4', label: '4 STAR', isRanked: true },
      { key: 'STAR_3_5', label: '3.5 STAR', isRanked: true },
      { key: 'STAR_3', label: '3 STAR', isRanked: true },
      { key: 'STAR_2_5', label: '2.5 STAR', isRanked: true },
      { key: 'STAR_2', label: '2 STAR', isRanked: true },
      { key: 'STAR_1_5', label: '1.5 STAR', isRanked: true },
      { key: 'STAR_1', label: '1 STAR', isRanked: true },
      { key: 'STAR_0_5', label: '0.5 STAR', isRanked: true },
      ...CLASSIC_UNRANKED_MOVIE
    ]
  },
  the_michael: {
    title: 'The Michael',
    description: 'Pantheon through Bad, with the same unranked buckets as Classic.',
    classes: [
      { key: 'THE_PANTHEON', label: 'THE PANTHEON', tagline: 'mooovie', isRanked: true },
      { key: 'BANGERS', label: 'BANGERS', isRanked: true },
      { key: 'YES', label: 'YES', isRanked: true },
      { key: 'NORMAL_PLUS', label: 'NORMAL+', tagline: 'its a moovie!!!!', isRanked: true },
      { key: 'NORMAL', label: 'NORMAL', tagline: 'confirmed movie', isRanked: true },
      { key: 'BAD', label: 'BAD', tagline: 'AHHHHH', isRanked: true },
      ...MICHAEL_UNRANKED_MOVIE
    ]
  }
};

export const personTemplates: Record<
  PersonTemplateId,
  { title: string; description: string; classes: PeopleClassDef[] }
> = {
  classic_clastone: {
    title: 'Classic Clastone',
    description:
      'Seven ranked tiers from Worship through Nemesis, plus only UNRANKED (no extra unranked buckets).',
    classes: [
      { key: 'WORSHIP', label: 'WORSHIP', isRanked: true },
      { key: 'ADORE', label: 'ADORE', isRanked: true },
      { key: 'RESPECT', label: 'RESPECT', isRanked: true },
      { key: 'LIKE', label: 'LIKE', isRanked: true },
      { key: 'INDIFFERENT', label: 'INDIFFERENT', isRanked: true },
      { key: 'KAL-EL_NO', label: 'KAL-EL NO', isRanked: true },
      { key: 'NEMESIS', label: 'NEMESIS', isRanked: true },
      { key: 'UNRANKED', label: 'UNRANKED', isRanked: false }
    ]
  },
  stars: {
    title: 'Stars',
    description: 'Five whole-star rungs from 5 down to 1, plus only UNRANKED (no extra unranked buckets).',
    classes: [
      { key: 'PEOPLE_STAR_5', label: '5 star', isRanked: true },
      { key: 'PEOPLE_STAR_4', label: '4 star', isRanked: true },
      { key: 'PEOPLE_STAR_3', label: '3 star', isRanked: true },
      { key: 'PEOPLE_STAR_2', label: '2 star', isRanked: true },
      { key: 'PEOPLE_STAR_1', label: '1 star', isRanked: true },
      { key: 'UNRANKED', label: 'UNRANKED', isRanked: false }
    ]
  }
};

/** Directors use the same shape as actors for templates. */
export const directorTemplates: Record<
  PersonTemplateId,
  { title: string; description: string; classes: DirectorsClassDef[] }
> = {
  classic_clastone: {
    title: 'Classic Clastone',
    description:
      'Seven ranked tiers from Worship through Nemesis, plus only UNRANKED (no extra unranked buckets).',
    classes: personTemplates.classic_clastone.classes.map((c) => ({ ...c })) as DirectorsClassDef[]
  },
  stars: {
    title: 'Stars',
    description: 'Five whole-star rungs from 5 down to 1, plus only UNRANKED (no extra unranked buckets).',
    classes: personTemplates.stars.classes.map((c) => ({ ...c })) as DirectorsClassDef[]
  }
};

export function emptyByClassForMovieClasses(classes: MovieClassDef[]): Record<ClassKey, MovieShowItem[]> {
  return Object.fromEntries(classes.map((c) => [c.key, []])) as Record<ClassKey, MovieShowItem[]>;
}

export function emptyByClassForStringKeys(classes: { key: string }[]): Record<string, MovieShowItem[]> {
  return Object.fromEntries(classes.map((c) => [c.key, []])) as Record<string, MovieShowItem[]>;
}

/**
 * When applying a template, preserve UNRANKED entries and sweep any stray items into UNRANKED
 * (only relevant if someone had only-UNRANKED state with items).
 */
export function mergeMovieByClassForTemplate(
  prev: Record<ClassKey, MovieShowItem[]>,
  newClasses: MovieClassDef[]
): Record<ClassKey, MovieShowItem[]> {
  const next = emptyByClassForMovieClasses(newClasses);
  const intoUnranked: MovieShowItem[] = [...(prev.UNRANKED ?? [])];
  for (const [k, list] of Object.entries(prev)) {
    if (k === 'UNRANKED' || !list?.length) continue;
    for (const item of list) {
      intoUnranked.push({ ...item, classKey: 'UNRANKED' });
    }
  }
  next.UNRANKED = intoUnranked;
  return next;
}

export function mergePersonByClassForTemplate<T extends { id: string; classKey: string }>(
  prev: Record<string, T[]>,
  newClasses: { key: string }[]
): Record<string, T[]> {
  const next = Object.fromEntries(newClasses.map((c) => [c.key, []])) as Record<string, T[]>;
  const intoUnranked: T[] = [...(prev.UNRANKED ?? [])];
  for (const [k, list] of Object.entries(prev)) {
    if (k === 'UNRANKED' || !list?.length) continue;
    for (const item of list) {
      intoUnranked.push({ ...item, classKey: 'UNRANKED' });
    }
  }
  next.UNRANKED = intoUnranked;
  return next;
}

/**
 * True while the user may pick or swap class templates: every class bucket except the
 * catch-all `UNRANKED` key must be empty. Entries in DELICIOUS GARBAGE, ranked tiers, etc.
 * lock template swapping.
 */
export function canChooseOrSwapClassTemplate(
  byClass: Record<string, readonly unknown[] | undefined> | undefined
): boolean {
  if (!byClass) return true;
  for (const [k, list] of Object.entries(byClass)) {
    if (k === 'UNRANKED') continue;
    if (Array.isArray(list) && list.length > 0) return false;
  }
  return true;
}

/** One line per tier for template preview UI (label + optional tagline). */
function formatTemplateTierBullet(c: { label: string; tagline?: string }): string {
  const t = c.tagline?.trim();
  return t ? `${c.label} — ${t}` : c.label;
}

export function templateRankedAndUnrankedLists(classes: { label: string; tagline?: string; isRanked?: boolean }[]): {
  ranked: string[];
  unranked: string[];
} {
  const ranked = classes.filter((c) => c.isRanked === true).map(formatTemplateTierBullet);
  const unranked = classes.filter((c) => c.isRanked !== true).map(formatTemplateTierBullet);
  return { ranked, unranked };
}
