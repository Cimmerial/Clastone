export type TmdbImageSize = 'w45' | 'w92' | 'w154' | 'w185' | 'w300' | 'w500' | 'original';

export type TmdbRefreshableItem = {
  tmdbId?: number;
  releaseDate?: string;
  runtimeMinutes?: number;
  posterPath?: string;
  overview?: string;
  cast?: any[];
  directors?: any[];
  totalEpisodes?: number;
  totalSeasons?: number;
  genres?: string[];
};

export function needsMovieRefresh(item: TmdbRefreshableItem): boolean {
  return (
    item.tmdbId == null ||
    item.releaseDate == null ||
    item.runtimeMinutes == null ||
    item.posterPath == null ||
    item.overview == null ||
    item.cast == null ||
    item.directors == null ||
    item.genres == null
  );
}

export function needsTvRefresh(item: TmdbRefreshableItem): boolean {
  return (
    item.tmdbId == null ||
    item.releaseDate == null ||
    item.posterPath == null ||
    item.overview == null ||
    item.cast == null ||
    item.directors == null ||
    item.totalEpisodes == null ||
    item.totalSeasons == null ||
    item.runtimeMinutes == null ||
    item.genres == null
  );
}

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

export type TmdbWatchProvider = {
  display_priority: number;
  logo_path: string;
  provider_id: number;
  provider_name: string;
};

export type TmdbWatchProvidersResponse = {
  id: number;
  results: {
    [countryCode: string]: {
      link: string;
      flatrate?: TmdbWatchProvider[];
      rent?: TmdbWatchProvider[];
      buy?: TmdbWatchProvider[];
      ads?: TmdbWatchProvider[];
    };
  };
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

async function tmdbGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${TMDB_BASE}${path}`, { method: 'GET', headers: authHeaders(), signal });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`TMDB error ${res.status}: ${text || res.statusText}`);
  }
  return (await res.json()) as T;
}

/** Poster or profile image URL (w200 for list thumbnails). */
export function tmdbImagePath(path: string | null | undefined, size: TmdbImageSize = 'w185'): string | null {
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
  const list = data.results ?? [];
  return list.map(r => ({
    media_type: 'movie' as const,
    id: r.id,
    title: r.title ?? 'Unknown',
    subtitle: r.release_date ? r.release_date.slice(0, 4) : '',
    poster_path: r.poster_path ?? undefined,
    popularity: r.popularity,
    release_date: r.release_date ?? undefined
  }));
}

export async function tmdbSearchTv(query: string, signal?: AbortSignal): Promise<TmdbMultiResult[]> {
  const url = new URL(`${TMDB_BASE}/search/tv`);
  url.searchParams.set('query', query);
  url.searchParams.set('include_adult', 'false');
  url.searchParams.set('language', 'en-US');
  url.searchParams.set('page', '1');

  const res = await fetch(url.toString(), { method: 'GET', headers: authHeaders(), signal });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`TMDB error ${res.status}: ${text || res.statusText}`);
  }
  const data = (await res.json()) as { results?: any[] };
  const list = data.results ?? [];
  return list.map(r => ({
    media_type: 'tv' as const,
    id: r.id,
    title: r.name ?? 'Unknown',
    subtitle: r.first_air_date ? r.first_air_date.slice(0, 4) : '',
    poster_path: r.poster_path ?? undefined,
    popularity: r.popularity,
    release_date: r.first_air_date ?? undefined
  }));
}

export async function tmdbSearchPeople(query: string, signal?: AbortSignal): Promise<TmdbMultiResult[]> {
  const url = new URL(`${TMDB_BASE}/search/person`);
  url.searchParams.set('query', query);
  url.searchParams.set('include_adult', 'false');
  url.searchParams.set('language', 'en-US');
  url.searchParams.set('page', '1');

  const res = await fetch(url.toString(), { method: 'GET', headers: authHeaders(), signal });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`TMDB error ${res.status}: ${text || res.statusText}`);
  }
  const data = (await res.json()) as { results?: any[] };
  const list = data.results ?? [];
  return list.map(r => {
    const known = r.known_for?.[0];
    const subtitle = known?.title ?? known?.name ?? 'Actor';
    return {
      media_type: 'person' as const,
      id: r.id,
      title: r.name ?? 'Unknown',
      subtitle,
      profile_path: r.profile_path ?? undefined,
      popularity: r.popularity
    };
  });
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
export async function tmdbMovieDetails(
  movieId: number,
  signal?: AbortSignal
): Promise<{ runtime?: number }> {
  const url = `${TMDB_BASE}/movie/${movieId}`;
  const res = await fetch(url, { method: 'GET', headers: authHeaders(), signal });
  if (!res.ok) return {};
  const data = (await res.json()) as { runtime?: number };
  return { runtime: data.runtime };
}

/** Cached movie data we store on each entry so we don't need to re-fetch. */
export type TmdbMovieCache = {
  tmdbId: number;
  title: string;
  posterPath?: string;
  backdropPath?: string;
  overview?: string;
  releaseDate?: string;
  runtimeMinutes?: number;
  genres: string[];
  cast: Array<{ id: number; name: string; character?: string; profilePath?: string }>;
  directors: Array<{ id: number; name: string; profilePath?: string }>;
};

/** Cached TV data we store on each entry so we don't need to re-fetch. */
export type TmdbTvCache = {
  tmdbId: number;
  title: string;
  posterPath?: string;
  backdropPath?: string;
  overview?: string;
  releaseDate?: string;
  lastAirDate?: string;
  totalSeasons?: number;
  totalEpisodes?: number;
  /** Approximate episode runtime (minutes) if provided by TMDB. */
  episodeRuntimeMinutes?: number;
  /** Approximate total runtime for this instance (episode runtime * total episodes). */
  runtimeMinutes?: number;
  genres: string[];
  cast: Array<{ id: number; name: string; character?: string; profilePath?: string }>;
  creators: Array<{ id: number; name: string; profilePath?: string }>;
  seasons: Array<{ seasonNumber: number; episodeCount?: number; airDate?: string }>;
};

/** Cached person data including their roles in movies and shows. */
export type TmdbPersonCache = {
  tmdbId: number;
  name: string;
  profilePath?: string;
  birthday?: string;
  deathday?: string;
  biography?: string;
  knownForDepartment?: string;
  /** Roles from combined_credits, sorted by popularity. */
  roles: Array<{
    id: number;
    title: string;
    mediaType: 'movie' | 'tv';
    character?: string;
    job?: string;
    posterPath?: string;
    popularity: number;
    voteCount?: number;
    releaseDate?: string;
  }>;
};

type TmdbMovieDetailsResponse = {
  id: number;
  title?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  overview?: string | null;
  release_date?: string | null;
  runtime?: number | null;
  genres?: Array<{ id: number; name: string }>;
  credits?: {
    cast?: Array<{ id: number; name?: string; character?: string; profile_path?: string | null }>;
    crew?: Array<{ id: number; name?: string; job?: string; profile_path?: string | null }>;
  };
};

type TmdbTvDetailsResponse = {
  id: number;
  name?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  overview?: string | null;
  first_air_date?: string | null;
  last_air_date?: string | null;
  number_of_seasons?: number | null;
  number_of_episodes?: number | null;
  episode_run_time?: number[] | null;
  created_by?: Array<{ id: number; name?: string; profile_path?: string | null }>;
  seasons?: Array<{ season_number: number; episode_count?: number; air_date?: string | null }>;
  genres?: Array<{ id: number; name: string }>;
  aggregate_credits?: {
    cast?: Array<{ id: number; name?: string; profile_path?: string | null; roles?: Array<{ character?: string }> }>;
  };
  credits?: {
    cast?: Array<{ id: number; name?: string; character?: string; profile_path?: string | null }>;
  };
};

type TmdbTvSeasonResponse = {
  id: number;
  season_number: number;
  episodes?: Array<{ runtime?: number | null }>;
};

async function tmdbTvRuntimeFromSeasons(
  tvId: number,
  seasonNumbers: number[],
  signal?: AbortSignal
): Promise<{ totalRuntimeMinutes?: number; episodeRuntimeMinutes?: number }> {
  if (seasonNumbers.length === 0) return {};
  const seasons = await Promise.all(
    seasonNumbers.map((n) => tmdbGet<TmdbTvSeasonResponse>(`/tv/${tvId}/season/${n}`, signal))
  );
  const episodes = seasons.flatMap((s) => s.episodes ?? []);
  const total = episodes.reduce((sum, ep) => sum + (ep.runtime ?? 0), 0);
  if (total <= 0 || episodes.length === 0) return {};
  const avg = Math.round(total / episodes.length);
  return { totalRuntimeMinutes: total, episodeRuntimeMinutes: avg };
}

/** Fetch full movie details + credits for caching on the entry. One API call. */
export async function tmdbMovieDetailsFull(
  movieId: number,
  signal?: AbortSignal
): Promise<TmdbMovieCache | null> {
  const url = `${TMDB_BASE}/movie/${movieId}?append_to_response=credits`;
  const res = await fetch(url, { method: 'GET', headers: authHeaders(), signal });
  if (!res.ok) return null;
  const data = (await res.json()) as TmdbMovieDetailsResponse;
  const cast = (data.credits?.cast ?? [])
    .slice(0, 20)
    .map((c) => ({ id: c.id, name: c.name ?? '', character: c.character ?? undefined, profilePath: c.profile_path ?? undefined }));
  const directors = (data.credits?.crew ?? [])
    .filter((c) => c.job === 'Director')
    .map((c) => ({ id: c.id, name: c.name ?? '', profilePath: c.profile_path ?? undefined }));
  const cache: TmdbMovieCache = {
    tmdbId: data.id,
    title: data.title ?? '',
    posterPath: data.poster_path ?? undefined,
    backdropPath: data.backdrop_path ?? undefined,
    overview: data.overview ?? undefined,
    releaseDate: data.release_date ?? undefined,
    runtimeMinutes: data.runtime ?? undefined,
    genres: (data.genres ?? []).map((g) => g.name),
    cast,
    directors
  };
  console.info('[Clastone] TMDB cache fetched', {
    tmdbId: cache.tmdbId,
    title: cache.title
  });
  return cache;
}

/** Fetch full TV details + credits for caching on the entry. One API call. */
export async function tmdbTvDetailsFull(
  tvId: number,
  signal?: AbortSignal
): Promise<TmdbTvCache | null> {
  const data = await tmdbGet<TmdbTvDetailsResponse>(`/tv/${tvId}?append_to_response=aggregate_credits`, signal).catch(
    () => null
  );
  if (!data) return null;
  const castFromAggregate = (data.aggregate_credits?.cast ?? []).slice(0, 20).map((c) => ({
    id: c.id,
    name: c.name ?? '',
    character: c.roles?.[0]?.character ?? undefined,
    profilePath: c.profile_path ?? undefined
  }));
  const castFromCredits = (data.credits?.cast ?? []).slice(0, 20).map((c) => ({
    id: c.id,
    name: c.name ?? '',
    character: c.character ?? undefined,
    profilePath: c.profile_path ?? undefined
  }));
  const cast = castFromAggregate.length > 0 ? castFromAggregate : castFromCredits;
  const creators = (data.created_by ?? []).map((c) => ({
    id: c.id,
    name: c.name ?? '',
    profilePath: c.profile_path ?? undefined
  }));
  const seasonNumbers = (data.seasons ?? [])
    .map((s) => s.season_number ?? 0)
    .filter((n) => n > 0);
  const episodeRuntimeMinutes = data.episode_run_time?.[0] ?? undefined;
  const totalEpisodes = data.number_of_episodes ?? undefined;
  let runtimeMinutes =
    episodeRuntimeMinutes && totalEpisodes ? episodeRuntimeMinutes * totalEpisodes : undefined;
  let effectiveEpisodeRuntime = episodeRuntimeMinutes;
  if ((runtimeMinutes == null || runtimeMinutes === 0) && seasonNumbers.length > 0) {
    try {
      const seasonRuntime = await tmdbTvRuntimeFromSeasons(tvId, seasonNumbers, signal);
      if (seasonRuntime.totalRuntimeMinutes != null) runtimeMinutes = seasonRuntime.totalRuntimeMinutes;
      if (seasonRuntime.episodeRuntimeMinutes != null) effectiveEpisodeRuntime = seasonRuntime.episodeRuntimeMinutes;
    } catch {
      /* ignore */
    }
  }
  const seasons =
    (data.seasons ?? [])
      .filter((s) => (s.season_number ?? 0) > 0)
      .map((s) => ({
        seasonNumber: s.season_number,
        episodeCount: s.episode_count ?? undefined,
        airDate: s.air_date ?? undefined
      })) ?? [];

  const cache: TmdbTvCache = {
    tmdbId: data.id,
    title: data.name ?? '',
    posterPath: data.poster_path ?? undefined,
    backdropPath: data.backdrop_path ?? undefined,
    overview: data.overview ?? undefined,
    releaseDate: data.first_air_date ?? undefined,
    lastAirDate: data.last_air_date ?? undefined,
    totalSeasons: data.number_of_seasons ?? undefined,
    totalEpisodes,
    episodeRuntimeMinutes: effectiveEpisodeRuntime,
    runtimeMinutes,
    genres: (data.genres ?? []).map((g) => g.name),
    cast,
    creators,
    seasons
  };
  console.info('[Clastone] TMDB TV cache fetched', {
    tmdbId: cache.tmdbId,
    title: cache.title,
    episodeRuntimeMinutes: cache.episodeRuntimeMinutes,
    totalEpisodes: cache.totalEpisodes,
    runtimeMinutes: cache.runtimeMinutes
  });
  return cache;
}

export async function tmdbPersonDetailsFull(
  personId: number,
  signal?: AbortSignal
): Promise<TmdbPersonCache | null> {
  const data = await tmdbGet<any>(`/person/${personId}?append_to_response=combined_credits`, signal).catch(
    () => null
  );
  if (!data) return null;

  const rawCast = data.combined_credits?.cast ?? [];
  const rawCrew = data.combined_credits?.crew ?? [];

  const relevantCrewJobs = new Set(['Director', 'Creator', 'Writer', 'Executive Producer', 'Producer']);

  // Map cast roles
  const castRoles = rawCast.map((c: any) => ({
    id: c.id,
    title: c.title ?? c.name ?? 'Unknown',
    mediaType: c.media_type as 'movie' | 'tv',
    character: c.character ?? undefined,
    job: undefined,
    posterPath: c.poster_path ?? undefined,
    popularity: c.popularity ?? 0,
    voteCount: c.vote_count ?? 0,
    releaseDate: c.release_date ?? c.first_air_date ?? undefined
  }));

  // Map crew roles, filtering for specific jobs
  const crewRoles = rawCrew
    .filter((c: any) => relevantCrewJobs.has(c.job))
    .map((c: any) => ({
      id: c.id,
      title: c.title ?? c.name ?? 'Unknown',
      mediaType: c.media_type as 'movie' | 'tv',
      character: undefined,
      job: c.job as string,
      posterPath: c.poster_path ?? undefined,
      popularity: c.popularity ?? 0,
      voteCount: c.vote_count ?? 0,
      releaseDate: c.release_date ?? c.first_air_date ?? undefined
    }));

  // Combine and deduplicate
  // Strategy: Group by mediaType + id. 
  // If multiple exist, combine character and job text. Maintain max popularity.
  const rolesMap = new Map<string, any>();

  for (const r of [...castRoles, ...crewRoles]) {
    const key = `${r.mediaType}-${r.id}`;
    if (!rolesMap.has(key)) {
      rolesMap.set(key, { ...r });
    } else {
      const existing = rolesMap.get(key);
      if (r.character && !existing.character) existing.character = r.character;
      else if (r.character && existing.character && !existing.character.includes(r.character)) {
        existing.character = `${existing.character} / ${r.character}`;
      }

      if (r.job && !existing.job) existing.job = r.job;
      else if (r.job && existing.job && !existing.job.includes(r.job)) {
        existing.job = `${existing.job} / ${r.job}`;
      }

      existing.popularity = Math.max(existing.popularity, r.popularity);
      existing.voteCount = Math.max(existing.voteCount ?? 0, r.voteCount ?? 0);
    }
  }

  const roles = Array.from(rolesMap.values()).sort((a: any, b: any) => {
    const scoreA = (a.popularity || 0) * (a.voteCount || 0);
    const scoreB = (b.popularity || 0) * (b.voteCount || 0);
    return scoreB - scoreA;
  });

  const cache: TmdbPersonCache = {
    tmdbId: data.id,
    name: data.name ?? '',
    profilePath: data.profile_path ?? undefined,
    birthday: data.birthday ?? undefined,
    deathday: data.deathday ?? undefined,
    biography: data.biography ?? undefined,
    knownForDepartment: data.known_for_department ?? undefined,
    roles
  };

  console.info('[Clastone] TMDB person cache fetched', {
    tmdbId: cache.tmdbId,
    name: cache.name,
    knownForDepartment: cache.knownForDepartment,
    rolesCount: cache.roles.length
  });
  return cache;
}

/** Fetch watch providers for a movie or TV show. */
export async function tmdbWatchProviders(
  id: number,
  mediaType: 'movie' | 'tv',
  signal?: AbortSignal
): Promise<TmdbWatchProvidersResponse | null> {
  return tmdbGet<TmdbWatchProvidersResponse>(`/${mediaType}/${id}/watch/providers`, signal).catch(
    () => null
  );
}

