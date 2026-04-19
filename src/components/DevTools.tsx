import { useEffect, useMemo, useState } from 'react';
import {
  tmdbMovieDetailsFull,
  tmdbMovieProbeByTitleYear,
  tmdbTvDetailsFull,
  type TmdbMovieCache,
  type TmdbTvCache,
  needsMovieRefresh,
  needsTvRefresh
} from '../lib/tmdb';
import { useMoviesStore } from '../state/moviesStore';
import { useTvStore } from '../state/tvStore';
import { usePeopleStore } from '../state/peopleStore';
import { tmdbPersonDetailsFull } from '../lib/tmdb';
import type { MovieShowItem } from './EntryRowMovieShow';
import type { ClassKey } from './RankedList';
import { useAuth } from '../context/AuthContext';
import { db } from '../lib/firebase';
import './DevTools.css';
import { collection, doc, getDoc, getDocs } from 'firebase/firestore';
import { useListsStore } from '../state/listsStore';
import { upsertGlobalCollection, type CollectionEntry } from '../lib/firestoreCollections';

export function DevTools() {
  const { isAdmin, user } = useAuth();
  const { byClass: moviesByClass, classOrder: movieClassOrder, updateBatchMovieCache, classes: movieClasses } = useMoviesStore();
  const { byClass: tvByClass, classOrder: tvClassOrder, updateBatchShowCache, classes: tvClasses } = useTvStore();
  const { byClass: peopleByClass, forceRefreshPerson } = usePeopleStore();
  const [open, setOpen] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [isDumping, setIsDumping] = useState(false);
  const [isStudioScanRunning, setIsStudioScanRunning] = useState(false);
  const [isBulkA24Running, setIsBulkA24Running] = useState(false);
  const [isBulkNeonRunning, setIsBulkNeonRunning] = useState(false);
  const [isNeonDumpRunning, setIsNeonDumpRunning] = useState(false);
  const [isNeonLeasedImportRunning, setIsNeonLeasedImportRunning] = useState(false);
  const [isRepairingCollection, setIsRepairingCollection] = useState(false);
  const [isOrderingCollection, setIsOrderingCollection] = useState(false);
  const [isRemovingUnknownReleaseDates, setIsRemovingUnknownReleaseDates] = useState(false);
  const [neonLeasedReport, setNeonLeasedReport] = useState<{
    matched: Array<{ queryTitle: string; tmdbId: number; tmdbTitle: string; releaseDate?: string }>;
    unmatched: string[];
  } | null>(null);
  const [studioScanMatches, setStudioScanMatches] = useState<Array<{ id: string; title: string; studio: 'A24' | 'NEON'; tmdbId: number }>>([]);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const { globalCollections, upsertGlobalCollection: upsertCollectionInStore } = useListsStore();
  const [quickCollectionId, setQuickCollectionId] = useState<string>(() => localStorage.getItem('dev_quick_collection_id') ?? '');
  const [quickAddDirection, setQuickAddDirection] = useState<'top' | 'bottom'>(() => {
    const saved = localStorage.getItem('dev_quick_collection_direction');
    return saved === 'bottom' ? 'bottom' : 'top';
  });
  const [hamnetProbeJson, setHamnetProbeJson] = useState<string | null>(null);
  const [hamnetProbeLoading, setHamnetProbeLoading] = useState(false);

  const quickCollectionOptions = useMemo(
    () => globalCollections.map((collection) => ({ id: collection.id, name: collection.name })),
    [globalCollections]
  );
  const movieItems = useMemo(() => {
    const out: Array<{ classKey: ClassKey; item: MovieShowItem }> = [];
    for (const classKey of movieClassOrder) {
      const list = moviesByClass[classKey] ?? [];
      for (const item of list) out.push({ classKey, item });
    }
    return out;
  }, [moviesByClass, movieClassOrder]);

  const tvItems = useMemo(() => {
    const out: Array<{ classKey: ClassKey; item: MovieShowItem }> = [];
    for (const classKey of tvClassOrder) {
      const list = tvByClass[classKey] ?? [];
      for (const item of list) out.push({ classKey, item });
    }
    return out;
  }, [tvByClass, tvClassOrder]);

  const peopleCount = useMemo(() => Object.values(peopleByClass).flat().length, [peopleByClass]);

  const refreshableMovies = useMemo(
    () => movieItems.filter(({ item }) => needsMovieRefresh(item)),
    [movieItems]
  );
  const refreshableTv = useMemo(
    () => tvItems.filter(({ item }) => needsTvRefresh(item)),
    [tvItems]
  );
  const totalRefresh = refreshableMovies.length + refreshableTv.length;

  const handleRefresh = async (force: boolean = false) => {
    setIsRunning(true);
    setLastError(null);
    const moviesToProcess = force ? movieItems : refreshableMovies;
    const tvToProcess = force ? tvItems : refreshableTv;
    const totalCount = moviesToProcess.length + tvToProcess.length;
    setProgress({ done: 0, total: totalCount });

    console.info('[Clastone] DEV refresh start', {
      movies: moviesToProcess.length,
      tv: tvToProcess.length,
      total: totalCount,
      force
    });
    try {
      let done = 0;
      const CHUNK_SIZE = 25;

      // 1. Process Movies
      let movieBatch: Record<string, Partial<TmdbMovieCache>> = {};
      for (const { item } of moviesToProcess) {
        const tmdbId = item.tmdbId;
        let cache: TmdbMovieCache | null = null;
        if (tmdbId == null) {
          const m = item.id.match(/^tmdb-movie-(\d+)$/);
          if (m) {
            const parsed = Number(m[1]);
            cache = await tmdbMovieDetailsFull(parsed);
          }
        } else {
          cache = await tmdbMovieDetailsFull(tmdbId);
        }

        if (cache) {
          movieBatch[item.id] = cache;
        }

        done += 1;
        if (done % CHUNK_SIZE === 0 || done === moviesToProcess.length) {
          if (Object.keys(movieBatch).length > 0) {
            updateBatchMovieCache(movieBatch);
            movieBatch = {};
          }
          setProgress({ done, total: totalCount });
        }
      }

      // 2. Process TV
      let tvBatch: Record<string, Partial<TmdbTvCache>> = {};
      const tvStartDone = done;
      for (const { item } of tvToProcess) {
        const tmdbId = item.tmdbId;
        let parsed: number | null = tmdbId ?? null;
        if (parsed == null) {
          const m = item.id.match(/^tmdb-tv-(\d+)$/);
          parsed = m ? Number(m[1]) : null;
        }
        const id = parsed != null && !Number.isNaN(parsed) ? parsed : undefined;
        let cache: TmdbTvCache | null = null;
        if (id !== undefined) {
          cache = await tmdbTvDetailsFull(id);
        }

        if (cache) {
          tvBatch[item.id] = cache;
        }

        done += 1;
        const tvDoneCount = done - tvStartDone;
        if (tvDoneCount % CHUNK_SIZE === 0 || tvDoneCount === tvToProcess.length) {
          if (Object.keys(tvBatch).length > 0) {
            updateBatchShowCache(tvBatch);
            tvBatch = {};
          }
          setProgress({ done, total: totalCount });
        }
      }
    } catch (e) {
      setLastError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsRunning(false);
      console.info('[Clastone] DEV refresh end');
    }
  };

  const handleRefreshPeople = async () => {
    setIsRunning(true);
    setLastError(null);
    const people = Object.values(peopleByClass).flat();
    setProgress({ done: 0, total: people.length });

    try {
      let done = 0;
      for (const p of people) {
        if (!p.tmdbId) {
          done++;
          continue;
        }
        await forceRefreshPerson(p.id);
        done += 1;
        setProgress({ done, total: people.length });
      }
    } catch (e) {
      setLastError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsRunning(false);
    }
  };

  const dumpClassPersistence = async () => {
    const firestoreDb = db;
    if (!user?.uid || !firestoreDb) return;
    setIsDumping(true);
    try {
      const uid = user.uid;

      const summarizeLocal = (name: string, classes: any[], byClass: Record<string, MovieShowItem[]>, classOrder: string[]) => {
        const byClassKeys = Object.keys(byClass);
        const emptyKeys = byClassKeys.filter((k) => (byClass[k] ?? []).length === 0);
        const nonEmptyKeys = byClassKeys.filter((k) => (byClass[k] ?? []).length > 0);
        const labelGroups = classes.reduce<Record<string, number>>((acc, c) => {
          const label = c?.label ?? '';
          acc[label] = (acc[label] ?? 0) + 1;
          return acc;
        }, {});
        const dupLabels = Object.entries(labelGroups)
          .filter(([, count]) => count > 1)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 20);

        console.info(`[DEV dump] ${name} local summary`, {
          classesCount: classes.length,
          classesKeys: classes.map((c) => c.key),
          classOrder,
          byClassKeysCount: byClassKeys.length,
          nonEmptyKeysCount: nonEmptyKeys.length,
          emptyKeysCount: emptyKeys.length,
          emptyKeys: emptyKeys.slice(0, 100),
          dupLabels
        });
      };

      summarizeLocal('movies', movieClasses, moviesByClass, movieClassOrder);
      summarizeLocal('tv', tvClasses, tvByClass, tvClassOrder);

      const dumpFirestoreStore = async (label: string, rootCollection: string) => {
        // rootCollection examples: "movieData" and "tvData"
        const metadataRef = doc(firestoreDb, 'users', uid, rootCollection, 'metadata');
        const metadataSnap = await getDoc(metadataRef);
        const metadata = metadataSnap.exists() ? (metadataSnap.data() as any) : null;
        console.info(`[DEV dump] ${label} firestore metadata`, {
          exists: metadataSnap.exists(),
          classes: metadata?.classes?.map((c: any) => ({ key: c.key, label: c.label, isRanked: c.isRanked })) ?? []
        });

        const colRef = collection(firestoreDb, 'users', uid, rootCollection);
        const docsSnap = await getDocs(colRef);
        const classDocs = docsSnap.docs
          .filter((d) => d.id.startsWith('class_'))
          .map((d) => ({
            id: d.id,
            key: d.id.replace('class_', ''),
            itemsCount: (d.data() as any)?.items?.length ?? 0
          }))
          .sort((a, b) => b.itemsCount - a.itemsCount);

        console.info(`[DEV dump] ${label} firestore class_* docs`, {
          totalClassDocs: classDocs.length,
          topByItemsCount: classDocs.slice(0, 50),
          emptyClassDocs: classDocs.filter((x) => x.itemsCount === 0).slice(0, 200),
          hint: 'If you deleted a class in UI but it still appears on reload, it is likely because class_* docs still exist in Firestore.'
        });
      };

      await dumpFirestoreStore('movies', 'movieData');
      await dumpFirestoreStore('tv', 'tvData');
    } catch (e) {
      console.error('[DEV dump] Failed', e);
    } finally {
      setIsDumping(false);
    }
  };

  const scanForNeonA24Movies = async () => {
    setIsStudioScanRunning(true);
    setLastError(null);
    setStudioScanMatches([]);
    try {
      const token = import.meta.env.VITE_TMDB_READ_TOKEN as string | undefined;
      if (!token) throw new Error('Missing VITE_TMDB_READ_TOKEN');
      const movieIds = movieItems
        .map(({ item }) => item.tmdbId)
        .filter((id): id is number => typeof id === 'number' && Number.isFinite(id));
      setProgress({ done: 0, total: movieIds.length });
      const matches: Array<{ id: string; title: string; studio: 'A24' | 'NEON'; tmdbId: number }> = [];

      for (let i = 0; i < movieIds.length; i += 1) {
        const tmdbId = movieIds[i];
        const res = await fetch(`https://api.themoviedb.org/3/movie/${tmdbId}`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
            accept: 'application/json'
          }
        });
        if (res.ok) {
          const data = await res.json() as {
            title?: string;
            production_companies?: Array<{ name?: string }>;
          };
          const companyNames = (data.production_companies ?? [])
            .map((c) => (c.name ?? '').trim())
            .filter(Boolean);
          const hasA24 = companyNames.some((name) => /(^|\W)A24(\W|$)/i.test(name));
          const hasNeon = companyNames.some((name) => /(^|\W)NEON(\W|$)/i.test(name));
          if (hasA24) {
            matches.push({ id: `tmdb-movie-${tmdbId}`, title: data.title ?? `Movie ${tmdbId}`, studio: 'A24', tmdbId });
          }
          if (hasNeon) {
            matches.push({ id: `tmdb-movie-${tmdbId}`, title: data.title ?? `Movie ${tmdbId}`, studio: 'NEON', tmdbId });
          }
        }
        setProgress({ done: i + 1, total: movieIds.length });
      }

      setStudioScanMatches(matches);
      console.info('[DEV studio-scan] NEON/A24 matches', matches);
    } catch (e) {
      setLastError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsStudioScanRunning(false);
    }
  };

  const sanitizeCollectionEntries = (entries: CollectionEntry[]): CollectionEntry[] =>
    entries.map((entry, idx) => ({
      tmdbId: entry.tmdbId,
      mediaType: entry.mediaType,
      position: idx,
      ...(typeof entry.title === 'string' ? { title: entry.title } : {}),
      ...(typeof entry.posterPath === 'string' ? { posterPath: entry.posterPath } : {}),
      ...(typeof entry.releaseDate === 'string' ? { releaseDate: entry.releaseDate } : {})
    }));

  const getSelectedCollection = () => {
    if (!quickCollectionId) return null;
    return globalCollections.find((collection) => collection.id === quickCollectionId) ?? null;
  };

  const saveCollectionEntries = async (baseCollection: NonNullable<ReturnType<typeof getSelectedCollection>>, entries: CollectionEntry[]) => {
    if (!db) return;
    const sanitizedEntries = sanitizeCollectionEntries(entries);
    const updatedCollection = {
      ...baseCollection,
      entries: sanitizedEntries,
      updatedAt: new Date().toISOString()
    };
    await upsertGlobalCollection(db, updatedCollection);
    upsertCollectionInStore(updatedCollection);
  };

  const addAllA24ToSelectedCollection = async () => {
    if (!db || !quickCollectionId) return;
    const targetCollection = globalCollections.find((collection) => collection.id === quickCollectionId);
    if (!targetCollection) {
      setLastError('Selected collection was not found.');
      return;
    }

    setIsBulkA24Running(true);
    setLastError(null);
    try {
      const token = import.meta.env.VITE_TMDB_READ_TOKEN as string | undefined;
      if (!token) throw new Error('Missing VITE_TMDB_READ_TOKEN');

      const tmdbGet = async <T,>(path: string): Promise<T> => {
        const res = await fetch(`https://api.themoviedb.org/3${path}`, {
          method: 'GET',
          headers: { Authorization: `Bearer ${token}`, accept: 'application/json' }
        });
        if (!res.ok) throw new Error(`TMDB request failed (${res.status}) for ${path}`);
        return res.json() as Promise<T>;
      };

      type CompanySearchResponse = { results?: Array<{ id: number; name?: string }> };
      type DiscoverMovieResult = { id: number; title?: string; poster_path?: string | null; release_date?: string | null };
      type DiscoverMoviesResponse = { page: number; total_pages: number; results?: DiscoverMovieResult[] };

      const CANONICAL_A24_COMPANY_ID = 41077;
      const companies = await tmdbGet<CompanySearchResponse>(`/search/company?query=${encodeURIComponent('A24')}`);
      const exactA24Candidates = (companies.results ?? [])
        .filter((company) => (company.name ?? '').trim().toUpperCase() === 'A24')
        .map((company) => company.id);
      const a24CompanyId = exactA24Candidates.includes(CANONICAL_A24_COMPANY_ID)
        ? CANONICAL_A24_COMPANY_ID
        : (exactA24Candidates[0] ?? CANONICAL_A24_COMPANY_ID);

      const fetched: DiscoverMovieResult[] = [];
      let page = 1;
      let totalPages = 1;
      const PAGE_CAP = 500;
      do {
        const response = await tmdbGet<DiscoverMoviesResponse>(
          `/discover/movie?with_companies=${a24CompanyId}&sort_by=release_date.desc&include_adult=false&page=${page}`
        );
        fetched.push(...(response.results ?? []));
        totalPages = Math.min(response.total_pages || 1, PAGE_CAP);
        setProgress({ done: page, total: totalPages });
        page += 1;
      } while (page <= totalPages);

      const deduped = new Map<number, DiscoverMovieResult>();
      for (const movie of fetched) deduped.set(movie.id, movie);
      const sorted = [...deduped.values()].sort((a, b) => {
        const aDate = a.release_date ?? '';
        const bDate = b.release_date ?? '';
        return bDate.localeCompare(aDate);
      });

      const existingKeys = new Set(targetCollection.entries.map((entry) => `${entry.mediaType}:${entry.tmdbId}`));
      const newEntries = sorted
        .filter((movie) => !existingKeys.has(`movie:${movie.id}`))
        .map((movie, idx) => ({
          tmdbId: movie.id,
          mediaType: 'movie' as const,
          position: idx,
          title: movie.title ?? `Movie ${movie.id}`,
          posterPath: movie.poster_path ?? undefined,
          releaseDate: movie.release_date ?? undefined
        }));

      const mergedEntries = [...newEntries, ...targetCollection.entries];
      await saveCollectionEntries(targetCollection, mergedEntries);
      console.info('[DEV] Added all A24 films to selected collection', {
        companyIdUsed: a24CompanyId,
        fetchedFromTmdb: sorted.length,
        collectionId: targetCollection.id,
        inserted: newEntries.length,
        total: mergedEntries.length
      });
    } catch (e) {
      setLastError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsBulkA24Running(false);
    }
  };

  const addAllNeonToSelectedCollection = async () => {
    if (!db || !quickCollectionId) return;
    const targetCollection = globalCollections.find((collection) => collection.id === quickCollectionId);
    if (!targetCollection) {
      setLastError('Selected collection was not found.');
      return;
    }

    setIsBulkNeonRunning(true);
    setLastError(null);
    try {
      const token = import.meta.env.VITE_TMDB_READ_TOKEN as string | undefined;
      if (!token) throw new Error('Missing VITE_TMDB_READ_TOKEN');

      const tmdbGet = async <T,>(path: string): Promise<T> => {
        const res = await fetch(`https://api.themoviedb.org/3${path}`, {
          method: 'GET',
          headers: { Authorization: `Bearer ${token}`, accept: 'application/json' }
        });
        if (!res.ok) throw new Error(`TMDB request failed (${res.status}) for ${path}`);
        return res.json() as Promise<T>;
      };

      type CompanySearchResponse = { results?: Array<{ id: number; name?: string }> };
      type DiscoverMovieResult = { id: number; title?: string; poster_path?: string | null; release_date?: string | null };
      type DiscoverMoviesResponse = { page: number; total_pages: number; results?: DiscoverMovieResult[] };

      const CANONICAL_NEON_COMPANY_ID = 3186;
      const companies = await tmdbGet<CompanySearchResponse>(`/search/company?query=${encodeURIComponent('NEON')}`);
      const exactNeonCandidates = (companies.results ?? [])
        .filter((company) => {
          const name = (company.name ?? '').trim().toUpperCase();
          return name === 'NEON' || name.startsWith('NEON ');
        })
        .map((company) => company.id);
      const neonCompanyIds = Array.from(new Set([
        CANONICAL_NEON_COMPANY_ID,
        ...exactNeonCandidates
      ]));

      const fetched: DiscoverMovieResult[] = [];
      const PAGE_CAP = 500;
      let companyProgressDone = 0;
      setProgress({ done: 0, total: neonCompanyIds.length });
      for (const companyId of neonCompanyIds) {
        let page = 1;
        let totalPages = 1;
        do {
          const response = await tmdbGet<DiscoverMoviesResponse>(
            `/discover/movie?with_companies=${companyId}&sort_by=release_date.desc&include_adult=false&page=${page}`
          );
          fetched.push(...(response.results ?? []));
          totalPages = Math.min(response.total_pages || 1, PAGE_CAP);
          page += 1;
        } while (page <= totalPages);
        companyProgressDone += 1;
        setProgress({ done: companyProgressDone, total: neonCompanyIds.length });
      }

      const deduped = new Map<number, DiscoverMovieResult>();
      for (const movie of fetched) deduped.set(movie.id, movie);
      const sorted = [...deduped.values()].sort((a, b) => {
        const aDate = a.release_date ?? '';
        const bDate = b.release_date ?? '';
        return bDate.localeCompare(aDate);
      });

      const existingKeys = new Set(targetCollection.entries.map((entry) => `${entry.mediaType}:${entry.tmdbId}`));
      const newEntries = sorted
        .filter((movie) => !existingKeys.has(`movie:${movie.id}`))
        .map((movie, idx) => ({
          tmdbId: movie.id,
          mediaType: 'movie' as const,
          position: idx,
          title: movie.title ?? `Movie ${movie.id}`,
          posterPath: movie.poster_path ?? undefined,
          releaseDate: movie.release_date ?? undefined
        }));

      const mergedEntries = [...newEntries, ...targetCollection.entries];
      await saveCollectionEntries(targetCollection, mergedEntries);
      console.info('[DEV] Added all NEON films to selected collection', {
        companyIdsUsed: neonCompanyIds,
        fetchedFromTmdb: sorted.length,
        collectionId: targetCollection.id,
        inserted: newEntries.length,
        total: mergedEntries.length
      });
    } catch (e) {
      setLastError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsBulkNeonRunning(false);
    }
  };

  const dumpNeonDiagnostics = async () => {
    setIsNeonDumpRunning(true);
    setLastError(null);
    try {
      const token = import.meta.env.VITE_TMDB_READ_TOKEN as string | undefined;
      if (!token) throw new Error('Missing VITE_TMDB_READ_TOKEN');

      const tmdbGet = async <T,>(path: string): Promise<T> => {
        const res = await fetch(`https://api.themoviedb.org/3${path}`, {
          method: 'GET',
          headers: { Authorization: `Bearer ${token}`, accept: 'application/json' }
        });
        if (!res.ok) throw new Error(`TMDB request failed (${res.status}) for ${path}`);
        return res.json() as Promise<T>;
      };

      type CompanySearchResponse = {
        page: number;
        total_pages: number;
        results?: Array<{ id: number; name?: string; origin_country?: string }>;
      };
      type DiscoverMoviesResponse = {
        page: number;
        total_pages: number;
        total_results?: number;
        results?: Array<{ id: number; title?: string; release_date?: string }>;
      };
      type MovieDetailsResponse = {
        id: number;
        title?: string;
        production_companies?: Array<{ id: number; name?: string }>;
      };

      const searchPages = await Promise.all([
        tmdbGet<CompanySearchResponse>('/search/company?query=NEON&page=1'),
        tmdbGet<CompanySearchResponse>('/search/company?query=NEON&page=2').catch(() => null),
        tmdbGet<CompanySearchResponse>('/search/company?query=NEON&page=3').catch(() => null)
      ]);
      const allResults = searchPages
        .filter((page): page is CompanySearchResponse => Boolean(page))
        .flatMap((page) => page.results ?? []);
      const neonLikeCompanies = allResults
        .filter((company) => (company.name ?? '').toUpperCase().includes('NEON'))
        .map((company) => ({ id: company.id, name: company.name ?? '', origin_country: company.origin_country ?? '' }));

      const candidateIds = Array.from(new Set([3186, ...neonLikeCompanies.map((c) => c.id)]));
      const discoverSummaries: Array<{ companyId: number; totalResults: number; sampleTitles: string[] }> = [];
      for (const companyId of candidateIds.slice(0, 15)) {
        const discover = await tmdbGet<DiscoverMoviesResponse>(
          `/discover/movie?with_companies=${companyId}&sort_by=release_date.desc&include_adult=false&page=1`
        ).catch(() => null);
        if (!discover) continue;
        discoverSummaries.push({
          companyId,
          totalResults: discover.total_results ?? 0,
          sampleTitles: (discover.results ?? []).slice(0, 5).map((r) => r.title ?? `id:${r.id}`)
        });
      }

      const parasite = await tmdbGet<MovieDetailsResponse>('/movie/496243').catch(() => null);
      const anoraSearch = await tmdbGet<DiscoverMoviesResponse>('/search/movie?query=Anora&page=1').catch(() => null);

      console.info('[DEV][NEON dump] company search NEON candidates', neonLikeCompanies);
      console.info('[DEV][NEON dump] discover summaries by company id', discoverSummaries);
      console.info('[DEV][NEON dump] parasite production companies', {
        movieId: parasite?.id,
        title: parasite?.title,
        productionCompanies: (parasite?.production_companies ?? []).map((c) => ({ id: c.id, name: c.name ?? '' }))
      });
      console.info('[DEV][NEON dump] anora search sample', {
        count: (anoraSearch?.results ?? []).length,
        items: (anoraSearch?.results ?? []).slice(0, 5).map((r) => ({ id: r.id, title: r.title, releaseDate: r.release_date }))
      });
    } catch (e) {
      setLastError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsNeonDumpRunning(false);
    }
  };

  const importNeonLeasedTitlesToSelectedCollection = async () => {
    if (!db || !quickCollectionId) return;
    const targetCollection = globalCollections.find((collection) => collection.id === quickCollectionId);
    if (!targetCollection) {
      setLastError('Selected collection was not found.');
      return;
    }
    setIsNeonLeasedImportRunning(true);
    setLastError(null);
    setNeonLeasedReport(null);
    try {
      const token = import.meta.env.VITE_TMDB_READ_TOKEN as string | undefined;
      if (!token) throw new Error('Missing VITE_TMDB_READ_TOKEN');
      const leasedTitles = [
        'Colossal', 'Risk', 'The Bad Batch', "The B-Side: Elsa Dorfman's Portrait Photography", 'Ingrid Goes West',
        'Beach Rats', 'I, Tonya', 'Gemini', 'Borg vs McEnroe', 'Revenge', 'Three Identical Strangers', 'Sharp Edges',
        'Assassination Nation', 'Monsters and Men', 'Border', 'Bodied', 'Vox Lux', 'Apollo 11', 'The Beach Bum',
        'Amazing Grace', 'Little Woods', 'The Biggest Little Farm', 'Wild Rose', 'Honeyland', 'Luce', 'Monos',
        'Little Monsters', 'Parasite', 'Portrait of a Lady on Fire', 'Clemency', 'The Lodge', 'Big Time Adolescence',
        'Spaceship Earth', 'The Painter and the Thief', 'Shirley', 'Palm Springs', 'She Dies Tomorrow', 'Possessor',
        'Totally Under Control', 'Bad Hair', 'Ammonite', 'Apollo 11: Quarantine', 'Dear Comrades!',
        'Billie Eilish: The World\'s a Little Blurry', 'Night of the Kings', 'Gunda', 'In the Earth',
        'Memories of Murder', 'The Killing of Two Lovers', 'New Order', 'Pig', 'Ailey',
        'The Year of the Everlasting Storm', 'Titane', 'The Worst Person in the World', 'Spencer', 'Petite Maman',
        'The First Wave', 'Flee', 'Memoria', 'Pleasure', 'A Chiara', 'Crimes of the Future', 'Beba', 'Fire of Love',
        'Moonage Daydream', 'Triangle of Sadness', 'All the Beauty and the Bloodshed', 'Broker', 'Infinity Pool',
        'Bait', 'Enys Men', 'How to Blow Up a Pipeline', 'Robots', 'Sanctuary', 'Oldboy', 'It Lives Inside',
        'The Royal Hotel', 'Anatomy of a Fall', 'Perfect Days', 'Robot Dreams', 'Eileen', 'La chimera', 'Origin',
        'Ferrari', 'Self Reliance', 'Immaculate', 'Stress Positions', 'Babes', 'Handling the Undead', 'Brats',
        'Longlegs', "Mothers' Instinct", 'Cuckoo', 'Seeking Mavis Beacon', 'Bad Actor: A Hollywood Ponzi Scheme',
        'Anora', 'The Seed of the Sacred Fig', 'The End', '2073', 'Presence', 'The Monkey', 'The Actor',
        'Hell of a Summer', 'Men of War', 'The Life of Chuck', 'Together', 'Splitsville', 'Orwell: 2+2=5',
        'It Was Just an Accident', 'Shelby Oaks', 'Sentimental Value', 'Keeper', 'Arco', 'The Secret Agent',
        'No Other Choice', 'Sirat', 'Nirvanna the Band the Show the Movie', 'EPiC: Elvis Presley in Concert',
        'Alpha', 'The Christophers', 'Exit 8'
      ];

      const normalize = (value: string) =>
        value
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9]/g, '');

      type SearchMovieResult = { id: number; title?: string; release_date?: string; poster_path?: string | null };
      type SearchMovieResponse = { results?: SearchMovieResult[] };

      const matched: Array<{ queryTitle: string; tmdbId: number; tmdbTitle: string; releaseDate?: string; posterPath?: string }> = [];
      const unmatched: string[] = [];
      setProgress({ done: 0, total: leasedTitles.length });
      for (let i = 0; i < leasedTitles.length; i += 1) {
        const queryTitle = leasedTitles[i];
        const res = await fetch(
          `https://api.themoviedb.org/3/search/movie?query=${encodeURIComponent(queryTitle)}&include_adult=false&page=1`,
          { method: 'GET', headers: { Authorization: `Bearer ${token}`, accept: 'application/json' } }
        );
        if (!res.ok) {
          unmatched.push(queryTitle);
          setProgress({ done: i + 1, total: leasedTitles.length });
          continue;
        }
        const data = await res.json() as SearchMovieResponse;
        const results = data.results ?? [];
        const normalizedQuery = normalize(queryTitle);
        const bestExact = results.find((r) => normalize(r.title ?? '') === normalizedQuery);
        const bestContains = results.find((r) => normalize(r.title ?? '').includes(normalizedQuery) || normalizedQuery.includes(normalize(r.title ?? '')));
        const best = bestExact ?? bestContains ?? results[0];
        if (!best?.id) {
          unmatched.push(queryTitle);
        } else {
          matched.push({
            queryTitle,
            tmdbId: best.id,
            tmdbTitle: best.title ?? queryTitle,
            releaseDate: best.release_date ?? undefined,
            posterPath: best.poster_path ?? undefined
          });
        }
        setProgress({ done: i + 1, total: leasedTitles.length });
      }

      const dedupedById = new Map<number, typeof matched[number]>();
      for (const item of matched) dedupedById.set(item.tmdbId, item);
      const dedupedSorted = [...dedupedById.values()].sort((a, b) => (b.releaseDate ?? '').localeCompare(a.releaseDate ?? ''));
      const existingKeys = new Set(targetCollection.entries.map((entry) => `${entry.mediaType}:${entry.tmdbId}`));
      const newEntries = dedupedSorted
        .filter((item) => !existingKeys.has(`movie:${item.tmdbId}`))
        .map((item, idx) => ({
          tmdbId: item.tmdbId,
          mediaType: 'movie' as const,
          position: idx,
          title: item.tmdbTitle,
          ...(item.posterPath ? { posterPath: item.posterPath } : {}),
          ...(item.releaseDate ? { releaseDate: item.releaseDate } : {})
        }));
      const mergedEntries = [...newEntries, ...targetCollection.entries];
      await saveCollectionEntries(targetCollection, mergedEntries);

      const report = {
        matched: dedupedSorted.map((m) => ({
          queryTitle: m.queryTitle,
          tmdbId: m.tmdbId,
          tmdbTitle: m.tmdbTitle,
          releaseDate: m.releaseDate
        })),
        unmatched
      };
      setNeonLeasedReport(report);
      console.info('[DEV][NEON leased import] result', {
        requested: leasedTitles.length,
        matched: report.matched.length,
        unmatched: report.unmatched.length,
        inserted: newEntries.length,
        unmatchedTitles: report.unmatched,
        matchedSample: report.matched.slice(0, 30)
      });
    } catch (e) {
      setLastError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsNeonLeasedImportRunning(false);
    }
  };

  const repairSelectedCollection = async () => {
    const targetCollection = getSelectedCollection();
    if (!targetCollection) {
      setLastError('Selected collection was not found.');
      return;
    }
    setIsRepairingCollection(true);
    setLastError(null);
    try {
      const repairedEntries: CollectionEntry[] = [];
      setProgress({ done: 0, total: targetCollection.entries.length });
      for (let i = 0; i < targetCollection.entries.length; i += 1) {
        const entry = targetCollection.entries[i];
        let nextEntry: CollectionEntry = { ...entry, position: i };
        if (entry.mediaType === 'movie') {
          const cache = await tmdbMovieDetailsFull(entry.tmdbId);
          if (cache) {
            nextEntry = {
              ...nextEntry,
              title: cache.title || entry.title,
              posterPath: cache.posterPath || entry.posterPath,
              releaseDate: cache.releaseDate || entry.releaseDate
            };
          }
        } else {
          const cache = await tmdbTvDetailsFull(entry.tmdbId);
          if (cache) {
            nextEntry = {
              ...nextEntry,
              title: cache.title || entry.title,
              posterPath: cache.posterPath || entry.posterPath,
              releaseDate: cache.releaseDate || entry.releaseDate
            };
          }
        }
        repairedEntries.push(nextEntry);
        setProgress({ done: i + 1, total: targetCollection.entries.length });
      }
      await saveCollectionEntries(targetCollection, repairedEntries);
      console.info('[DEV] Repaired selected collection', {
        collectionId: targetCollection.id,
        total: repairedEntries.length
      });
    } catch (e) {
      setLastError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsRepairingCollection(false);
    }
  };

  const orderSelectedCollectionByReleaseDate = async () => {
    const targetCollection = getSelectedCollection();
    if (!targetCollection) {
      setLastError('Selected collection was not found.');
      return;
    }
    setIsOrderingCollection(true);
    setLastError(null);
    try {
      const orderedEntries = [...targetCollection.entries].sort((a, b) => {
        const aDate = a.releaseDate ?? '';
        const bDate = b.releaseDate ?? '';
        const dateCompare = bDate.localeCompare(aDate);
        if (dateCompare !== 0) return dateCompare;
        return (a.title ?? '').localeCompare(b.title ?? '');
      });
      await saveCollectionEntries(targetCollection, orderedEntries);
      setProgress({ done: orderedEntries.length, total: orderedEntries.length });
      console.info('[DEV] Ordered selected collection by release date', {
        collectionId: targetCollection.id,
        total: orderedEntries.length
      });
    } catch (e) {
      setLastError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsOrderingCollection(false);
    }
  };

  const runHamnetTmdbProbe = async () => {
    setHamnetProbeLoading(true);
    setLastError(null);
    setHamnetProbeJson(null);
    try {
      const result = await tmdbMovieProbeByTitleYear('Hamnet', 2025);
      setHamnetProbeJson(JSON.stringify(result, null, 2));
    } catch (e) {
      setLastError(e instanceof Error ? e.message : String(e));
    } finally {
      setHamnetProbeLoading(false);
    }
  };

  const removeUnknownReleaseDateFilmsFromSelectedCollection = async () => {
    const targetCollection = getSelectedCollection();
    if (!targetCollection) {
      setLastError('Selected collection was not found.');
      return;
    }
    setIsRemovingUnknownReleaseDates(true);
    setLastError(null);
    try {
      const keptEntries = targetCollection.entries.filter((entry) => {
        if (entry.mediaType !== 'movie') return true;
        const releaseDate = (entry.releaseDate ?? '').trim();
        return /^\d{4}-\d{2}-\d{2}$/.test(releaseDate);
      });
      await saveCollectionEntries(targetCollection, keptEntries);
      setProgress({ done: keptEntries.length, total: targetCollection.entries.length });
      console.info('[DEV] Removed unknown release-date films from selected collection', {
        collectionId: targetCollection.id,
        removed: targetCollection.entries.length - keptEntries.length,
        totalAfter: keptEntries.length
      });
    } catch (e) {
      setLastError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsRemovingUnknownReleaseDates(false);
    }
  };

  if (!import.meta.env.DEV || !isAdmin) return null;

  return (
    <>
      <button type="button" className="dev-fab" onClick={() => setOpen(true)} aria-label="Dev tools">
        DEV
      </button>
      {open && (
        <div className="dev-modal-overlay" role="dialog" aria-modal="true">
          <div className="dev-modal card-surface">
            <div className="dev-modal-header">
              <h2 className="dev-modal-title">Dev tools</h2>
              <button type="button" className="dev-modal-close" onClick={() => setOpen(false)}>
                ✕
              </button>
            </div>
            <div className="dev-modal-body">
              <div className="dev-row">
                <span className="dev-label">Entries</span>
                <span className="dev-value">{movieItems.length + tvItems.length + peopleCount}</span>
              </div>
              <div className="dev-row">
                <span className="dev-label">Missing cached fields</span>
                <span className="dev-value">{totalRefresh}</span>
              </div>

              <div className="dev-actions">
                <button
                  type="button"
                  className="dev-primary"
                  disabled={isRunning || totalRefresh === 0}
                  onClick={() => handleRefresh(false)}
                >
                  Refresh missing
                </button>
                <button
                  type="button"
                  className="dev-secondary"
                  disabled={isRunning}
                  onClick={() => handleRefresh(true)}
                >
                  Force refresh all
                </button>
                <button
                  type="button"
                  className="dev-secondary"
                  disabled={isRunning || peopleCount === 0}
                  onClick={handleRefreshPeople}
                >
                  Force refresh actors
                </button>
                <button
                  type="button"
                  className="dev-secondary"
                  disabled={isRunning || isDumping || !user?.uid}
                  onClick={() => void dumpClassPersistence()}
                >
                  Dump class persistence
                </button>
                <button
                  type="button"
                  className="dev-secondary"
                  disabled={isRunning || isDumping || isStudioScanRunning || movieItems.length === 0}
                  onClick={() => void scanForNeonA24Movies()}
                >
                  Search for NEON/A24 films you have
                </button>
                <button
                  type="button"
                  className="dev-primary"
                  disabled={isRunning || isDumping || isStudioScanRunning || isBulkA24Running || isBulkNeonRunning || !quickCollectionId}
                  onClick={() => void addAllA24ToSelectedCollection()}
                >
                  Add all A24 to selected Collection
                </button>
                <button
                  type="button"
                  className="dev-primary"
                  disabled={isRunning || isDumping || isStudioScanRunning || isBulkA24Running || isBulkNeonRunning || isNeonDumpRunning || !quickCollectionId}
                  onClick={() => void addAllNeonToSelectedCollection()}
                >
                  Add all NEON films to selected Collection
                </button>
                <button
                  type="button"
                  className="dev-secondary"
                  disabled={isRunning || isDumping || isStudioScanRunning || isBulkA24Running || isBulkNeonRunning || isNeonDumpRunning}
                  onClick={() => void dumpNeonDiagnostics()}
                >
                  Dump NEON query diagnostics
                </button>
                <button
                  type="button"
                  className="dev-primary"
                  disabled={isRunning || isDumping || isStudioScanRunning || isBulkA24Running || isBulkNeonRunning || isNeonDumpRunning || isNeonLeasedImportRunning || !quickCollectionId}
                  onClick={() => void importNeonLeasedTitlesToSelectedCollection()}
                >
                  Add NEON leased list to selected Collection
                </button>
              </div>
              {neonLeasedReport && (
                <p className="dev-note">
                  NEON leased import: matched {neonLeasedReport.matched.length}, unmatched {neonLeasedReport.unmatched.length}.
                  {neonLeasedReport.unmatched.length > 0 ? ` Missing: ${neonLeasedReport.unmatched.slice(0, 12).join(' • ')}${neonLeasedReport.unmatched.length > 12 ? ' • …' : ''}` : ''}
                </p>
              )}
              {studioScanMatches.length > 0 && (
                <p className="dev-note">
                  Found {studioScanMatches.length} match(es):{' '}
                  {studioScanMatches
                    .slice(0, 20)
                    .map((m) => `${m.title} [${m.studio}]`)
                    .join(' • ')}
                  {studioScanMatches.length > 20 ? ' • …' : ''}
                </p>
              )}

              <h3 className="dev-modal-title" style={{ fontSize: 14, marginTop: 12 }}>TMDB movie API probe</h3>
              <p className="dev-note">
                Searches &quot;Hamnet&quot; (2025), takes the first hit, then one GET with credits, keywords, release dates,
                external IDs, watch providers, videos, images, recommendations, similar, reviews, translations — plus
                collection details if the title belongs to a franchise collection.
              </p>
              <div className="dev-actions">
                <button
                  type="button"
                  className="dev-secondary"
                  disabled={hamnetProbeLoading || isRunning}
                  onClick={() => void runHamnetTmdbProbe()}
                >
                  {hamnetProbeLoading ? 'Fetching…' : 'Fetch full TMDB dump: Hamnet (2025)'}
                </button>
              </div>
              {hamnetProbeJson && (
                <pre className="dev-json-dump" tabIndex={0}>
                  {hamnetProbeJson}
                </pre>
              )}

              <h3 className="dev-modal-title" style={{ fontSize: 14, marginTop: 12 }}>Global collection editor</h3>
              <div className="dev-row">
                <label className="dev-label">Collection to add to with quick button</label>
              </div>
              <div className="dev-row">
                <select
                  className="dev-input"
                  value={quickCollectionId}
                  onChange={(e) => {
                    const value = e.target.value;
                    setQuickCollectionId(value);
                    localStorage.setItem('dev_quick_collection_id', value);
                    window.dispatchEvent(new Event('quick-collection-config-changed'));
                  }}
                >
                  <option value="">Select collection...</option>
                  {quickCollectionOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="dev-row">
                <label className="dev-label">Add direction</label>
              </div>
              <div className="dev-actions">
                <button
                  type="button"
                  className={`dev-secondary ${quickAddDirection === 'top' ? 'dev-secondary--active' : ''}`}
                  onClick={() => {
                    setQuickAddDirection('top');
                    localStorage.setItem('dev_quick_collection_direction', 'top');
                    window.dispatchEvent(new Event('quick-collection-config-changed'));
                  }}
                >
                  Top
                </button>
                <button
                  type="button"
                  className={`dev-secondary ${quickAddDirection === 'bottom' ? 'dev-secondary--active' : ''}`}
                  onClick={() => {
                    setQuickAddDirection('bottom');
                    localStorage.setItem('dev_quick_collection_direction', 'bottom');
                    window.dispatchEvent(new Event('quick-collection-config-changed'));
                  }}
                >
                  Bottom
                </button>
              </div>
              <h3 className="dev-modal-title" style={{ fontSize: 14, marginTop: 10 }}>Selected collection maintenance</h3>
              <div className="dev-actions">
                <button
                  type="button"
                  className="dev-primary"
                  disabled={
                    !quickCollectionId ||
                    isRunning ||
                    isDumping ||
                    isStudioScanRunning ||
                    isBulkA24Running ||
                    isBulkNeonRunning ||
                    isNeonDumpRunning ||
                    isRepairingCollection ||
                    isOrderingCollection ||
                    isRemovingUnknownReleaseDates
                  }
                  onClick={() => void repairSelectedCollection()}
                >
                  Repair selected collection
                </button>
                <button
                  type="button"
                  className="dev-secondary"
                  disabled={
                    !quickCollectionId ||
                    isRunning ||
                    isDumping ||
                    isStudioScanRunning ||
                    isBulkA24Running ||
                    isBulkNeonRunning ||
                    isNeonDumpRunning ||
                    isRepairingCollection ||
                    isOrderingCollection ||
                    isRemovingUnknownReleaseDates
                  }
                  onClick={() => void orderSelectedCollectionByReleaseDate()}
                >
                  Order collection in release order
                </button>
                <button
                  type="button"
                  className="dev-secondary"
                  disabled={
                    !quickCollectionId ||
                    isRunning ||
                    isDumping ||
                    isStudioScanRunning ||
                    isBulkA24Running ||
                    isBulkNeonRunning ||
                    isNeonDumpRunning ||
                    isRepairingCollection ||
                    isOrderingCollection ||
                    isRemovingUnknownReleaseDates
                  }
                  onClick={() => void removeUnknownReleaseDateFilmsFromSelectedCollection()}
                >
                  Remove unknown release date films from selected collection
                </button>
              </div>
              {progress && (
                <p className="dev-progress">
                  {isRunning ? 'Refreshing…' : 'Done.'} {progress.done}/{progress.total}
                </p>
              )}
              {lastError && <p className="dev-error">{lastError}</p>}

              <p className="dev-note">
                This will call TMDB for any entry missing cached data and write it into your Firestore list.
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
