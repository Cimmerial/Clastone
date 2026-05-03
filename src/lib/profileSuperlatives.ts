import type { MovieShowItem } from '../components/EntryRowMovieShow';
import { tmdbSearchMulti, type TmdbMultiResult } from './tmdb';
import type { PersonItem } from '../state/peopleStore';
import type { DirectorItem } from '../state/directorsStore';
import type { ProfileSuperlativeEntry, SuperlativeEntryType } from './firestoreSuperlatives';

export type SuperlativeEntryCandidate = ProfileSuperlativeEntry & {
  key: string;
  source: 'saved' | 'tmdb';
};

function normalizeText(value: string): string {
  return value.trim().toLowerCase();
}

function buildCandidateKey(entryType: SuperlativeEntryType, entryId: string): string {
  return `${entryType}:${entryId}`;
}

function rankSavedMatch(query: string, title: string): number {
  const q = normalizeText(query);
  const t = normalizeText(title);
  if (!q) return 1;
  if (t === q) return 1000;
  if (t.startsWith(q)) return 700;
  const idx = t.indexOf(q);
  if (idx >= 0) return 500 - idx;
  let qi = 0;
  for (let i = 0; i < t.length && qi < q.length; i += 1) {
    if (t[i] === q[qi]) qi += 1;
  }
  return qi === q.length ? 200 : -1;
}

function parseYearLabel(releaseDate?: string): string | undefined {
  if (!releaseDate) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(releaseDate)) return releaseDate.slice(0, 4);
  if (/^\d{4}/.test(releaseDate)) return releaseDate.slice(0, 4);
  return undefined;
}

function pushCandidateIfNew(
  out: Map<string, SuperlativeEntryCandidate>,
  candidate: SuperlativeEntryCandidate
): void {
  if (!out.has(candidate.key)) out.set(candidate.key, candidate);
}

export function buildSavedSuperlativeCandidates(params: {
  moviesByClass: Record<string, MovieShowItem[]>;
  tvByClass: Record<string, MovieShowItem[]>;
  peopleByClass: Record<string, PersonItem[]>;
  directorsByClass?: Record<string, DirectorItem[]>;
}): SuperlativeEntryCandidate[] {
  const out = new Map<string, SuperlativeEntryCandidate>();

  for (const list of Object.values(params.moviesByClass)) {
    for (const movie of list ?? []) {
      if (!movie.id || !movie.title) continue;
      const key = buildCandidateKey('movie', movie.id);
      pushCandidateIfNew(out, {
        key,
        source: 'saved',
        entryType: 'movie',
        entryId: movie.id,
        title: movie.title,
        posterPath: movie.posterPath,
        releaseDate: movie.releaseDate,
        subtitle: parseYearLabel(movie.releaseDate),
        tmdbId: movie.tmdbId,
      });
    }
  }

  for (const list of Object.values(params.tvByClass)) {
    for (const show of list ?? []) {
      if (!show.id || !show.title) continue;
      const key = buildCandidateKey('tv', show.id);
      pushCandidateIfNew(out, {
        key,
        source: 'saved',
        entryType: 'tv',
        entryId: show.id,
        title: show.title,
        posterPath: show.posterPath,
        releaseDate: show.releaseDate,
        subtitle: parseYearLabel(show.releaseDate),
        tmdbId: show.tmdbId,
      });
    }
  }

  for (const list of Object.values(params.peopleByClass)) {
    for (const person of list ?? []) {
      if (!person.id || !person.title) continue;
      const key = buildCandidateKey('person', person.id);
      pushCandidateIfNew(out, {
        key,
        source: 'saved',
        entryType: 'person',
        entryId: person.id,
        title: person.title,
        posterPath: person.profilePath,
        subtitle: person.knownForDepartment,
        tmdbId: person.tmdbId,
      });
    }
  }

  for (const list of Object.values(params.directorsByClass ?? {})) {
    for (const director of list ?? []) {
      if (!director.id || !director.title) continue;
      const key = buildCandidateKey('person', director.id);
      pushCandidateIfNew(out, {
        key,
        source: 'saved',
        entryType: 'person',
        entryId: director.id,
        title: director.title,
        posterPath: director.profilePath,
        subtitle: director.knownForDepartment ?? 'Director',
        tmdbId: director.tmdbId,
      });
    }
  }

  return Array.from(out.values());
}

export function filterSavedSuperlativeCandidates(
  savedCandidates: SuperlativeEntryCandidate[],
  queryText: string,
  limit = 40
): SuperlativeEntryCandidate[] {
  const query = queryText.trim();
  if (!query) return savedCandidates.slice(0, limit);

  return savedCandidates
    .map((candidate) => ({
      candidate,
      score: rankSavedMatch(query, candidate.title),
    }))
    .filter((row) => row.score >= 0)
    .sort((a, b) => b.score - a.score || a.candidate.title.localeCompare(b.candidate.title))
    .slice(0, limit)
    .map((row) => row.candidate);
}

function mapTmdbResultToCandidate(result: TmdbMultiResult): SuperlativeEntryCandidate | null {
  const mediaType = result.media_type;
  if (mediaType !== 'movie' && mediaType !== 'tv' && mediaType !== 'person') return null;
  const entryType: SuperlativeEntryType = mediaType;
  const entryId = `tmdb-${mediaType}-${result.id}`;
  return {
    key: buildCandidateKey(entryType, entryId),
    source: 'tmdb',
    entryType,
    entryId,
    title: result.title,
    posterPath: result.poster_path ?? result.profile_path,
    releaseDate: result.release_date,
    subtitle: result.subtitle,
    tmdbId: result.id,
  };
}

export async function searchSuperlativeCandidates(
  queryText: string,
  savedCandidates: SuperlativeEntryCandidate[],
  signal?: AbortSignal
): Promise<{ saved: SuperlativeEntryCandidate[]; tmdb: SuperlativeEntryCandidate[] }> {
  const query = queryText.trim();
  const saved = filterSavedSuperlativeCandidates(savedCandidates, query);

  if (!query) {
    return { saved, tmdb: [] };
  }

  const remote = await tmdbSearchMulti(query, signal);
  const savedKeySet = new Set(savedCandidates.map((candidate) => candidate.key));
  const tmdb = remote
    .map(mapTmdbResultToCandidate)
    .filter((item): item is SuperlativeEntryCandidate => Boolean(item))
    .filter((item) => !savedKeySet.has(item.key))
    .slice(0, 40);

  return { saved, tmdb };
}
