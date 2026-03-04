export type TmdbMovieResult = {
  id: number;
  title: string;
  release_date?: string;
  poster_path?: string;
  popularity?: number;
};

/** Unified result from search/multi: movies, TV shows, and people in one list (TMDB order = relevance). */
export type TmdbMultiResult = {
  media_type: 'movie' | 'tv' | 'person';
  id: number;
  title: string;
  subtitle: string;
  poster_path?: string;
  profile_path?: string;
  popularity?: number;
  release_date?: string;
};

type TmdbSearchMovieResponse = {
  results: TmdbMovieResult[];
};

type TmdbMultiResponse = {
  results: Array<{
    media_type: string;
    id: number;
    title?: string;
    name?: string;
    release_date?: string;
    first_air_date?: string;
    poster_path?: string | null;
    profile_path?: string | null;
    popularity?: number;
    known_for?: Array<{ title?: string; name?: string }>;
  }>;
};

const TMDB_BASE = 'https://api.themoviedb.org/3';
const IMAGE_BASE = 'https://image.tmdb.org/t/p';

function getReadToken() {
  const token = import.meta.env.VITE_TMDB_READ_TOKEN as string | undefined;
  return token?.trim() ? token.trim() : null;
}

function authHeaders(): HeadersInit {
  const token = getReadToken();
  if (!token) throw new Error('Missing VITE_TMDB_READ_TOKEN (set it in a local .env file)');
  return { Authorization: `Bearer ${token}`, Accept: 'application/json' };
}

/** Poster or profile image URL (w200 for list thumbnails). */
export function tmdbImagePath(path: string | null | undefined, size = 'w200'): string | null {
  if (!path) return null;
  return `${IMAGE_BASE}/${size}${path}`;
}

export async function tmdbSearchMovies(query: string, signal?: AbortSignal) {
  const url = new URL(`${TMDB_BASE}/search/movie`);
  url.searchParams.set('query', query);
  url.searchParams.set('include_adult', 'false');
  url.searchParams.set('language', 'en-US');
  url.searchParams.set('page', '1');

  const res = await fetch(url.toString(), { method: 'GET', headers: authHeaders(), signal });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`TMDB error ${res.status}: ${text || res.statusText}`);
  }
  const data = (await res.json()) as TmdbSearchMovieResponse;
  return data.results ?? [];
}

/** Multi search (movies + TV + people). Returns results in TMDB order (relevance/popularity). */
export async function tmdbSearchMulti(query: string, signal?: AbortSignal): Promise<TmdbMultiResult[]> {
  const url = new URL(`${TMDB_BASE}/search/multi`);
  url.searchParams.set('query', query);
  url.searchParams.set('include_adult', 'false');
  url.searchParams.set('language', 'en-US');
  url.searchParams.set('page', '1');

  const res = await fetch(url.toString(), { method: 'GET', headers: authHeaders(), signal });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`TMDB error ${res.status}: ${text || res.statusText}`);
  }
  const data = (await res.json()) as TmdbMultiResponse;
  const list = data.results ?? [];

  return list
    .filter((r) => r.media_type === 'movie' || r.media_type === 'tv' || r.media_type === 'person')
    .map((r) => {
      const title = r.title ?? r.name ?? 'Unknown';
      let subtitle = '';
      if (r.media_type === 'movie' && r.release_date) {
        subtitle = r.release_date.slice(0, 4);
      } else if (r.media_type === 'tv' && r.first_air_date) {
        subtitle = r.first_air_date.slice(0, 4);
      } else if (r.media_type === 'person') {
        const known = r.known_for?.[0];
        subtitle = known?.title ?? known?.name ?? 'Actor';
      }
      return {
        media_type: r.media_type as 'movie' | 'tv' | 'person',
        id: r.id,
        title,
        subtitle,
        poster_path: r.poster_path ?? undefined,
        profile_path: r.profile_path ?? undefined,
        popularity: r.popularity,
        release_date: r.release_date ?? r.first_air_date ?? undefined
      };
    });
}

/** Fetch movie details (e.g. runtime). */
export async function tmdbMovieDetails(movieId: number, signal?: AbortSignal): Promise<{ runtime?: number }> {
  const url = `${TMDB_BASE}/movie/${movieId}`;
  const res = await fetch(url, { method: 'GET', headers: authHeaders(), signal });
  if (!res.ok) return {};
  const data = (await res.json()) as { runtime?: number };
  return { runtime: data.runtime };
}

