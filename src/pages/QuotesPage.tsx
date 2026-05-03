import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, ChevronRight, X } from 'lucide-react';
import { PageSearch, type SearchableItem } from '../components/PageSearch';
import { RandomQuote } from '../components/RandomQuote';
import { useAuth } from '../context/AuthContext';
import { db } from '../lib/firebase';
import { useMoviesStore } from '../state/moviesStore';
import { useTvStore } from '../state/tvStore';
import { usePeopleStore } from '../state/peopleStore';
import { useDirectorsStore } from '../state/directorsStore';
import { collection, getDocs } from 'firebase/firestore';
import {
  addGlobalQuote,
  createQuoteSubmission,
  deleteGlobalQuote,
  loadGlobalQuotes,
  resolveQuoteSubmission,
  subscribeQuoteSubmissions,
  subscribeQuoteSubmissionsForRequester,
  type FirebaseQuote,
  normalizeQuoteCategoryForForm,
  type QuoteCategory,
  type QuoteSubmission,
  QuoteSubmissionAlreadyResolvedError,
  QuoteEditConflictError,
  updateGlobalQuote,
} from '../lib/firestoreQuotes';
import { tmdbImagePath, tmdbSearchMovies, tmdbSearchPeople, tmdbSearchTv, type TmdbMultiResult } from '../lib/tmdb';
import '../components/RankedList.css';
import './QuotesPage.css';

const quoteCategories: QuoteCategory[] = ['movies', 'tv', 'actors', 'directors', 'search', 'profile'];

type ModalMode = 'add' | 'request' | 'edit' | null;

type SourceResult = {
  tmdbId: number;
  mediaType: 'movie' | 'tv' | 'person';
  title: string;
  posterPath?: string;
  popularity: number;
};

type SourceSearchMode = 'cinema' | 'person';

type QuoteFormState = {
  category: QuoteCategory;
  text: string;
  speakerFirstName: string;
  speakerFullName: string;
  selectedSource: SourceResult | null;
  fallbackSourceTitle: string;
};

const DEFAULT_FORM: QuoteFormState = {
  category: 'movies',
  text: '',
  speakerFirstName: '',
  speakerFullName: '',
  selectedSource: null,
  fallbackSourceTitle: '',
};

function normalizeQuoteText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function diceCoefficient(a: string, b: string): number {
  if (!a.length || !b.length) return 0;
  if (a === b) return 1;
  const bigrams = (input: string): string[] => {
    if (input.length < 2) return [input];
    const out: string[] = [];
    for (let i = 0; i < input.length - 1; i += 1) {
      out.push(input.slice(i, i + 2));
    }
    return out;
  };
  const aBigrams = bigrams(a);
  const bBigrams = bigrams(b);
  const counts = new Map<string, number>();
  aBigrams.forEach((gram) => counts.set(gram, (counts.get(gram) ?? 0) + 1));
  let overlap = 0;
  bBigrams.forEach((gram) => {
    const count = counts.get(gram) ?? 0;
    if (count > 0) {
      overlap += 1;
      counts.set(gram, count - 1);
    }
  });
  return (2 * overlap) / (aBigrams.length + bBigrams.length);
}

function findBestQuoteMatch(
  text: string,
  sourceTitle: string | null,
  quotes: FirebaseQuote[],
  threshold: number = 0.8,
): { quote: FirebaseQuote; similarity: number } | null {
  const normalizedText = normalizeQuoteText(text);
  if (!normalizedText) return null;
  const normalizedSource = (sourceTitle ?? '').trim().toLowerCase();
  const sameSource = normalizedSource
    ? quotes.filter((quote) => quote.source.trim().toLowerCase() === normalizedSource)
    : [];
  const pool = sameSource.length > 0 ? sameSource : quotes;
  let bestQuote: FirebaseQuote | null = null;
  let bestSimilarity = 0;
  pool.forEach((quote) => {
    const similarity = diceCoefficient(normalizeQuoteText(quote.text), normalizedText);
    if (bestQuote == null || similarity > bestSimilarity) {
      bestQuote = quote;
      bestSimilarity = similarity;
    }
  });
  if (!bestQuote || bestSimilarity < threshold) return null;
  return { quote: bestQuote, similarity: bestSimilarity };
}

export function QuotesPage() {
  const { user, username, isAdmin, isBabyDev } = useAuth();
  const { byClass: moviesByClass } = useMoviesStore();
  const { byClass: tvByClass } = useTvStore();
  const { byClass: peopleByClass } = usePeopleStore();
  const { byClass: directorsByClass } = useDirectorsStore();
  const canManageQuotes = isAdmin || isBabyDev;
  const [quotes, setQuotes] = useState<FirebaseQuote[]>([]);
  const [submissions, setSubmissions] = useState<QuoteSubmission[]>([]);
  const [quotesLoading, setQuotesLoading] = useState(false);
  const [quotesError, setQuotesError] = useState<string | null>(null);
  const [quotesNotice, setQuotesNotice] = useState<string | null>(null);
  const [sourceModalKey, setSourceModalKey] = useState<string | null>(null);
  const [sourceQuery, setSourceQuery] = useState('');
  const [sourceResults, setSourceResults] = useState<SourceResult[]>([]);
  const [sourceSearching, setSourceSearching] = useState(false);
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [form, setForm] = useState<QuoteFormState>(DEFAULT_FORM);
  const [editingQuote, setEditingQuote] = useState<FirebaseQuote | null>(null);
  const [savingQuote, setSavingQuote] = useState(false);
  const [deletingQuoteId, setDeletingQuoteId] = useState<string | null>(null);
  const [submissionActionId, setSubmissionActionId] = useState<string | null>(null);
  const [savingBulkSource, setSavingBulkSource] = useState(false);
  const [bulkSourceQuery, setBulkSourceQuery] = useState('');
  const [bulkSourceResults, setBulkSourceResults] = useState<SourceResult[]>([]);
  const [bulkSourceSearching, setBulkSourceSearching] = useState(false);
  const [bulkSelectedSource, setBulkSelectedSource] = useState<SourceResult | null>(null);
  const [sourceSearchMode, setSourceSearchMode] = useState<SourceSearchMode>('cinema');
  const [bulkSourceSearchMode, setBulkSourceSearchMode] = useState<SourceSearchMode>('cinema');
  const [resolvedPosterBySource, setResolvedPosterBySource] = useState<Record<string, string>>({});
  const [showSubmittedRequests, setShowSubmittedRequests] = useState(true);
  const [showAcceptedRequests, setShowAcceptedRequests] = useState(true);
  const [allUsernames, setAllUsernames] = useState<string[]>([]);
  const [editAddedByUsername, setEditAddedByUsername] = useState('');
  const [flashQuoteId, setFlashQuoteId] = useState<string | null>(null);
  const [flashSourceKey, setFlashSourceKey] = useState<string | null>(null);
  const [flashSubmissionId, setFlashSubmissionId] = useState<string | null>(null);

  const refreshQuotes = async () => {
    if (!db) return;
    setQuotesLoading(true);
    setQuotesError(null);
    try {
      const loaded = await loadGlobalQuotes(db);
      setQuotes(loaded);
    } catch (error) {
      setQuotesError(error instanceof Error ? error.message : 'Failed to load quotes.');
    } finally {
      setQuotesLoading(false);
    }
  };

  useEffect(() => {
    if (!db) return;
    void refreshQuotes();
  }, []);

  useEffect(() => {
    if (!db || !user) return;
    if (canManageQuotes) {
      return subscribeQuoteSubmissions(
        db,
        setSubmissions,
        (error) => setQuotesError(error?.message ?? 'Failed to load submitted quotes.'),
      );
    }
    return subscribeQuoteSubmissionsForRequester(
      db,
      user.uid,
      setSubmissions,
      (error) => setQuotesError(error?.message ?? 'Failed to load your submitted quotes.'),
    );
  }, [canManageQuotes, user?.uid]);

  useEffect(() => {
    if (!db || !canManageQuotes) return;
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDocs(collection(db, 'users'));
        if (cancelled) return;
        const names = snap.docs
          .map((doc) => {
            const value = doc.data()?.username;
            return typeof value === 'string' ? value.trim() : '';
          })
          .filter((value) => value.length > 0)
          .sort((a, b) => a.localeCompare(b));
        setAllUsernames(Array.from(new Set(names)));
      } catch {
        if (!cancelled) setAllUsernames([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canManageQuotes]);

  const savedPosters = useMemo(() => {
    const byTitle = new Map<string, string>();
    const byTypedTmdb = new Map<string, string>();
    const addFrom = (
      mediaType: 'movie' | 'tv' | 'person',
      items: Array<{ title: string; tmdbId?: number; posterPath?: string; profilePath?: string }>,
    ) => {
      items.forEach((item) => {
        const path = mediaType === 'person' ? item.profilePath : item.posterPath;
        if (!path) return;
        const titleKey = item.title.trim().toLowerCase();
        if (titleKey && !byTitle.has(titleKey)) byTitle.set(titleKey, path);
        if (item.tmdbId != null) {
          const typedKey = `${mediaType}:${item.tmdbId}`;
          if (!byTypedTmdb.has(typedKey)) byTypedTmdb.set(typedKey, path);
        }
      });
    };
    addFrom('movie', Object.values(moviesByClass).flat());
    addFrom('tv', Object.values(tvByClass).flat());
    addFrom('person', Object.values(peopleByClass).flat());
    addFrom('person', Object.values(directorsByClass).flat());
    return { byTitle, byTypedTmdb };
  }, [moviesByClass, tvByClass, peopleByClass, directorsByClass]);

  const sourceGroups = useMemo(() => {
    const groups = new Map<string, { source: string; quotes: FirebaseQuote[]; posterPath?: string }>();
    quotes.forEach((quote) => {
      const sourceKey = quote.source.trim().toLowerCase();
      const typedTmdbKey =
        quote.sourceMediaType && quote.sourceTmdbId != null
          ? `${quote.sourceMediaType}:${quote.sourceTmdbId}`
          : null;
      const profilePoster =
        (typedTmdbKey ? savedPosters.byTypedTmdb.get(typedTmdbKey) : undefined) ||
        savedPosters.byTitle.get(sourceKey);
      if (!groups.has(sourceKey)) {
        groups.set(sourceKey, {
          source: quote.source,
          quotes: [],
          // Prefer the user's selected poster/profile image over default quote metadata.
          posterPath: profilePoster || quote.sourcePosterPath,
        });
      }
      const current = groups.get(sourceKey);
      if (!current) return;
      current.quotes.push(quote);
      if (!current.posterPath && profilePoster) {
        current.posterPath = profilePoster;
      }
      if (!current.posterPath && quote.sourcePosterPath) {
        current.posterPath = quote.sourcePosterPath;
      }
      if (!current.posterPath) {
        const savedPoster = savedPosters.byTitle.get(sourceKey);
        if (savedPoster) current.posterPath = savedPoster;
      }
      if (!current.posterPath) {
        const resolvedPoster = resolvedPosterBySource[sourceKey];
        if (resolvedPoster) current.posterPath = resolvedPoster;
      }
    });
    return Array.from(groups.entries())
      .map(([key, value]) => ({ key, ...value }))
      .sort((a, b) => a.source.localeCompare(b.source));
  }, [quotes, savedPosters, resolvedPosterBySource]);
  useEffect(() => {
    let cancelled = false;
    const missingGroups = sourceGroups.filter((group) => !group.posterPath);
    if (missingGroups.length === 0) return;
    const run = async () => {
      for (const group of missingGroups.slice(0, 80)) {
        if (cancelled) return;
        const sourceKey = group.source.trim().toLowerCase();
        if (resolvedPosterBySource[sourceKey]) continue;
        try {
          const prefersPerson = group.quotes.some((quote) => quote.sourceMediaType === 'person');
          let posterPath: string | undefined;
          if (prefersPerson) {
            const person = await tmdbSearchPeople(group.source, undefined, 1);
            posterPath = person[0]?.profile_path ?? undefined;
          } else {
            const [movie, tv] = await Promise.all([
              tmdbSearchMovies(group.source, undefined, undefined, 1),
              tmdbSearchTv(group.source, undefined, undefined, 1),
            ]);
            posterPath = movie[0]?.poster_path ?? tv[0]?.poster_path ?? undefined;
          }
          if (!posterPath) continue;
          if (!cancelled) {
            setResolvedPosterBySource((prev) => {
              if (prev[sourceKey]) return prev;
              return { ...prev, [sourceKey]: posterPath as string };
            });
          }
        } catch {
          // Ignore per-source lookup failures and keep fallback tile.
        }
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [sourceGroups, resolvedPosterBySource]);
  const nonPersonSourceGroups = useMemo(
    () =>
      sourceGroups
        .filter((group) => !group.quotes.some((quote) => quote.sourceMediaType === 'person'))
        .sort((a, b) => {
          if (b.quotes.length !== a.quotes.length) return b.quotes.length - a.quotes.length;
          return a.source.localeCompare(b.source);
        }),
    [sourceGroups],
  );
  const personSourceGroups = useMemo(
    () =>
      sourceGroups
        .filter((group) => group.quotes.some((quote) => quote.sourceMediaType === 'person'))
        .sort((a, b) => {
          if (b.quotes.length !== a.quotes.length) return b.quotes.length - a.quotes.length;
          return a.source.localeCompare(b.source);
        }),
    [sourceGroups],
  );

  useEffect(() => {
    if (!sourceModalKey) return;
    if (!sourceGroups.some((group) => group.key === sourceModalKey)) {
      setSourceModalKey(null);
    }
  }, [sourceGroups, sourceModalKey]);

  const sourceModalGroup = sourceGroups.find((group) => group.key === sourceModalKey) ?? null;
  useEffect(() => {
    setBulkSourceQuery('');
    setBulkSourceResults([]);
    setBulkSelectedSource(null);
    setBulkSourceSearchMode('cinema');
  }, [sourceModalGroup?.key, sourceModalGroup?.source]);
  const existingSourceTitles = useMemo(
    () =>
      sourceGroups
        .slice()
        .sort((a, b) => {
          if (b.quotes.length !== a.quotes.length) return b.quotes.length - a.quotes.length;
          return a.source.localeCompare(b.source);
        })
        .map((group) => group.source),
    [sourceGroups],
  );
  const filteredExistingSources = useMemo(() => {
    const q = sourceQuery.trim().toLowerCase();
    if (!q) return existingSourceTitles.slice(0, 15);
    return existingSourceTitles
      .filter((title) => title.toLowerCase().includes(q))
      .slice(0, 15);
  }, [existingSourceTitles, sourceQuery]);

  const sortedSubmissions = useMemo(() => {
    const list = submissions.slice();
    list.sort((a, b) => {
      if (a.status !== b.status) return a.status === 'pending' ? -1 : 1;
      return b.createdAt.localeCompare(a.createdAt);
    });
    return list;
  }, [submissions]);
  const submittedQuotes = useMemo(
    () => sortedSubmissions.filter((item) => item.status !== 'approved'),
    [sortedSubmissions],
  );
  const acceptedQuotes = useMemo(
    () => sortedSubmissions.filter((item) => item.status === 'approved'),
    [sortedSubmissions],
  );
  const duplicateWarningMatch = useMemo(() => {
    if (modalMode !== 'add' && modalMode !== 'request') return null;
    const sourceTitle = form.selectedSource?.title?.trim() || form.fallbackSourceTitle.trim() || null;
    return findBestQuoteMatch(form.text, sourceTitle, quotes, 0.8);
  }, [modalMode, form.text, form.selectedSource?.title, form.fallbackSourceTitle, quotes]);
  const pendingDuplicateBySubmissionId = useMemo(() => {
    const map = new Map<string, { quote: FirebaseQuote; similarity: number }>();
    submittedQuotes
      .filter((submission) => submission.status === 'pending')
      .forEach((submission) => {
        const match = findBestQuoteMatch(submission.text, submission.source, quotes, 0.8);
        if (match) map.set(submission.id, match);
      });
    return map;
  }, [submittedQuotes, quotes]);

  const quoteSearchItems = useMemo((): SearchableItem[] => {
    const fromQuotes: SearchableItem[] = quotes.map((q) => {
      const snippet = q.text.length > 80 ? `${q.text.slice(0, 80)}…` : q.text;
      return {
        id: `quote:${q.id}`,
        title: snippet,
        searchText: `${q.source} ${q.text} ${q.speakerFirstName || ''} ${q.speakerFullName || ''}`.trim(),
        resultLabel: `${q.source} — “${snippet}”`,
      };
    });
    const fromSources: SearchableItem[] = sourceGroups.map((g) => ({
      id: `source:${g.key}`,
      title: g.source,
      searchText: g.source,
      resultLabel: `${g.source} · ${g.quotes.length} quote${g.quotes.length === 1 ? '' : 's'}`,
    }));
    const fromSubmissions: SearchableItem[] = sortedSubmissions.map((s) => {
      const snippet = s.text.length > 80 ? `${s.text.slice(0, 80)}…` : s.text;
      return {
        id: `submission:${s.id}`,
        title: snippet,
        searchText: `${s.source} ${s.text} ${s.speakerFirstName} ${s.requesterUsername}`.trim(),
        resultLabel: `${s.source} (submission) — “${snippet}”`,
      };
    });
    return [...fromQuotes, ...fromSources, ...fromSubmissions];
  }, [quotes, sourceGroups, sortedSubmissions]);

  const handleQuoteSearchSelect = useCallback((rawId: string) => {
    setFlashQuoteId(null);
    setFlashSourceKey(null);
    setFlashSubmissionId(null);

    if (rawId.startsWith('quote:')) {
      const qid = rawId.slice('quote:'.length);
      const quote = quotes.find((q) => q.id === qid);
      if (!quote) return;
      setSourceModalKey(quote.source.trim().toLowerCase());
      setFlashQuoteId(qid);
      return;
    }
    if (rawId.startsWith('source:')) {
      const key = rawId.slice('source:'.length);
      setFlashSourceKey(key);
      return;
    }
    if (rawId.startsWith('submission:')) {
      const sid = rawId.slice('submission:'.length);
      setShowSubmittedRequests(true);
      setShowAcceptedRequests(true);
      setFlashSubmissionId(sid);
    }
  }, [quotes]);

  useEffect(() => {
    if (!flashQuoteId || !sourceModalGroup) return;
    if (!sourceModalGroup.quotes.some((q) => q.id === flashQuoteId)) return;
    const scrollTimer = window.setTimeout(() => {
      document.getElementById(`quotes-quote-${flashQuoteId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 120);
    const clearTimer = window.setTimeout(() => setFlashQuoteId(null), 3000);
    return () => {
      clearTimeout(scrollTimer);
      clearTimeout(clearTimer);
    };
  }, [flashQuoteId, sourceModalGroup]);

  useEffect(() => {
    if (!flashSourceKey) return;
    let rafId = 0;
    rafId = requestAnimationFrame(() => {
      Array.from(document.querySelectorAll<HTMLElement>('[data-quotes-source-key]')).find(
        (el) => el.getAttribute('data-quotes-source-key') === flashSourceKey,
      )?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    const clearTimer = window.setTimeout(() => setFlashSourceKey(null), 2800);
    return () => {
      cancelAnimationFrame(rafId);
      clearTimeout(clearTimer);
    };
  }, [flashSourceKey]);

  useEffect(() => {
    if (!flashSubmissionId) return;
    const scrollTimer = window.setTimeout(() => {
      document.getElementById(`quotes-submission-${flashSubmissionId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 80);
    const clearTimer = window.setTimeout(() => setFlashSubmissionId(null), 2800);
    return () => {
      clearTimeout(scrollTimer);
      clearTimeout(clearTimer);
    };
  }, [flashSubmissionId]);

  const openModal = (mode: ModalMode, quote?: FirebaseQuote) => {
    setQuotesError(null);
    setQuotesNotice(null);
    if (mode === 'edit' && quote) {
      setEditingQuote(quote);
      setForm({
        category: normalizeQuoteCategoryForForm(quote.category),
        text: quote.text,
        speakerFirstName: quote.speakerFirstName || quote.character,
        speakerFullName: quote.speakerFullName || '',
        selectedSource:
          quote.sourceTmdbId && quote.sourceMediaType
            ? {
                tmdbId: quote.sourceTmdbId,
                mediaType: quote.sourceMediaType,
                title: quote.source,
                posterPath: quote.sourcePosterPath,
                popularity: 0,
              }
            : null,
        fallbackSourceTitle: quote.source,
      });
      setEditAddedByUsername(quote.addedByUsername || '');
    } else {
      setEditingQuote(null);
      setForm(DEFAULT_FORM);
      setEditAddedByUsername('');
    }
    setSourceQuery('');
    setSourceResults([]);
    setSourceSearchMode('cinema');
    setModalMode(mode);
  };

  const openAddQuoteForSource = (sourceGroup: { source: string; quotes: FirebaseQuote[] }) => {
    const firstQuoteWithMeta = sourceGroup.quotes.find((quote) => quote.sourceTmdbId && quote.sourceMediaType);
    setQuotesError(null);
    setQuotesNotice(null);
    setEditingQuote(null);
    setForm({
      ...DEFAULT_FORM,
      fallbackSourceTitle: sourceGroup.source,
      selectedSource:
        firstQuoteWithMeta?.sourceTmdbId && firstQuoteWithMeta?.sourceMediaType
          ? {
              tmdbId: firstQuoteWithMeta.sourceTmdbId,
              mediaType: firstQuoteWithMeta.sourceMediaType,
              title: sourceGroup.source,
              posterPath: firstQuoteWithMeta.sourcePosterPath,
              popularity: 0,
            }
          : null,
    });
    setSourceQuery('');
    setSourceResults([]);
    setSourceSearchMode('cinema');
    setModalMode('add');
  };

  const closeModal = () => {
    setModalMode(null);
    setForm(DEFAULT_FORM);
    setEditingQuote(null);
    setEditAddedByUsername('');
    setSourceQuery('');
    setSourceResults([]);
    setSourceSearchMode('cinema');
  };

  const searchSources = async (queryText: string, mode: SourceSearchMode) => {
    const q = queryText.trim();
    if (q.length < 2) {
      setSourceResults([]);
      return;
    }
    setSourceSearching(true);
    try {
      const merged =
        mode === 'person'
          ? await tmdbSearchPeople(q, undefined, 1)
          : (
              await Promise.all([
                tmdbSearchMovies(q, undefined, undefined, 1),
                tmdbSearchTv(q, undefined, undefined, 1),
              ])
            ).flat();
      const deduped = new Map<string, SourceResult>();
      merged.forEach((result: TmdbMultiResult) => {
        if (result.media_type !== 'movie' && result.media_type !== 'tv' && result.media_type !== 'person') return;
        const key = `${result.media_type}-${result.id}`;
        if (deduped.has(key)) return;
        deduped.set(key, {
          tmdbId: result.id,
          mediaType: result.media_type,
          title: result.title,
          posterPath: result.poster_path ?? result.profile_path ?? undefined,
          popularity: result.popularity ?? 0,
        });
      });
      const sorted = Array.from(deduped.values())
        .sort((a, b) => b.popularity - a.popularity)
        .slice(0, 18);
      setSourceResults(sorted);
    } catch (error) {
      setQuotesError(error instanceof Error ? error.message : 'Failed to search sources.');
      setSourceResults([]);
    } finally {
      setSourceSearching(false);
    }
  };

  useEffect(() => {
    if (!modalMode) return;
    const trimmed = sourceQuery.trim();
    if (trimmed.length < 2) {
      setSourceResults([]);
      setSourceSearching(false);
      return;
    }
    const timer = window.setTimeout(() => {
      void searchSources(sourceQuery, sourceSearchMode);
    }, 220);
    return () => window.clearTimeout(timer);
  }, [sourceQuery, sourceSearchMode, modalMode]);

  const handleSaveQuote = async () => {
    if (!db || !user) return;
    const sourceTitle = form.selectedSource?.title?.trim() || form.fallbackSourceTitle.trim();
    const autoPersonName = sourceSearchMode === 'person'
      ? (form.selectedSource?.title?.trim() || sourceTitle)
      : '';
    const speakerFirstName = sourceSearchMode === 'person'
      ? autoPersonName
      : form.speakerFirstName.trim();
    const speakerFullName = sourceSearchMode === 'person'
      ? autoPersonName
      : form.speakerFullName.trim();
    if (
      !sourceTitle ||
      form.text.trim().length === 0 ||
      speakerFirstName.length === 0
    ) {
      setQuotesError('Please complete all fields and pick a source from search or existing sources.');
      return;
    }
    setSavingQuote(true);
    setQuotesError(null);
    try {
      const payload = {
        category: form.category,
        text: form.text,
        source: sourceTitle,
        speakerFirstName,
        speakerFullName,
        sourceTmdbId: form.selectedSource?.tmdbId,
        sourceMediaType: form.selectedSource?.mediaType,
        sourcePosterPath: form.selectedSource?.posterPath,
      } as const;
      if (modalMode === 'add') {
        await addGlobalQuote(db, {
          ...payload,
          addedByUid: user.uid,
          addedByUsername: username || user.displayName || 'Unknown',
        });
        setQuotesNotice('Quote added.');
        closeModal();
        await refreshQuotes();
      } else if (modalMode === 'request') {
        await createQuoteSubmission(db, {
          ...payload,
          requesterUid: user.uid,
          requesterUsername: username ?? user.displayName ?? 'Unknown',
        });
        setQuotesNotice('Quote request submitted.');
        closeModal();
      } else if (modalMode === 'edit' && editingQuote) {
        await updateGlobalQuote(db, editingQuote.id, {
          ...payload,
          addedByUid: editingQuote.addedByUid,
          addedByUsername: editAddedByUsername.trim() || 'Legacy/Unknown',
          addedAt: editingQuote.addedAt,
        }, { expectedUpdatedAt: editingQuote.updatedAt });
        setQuotesNotice('Quote updated.');
        closeModal();
        await refreshQuotes();
      }
    } catch (error) {
      if (error instanceof QuoteEditConflictError) {
        setQuotesError(error.message);
      } else {
        setQuotesError(error instanceof Error ? error.message : 'Failed to save quote.');
      }
    } finally {
      setSavingQuote(false);
    }
  };

  const deleteQuote = async (quote: FirebaseQuote) => {
    if (!db || !canManageQuotes) return;
    const shouldDelete = window.confirm(`Delete this quote from ${quote.source}?`);
    if (!shouldDelete) return;
    setDeletingQuoteId(quote.id);
    setQuotesError(null);
    try {
      await deleteGlobalQuote(db, quote.id);
      setQuotesNotice('Quote deleted.');
      await refreshQuotes();
    } catch (error) {
      setQuotesError(error instanceof Error ? error.message : 'Failed to delete quote.');
    } finally {
      setDeletingQuoteId(null);
    }
  };

  const resolveSubmission = async (submission: QuoteSubmission, resolution: 'approved' | 'rejected') => {
    if (!db || !user || !canManageQuotes) return;
    setSubmissionActionId(submission.id);
    setQuotesError(null);
    try {
      await resolveQuoteSubmission(db, {
        submissionId: submission.id,
        resolution,
        resolverUid: user.uid,
        resolverUsername: username ?? user.displayName ?? 'Unknown',
      });
      if (resolution === 'approved') {
        await refreshQuotes();
      }
    } catch (error) {
      if (error instanceof QuoteSubmissionAlreadyResolvedError) {
        const resolver = error.resolvedByUsername ? ` by ${error.resolvedByUsername}` : '';
        setQuotesNotice(`${error.message}${resolver}`);
      } else {
        setQuotesError(error instanceof Error ? error.message : 'Failed to resolve quote request.');
      }
    } finally {
      setSubmissionActionId(null);
    }
  };

  const updateSourceForAllInModal = async () => {
    if (!db || !canManageQuotes || !sourceModalGroup) return;
    const firestoreDb = db;
    const nextSource = (bulkSelectedSource?.title ?? sourceModalGroup.source).trim();
    if (nextSource.length === 0) {
      setQuotesError('Source title cannot be empty.');
      return;
    }
    setSavingBulkSource(true);
    setQuotesError(null);
    try {
      await Promise.all(
        sourceModalGroup.quotes.map((quote) =>
          updateGlobalQuote(firestoreDb, quote.id, {
            category: quote.category,
            text: quote.text,
            source: nextSource,
            speakerFirstName: quote.speakerFirstName || quote.character,
            speakerFullName: quote.speakerFullName || '',
            sourceTmdbId: bulkSelectedSource?.tmdbId ?? quote.sourceTmdbId,
            sourceMediaType: bulkSelectedSource?.mediaType ?? quote.sourceMediaType,
            sourcePosterPath: bulkSelectedSource?.posterPath ?? quote.sourcePosterPath,
            addedByUid: quote.addedByUid,
            addedByUsername: quote.addedByUsername,
            addedAt: quote.addedAt,
          }, { expectedUpdatedAt: quote.updatedAt }),
        ),
      );
      setQuotesNotice(`Updated source on ${sourceModalGroup.quotes.length} quote${sourceModalGroup.quotes.length === 1 ? '' : 's'}.`);
      setSourceModalKey(null);
      await refreshQuotes();
    } catch (error) {
      if (error instanceof QuoteEditConflictError) {
        setQuotesError(error.message);
      } else {
        setQuotesError(error instanceof Error ? error.message : 'Failed to update source for all quotes.');
      }
    } finally {
      setSavingBulkSource(false);
    }
  };

  const searchBulkSources = async (queryText: string, mode: SourceSearchMode) => {
    const q = queryText.trim();
    if (q.length < 2) {
      setBulkSourceResults([]);
      return;
    }
    setBulkSourceSearching(true);
    try {
      const merged =
        mode === 'person'
          ? await tmdbSearchPeople(q, undefined, 1)
          : (
              await Promise.all([
                tmdbSearchMovies(q, undefined, undefined, 1),
                tmdbSearchTv(q, undefined, undefined, 1),
              ])
            ).flat();
      const deduped = new Map<string, SourceResult>();
      merged.forEach((result: TmdbMultiResult) => {
        if (result.media_type !== 'movie' && result.media_type !== 'tv' && result.media_type !== 'person') return;
        const key = `${result.media_type}-${result.id}`;
        if (deduped.has(key)) return;
        deduped.set(key, {
          tmdbId: result.id,
          mediaType: result.media_type,
          title: result.title,
          posterPath: result.poster_path ?? result.profile_path ?? undefined,
          popularity: result.popularity ?? 0,
        });
      });
      setBulkSourceResults(
        Array.from(deduped.values())
          .sort((a, b) => b.popularity - a.popularity)
          .slice(0, 18),
      );
    } catch (error) {
      setQuotesError(error instanceof Error ? error.message : 'Failed to search source.');
      setBulkSourceResults([]);
    } finally {
      setBulkSourceSearching(false);
    }
  };

  useEffect(() => {
    if (!sourceModalGroup) return;
    const trimmed = bulkSourceQuery.trim();
    if (trimmed.length < 2) {
      setBulkSourceResults([]);
      setBulkSourceSearching(false);
      return;
    }
    const timer = window.setTimeout(() => {
      void searchBulkSources(bulkSourceQuery, bulkSourceSearchMode);
    }, 220);
    return () => window.clearTimeout(timer);
  }, [bulkSourceQuery, bulkSourceSearchMode, sourceModalGroup?.key]);

  return (
    <section className="quotes-page">
      <header className="page-heading">
        <div>
          <h1 className="page-title">Quotes</h1>
          <RandomQuote />
        </div>
      </header>
      {!modalMode && !sourceModalGroup ? (
        <PageSearch
          items={quoteSearchItems}
          onSelect={handleQuoteSearchSelect}
          placeholder="Search source or quote..."
          className="page-search-locked"
          pageKey="quotes"
          maxResults={18}
          offsetRight="1.5rem"
        />
      ) : null}
      <div className="quotes-page-actions">
        {canManageQuotes ? (
          <button type="button" className="settings-btn" onClick={() => openModal('add')}>
            Add Quote
          </button>
        ) : (
          <button type="button" className="settings-btn settings-btn-subtle" onClick={() => openModal('request')}>
            Request Quote
          </button>
        )}
      </div>

      {quotesError ? <p className="quotes-page-error">{quotesError}</p> : null}
      {quotesNotice ? <p className="settings-muted">{quotesNotice}</p> : null}

      <section className="class-section">
        <header className="class-section-header">
          <div>
            <h3 className="class-section-title">Quote Sources</h3>
            <p className="class-section-count">
              {sourceGroups.length} {sourceGroups.length === 1 ? 'source' : 'sources'} | {quotes.length} {quotes.length === 1 ? 'quote' : 'quotes'}
            </p>
          </div>
        </header>
        {quotesLoading ? <p className="settings-muted">Loading quotes…</p> : null}
        {!quotesLoading && sourceGroups.length === 0 ? <p className="settings-muted">No quotes added yet.</p> : null}
        <div className="class-section-rows class-section-rows--tile quotes-source-grid">
          {nonPersonSourceGroups.map((group) => (
            <article
              key={group.key}
              data-quotes-source-key={group.key}
              className={`entry-tile quotes-source-tile ${sourceModalKey === group.key ? 'quotes-source-tile-active' : ''} ${flashSourceKey === group.key ? 'quotes-flash-target' : ''}`}
              onClick={() => setSourceModalKey(group.key)}
            >
              <div className="entry-tile-poster">
                {group.posterPath ? (
                  <img src={tmdbImagePath(group.posterPath, 'w185') ?? ''} alt={group.source} loading="lazy" />
                ) : (
                  <div className="quotes-source-fallback">{group.source.slice(0, 1).toUpperCase()}</div>
                )}
              </div>
              <div className="entry-tile-title">{group.source}</div>
            </article>
          ))}
        </div>
        {personSourceGroups.length > 0 ? (
          <>
            {nonPersonSourceGroups.length > 0 ? (
              <div className="quotes-source-divider" role="separator" aria-label="People sources separator">
                <span>People</span>
              </div>
            ) : null}
            <div className="class-section-rows class-section-rows--tile quotes-source-grid">
              {personSourceGroups.map((group) => (
                <article
                  key={group.key}
                  data-quotes-source-key={group.key}
                  className={`entry-tile quotes-source-tile ${sourceModalKey === group.key ? 'quotes-source-tile-active' : ''} ${flashSourceKey === group.key ? 'quotes-flash-target' : ''}`}
                  onClick={() => setSourceModalKey(group.key)}
                >
                  <div className="entry-tile-poster">
                    {group.posterPath ? (
                      <img src={tmdbImagePath(group.posterPath, 'w185') ?? ''} alt={group.source} loading="lazy" />
                    ) : (
                      <div className="quotes-source-fallback">{group.source.slice(0, 1).toUpperCase()}</div>
                    )}
                  </div>
                  <div className="entry-tile-title">{group.source}</div>
                </article>
              ))}
            </div>
          </>
        ) : null}
      </section>

      <section className="class-section quotes-submissions">
        <header className="class-section-header">
          <div>
            <h3 className="class-section-title">{canManageQuotes ? 'Quote Requests' : 'Your Quote Requests'}</h3>
            <p className="class-section-count">
              {sortedSubmissions.length} {sortedSubmissions.length === 1 ? 'submission' : 'submissions'}
            </p>
          </div>
        </header>
        <div className="settings-list">
          {sortedSubmissions.length === 0 ? <p className="settings-muted">No quote submissions yet.</p> : null}
          {sortedSubmissions.length > 0 ? (
            <>
              <button
                type="button"
                className="settings-btn settings-btn-subtle"
                onClick={() => setShowSubmittedRequests((prev) => !prev)}
              >
                {showSubmittedRequests ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                Submitted ({submittedQuotes.length})
              </button>
              {showSubmittedRequests ? (
                <>
                  {submittedQuotes.length === 0 ? <p className="settings-muted">No submitted quotes.</p> : null}
                  {submittedQuotes.map((submission) => (
                    <div
                      key={submission.id}
                      id={`quotes-submission-${submission.id}`}
                      className={`settings-list-item ${flashSubmissionId === submission.id ? 'quotes-flash-target' : ''}`}
                    >
                      <span className="settings-class-name">
                        <span className="settings-class-name-main">{submission.source}</span>
                        <span className="settings-class-tagline">
                          {' '}
                          | {submission.status.toUpperCase()} | by {submission.requesterUsername}
                        </span>
                        <span className="quotes-meta-line">
                          &ldquo;{submission.text}&rdquo; — {submission.speakerFirstName}
                        </span>
                        {submission.status === 'pending' && pendingDuplicateBySubmissionId.get(submission.id) ? (
                          <span className="quotes-meta-line quotes-meta-line-warning">
                            Quote might be a duplicate due to {Math.round((pendingDuplicateBySubmissionId.get(submission.id)?.similarity ?? 0) * 100)}% similarity.
                          </span>
                        ) : null}
                      </span>
                      {canManageQuotes && submission.status === 'pending' ? (
                        <div className="settings-list-actions">
                          <button
                            type="button"
                            className="settings-btn settings-btn-subtle"
                            disabled={submissionActionId === submission.id}
                            onClick={() => void resolveSubmission(submission, 'approved')}
                          >
                            <Check size={14} /> Approve
                          </button>
                          <button
                            type="button"
                            className="settings-btn settings-btn-subtle settings-btn-danger"
                            disabled={submissionActionId === submission.id}
                            onClick={() => void resolveSubmission(submission, 'rejected')}
                          >
                            <X size={14} /> Reject
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </>
              ) : null}
              <button
                type="button"
                className="settings-btn settings-btn-subtle"
                onClick={() => setShowAcceptedRequests((prev) => !prev)}
              >
                {showAcceptedRequests ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                Accepted Quotes ({acceptedQuotes.length})
              </button>
              {showAcceptedRequests ? (
                <>
                  {acceptedQuotes.length === 0 ? <p className="settings-muted">No accepted quotes yet.</p> : null}
                  {acceptedQuotes.map((submission) => (
                    <div
                      key={submission.id}
                      id={`quotes-submission-${submission.id}`}
                      className={`settings-list-item ${flashSubmissionId === submission.id ? 'quotes-flash-target' : ''}`}
                    >
                      <span className="settings-class-name">
                        <span className="settings-class-name-main">{submission.source}</span>
                        <span className="settings-class-tagline">
                          {' '}
                          | ACCEPTED | by {submission.requesterUsername}
                        </span>
                        <span className="quotes-meta-line">
                          &ldquo;{submission.text}&rdquo; — {submission.speakerFirstName}
                        </span>
                      </span>
                    </div>
                  ))}
                </>
              ) : null}
            </>
          ) : null}
        </div>
      </section>

      {modalMode ? (
        <div className="quotes-modal-backdrop" role="presentation">
          <div
            className="quotes-modal card-surface"
            role="dialog"
            aria-modal="true"
            aria-label={modalMode === 'add' ? 'Add quote' : modalMode === 'request' ? 'Request quote' : 'Edit quote'}
            onClick={(event) => event.stopPropagation()}
          >
            <h3 className="settings-title">
              {modalMode === 'add' ? 'Add Quote' : modalMode === 'request' ? 'Request Quote' : 'Edit Quote'}
            </h3>
            <div className="quotes-form-grid">
              <select
                className="settings-select"
                value={form.category}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, category: event.target.value as QuoteCategory }))
                }
              >
                {quoteCategories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
              <input
                className="settings-input"
                placeholder="Quote text"
                value={form.text}
                onChange={(event) => setForm((prev) => ({ ...prev, text: event.target.value }))}
              />
              {duplicateWarningMatch ? (
                <div className="quotes-duplicate-warning">
                  <strong>Are you sure this isn&apos;t already added?</strong>
                  <span>
                    {Math.round(duplicateWarningMatch.similarity * 100)}% similar to: &ldquo;{duplicateWarningMatch.quote.text}&rdquo;
                  </span>
                </div>
              ) : null}
              {sourceSearchMode !== 'person' ? (
                <>
                  <input
                    className="settings-input"
                    placeholder="Person first name"
                    value={form.speakerFirstName}
                    onChange={(event) => setForm((prev) => ({ ...prev, speakerFirstName: event.target.value }))}
                  />
                  <input
                    className="settings-input"
                    placeholder="Person full name (optional)"
                    value={form.speakerFullName}
                    onChange={(event) => setForm((prev) => ({ ...prev, speakerFullName: event.target.value }))}
                  />
                </>
              ) : null}
              {modalMode === 'edit' ? (
                <select
                  className="settings-select"
                  value={editAddedByUsername}
                  onChange={(event) => setEditAddedByUsername(event.target.value)}
                >
                  {editAddedByUsername && !allUsernames.includes(editAddedByUsername) ? (
                    <option value={editAddedByUsername}>{editAddedByUsername}</option>
                  ) : null}
                  <option value="Legacy/Unknown">Legacy/Unknown</option>
                  {allUsernames.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              ) : null}
              <div className="quotes-source-search-row">
                <input
                  className="settings-input"
                  placeholder="Search source title..."
                  value={sourceQuery}
                  onChange={(event) => setSourceQuery(event.target.value)}
                />
                <div className="quotes-search-mode-toggle">
                  <button
                    type="button"
                    className={`quotes-search-mode-btn ${sourceSearchMode === 'cinema' ? 'is-active' : ''}`}
                    onClick={() => setSourceSearchMode('cinema')}
                  >
                    Cinema
                  </button>
                  <button
                    type="button"
                    className={`quotes-search-mode-btn ${sourceSearchMode === 'person' ? 'is-active' : ''}`}
                    onClick={() => setSourceSearchMode('person')}
                  >
                    Person
                  </button>
                </div>
              </div>
              {sourceSearching ? <p className="settings-muted">Searching…</p> : null}
              {form.selectedSource ? (
                <div className="quotes-selected-source">
                  Selected source: <strong>{form.selectedSource.title}</strong>
                </div>
              ) : form.fallbackSourceTitle ? (
                <div className="quotes-selected-source">
                  Current source: <strong>{form.fallbackSourceTitle}</strong>
                </div>
              ) : null}
              {sourceResults.length > 0 ? (
                <div className="quotes-source-results">
                  {sourceResults.map((result) => (
                    <button
                      key={`${result.mediaType}-${result.tmdbId}`}
                      type="button"
                      className={`quotes-source-result ${form.selectedSource?.tmdbId === result.tmdbId && form.selectedSource?.mediaType === result.mediaType ? 'quotes-source-result-active' : ''}`}
                      onClick={() =>
                        setForm((prev) => ({
                          ...prev,
                          selectedSource: result,
                          fallbackSourceTitle: result.title,
                        }))
                      }
                    >
                      {result.posterPath ? (
                        <img src={tmdbImagePath(result.posterPath, 'w92') ?? ''} alt="" loading="lazy" />
                      ) : (
                        <span className="quotes-source-result-fallback">{result.title.slice(0, 1).toUpperCase()}</span>
                      )}
                      <span>{result.title}</span>
                    </button>
                  ))}
                </div>
              ) : null}
              {filteredExistingSources.length > 0 ? (
                <div className="quotes-existing-sources">
                  <span className="quotes-existing-sources-label">Top Existing Sources:</span>
                  <div className="quotes-existing-sources-list">
                    {filteredExistingSources.map((title) => (
                      <button
                        key={title}
                        type="button"
                        className={`quotes-existing-source-btn ${form.fallbackSourceTitle === title && !form.selectedSource ? 'quotes-existing-source-btn-active' : ''}`}
                        onClick={() =>
                          setForm((prev) => ({
                            ...prev,
                            selectedSource: null,
                            fallbackSourceTitle: title,
                          }))
                        }
                      >
                        {title}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
            <div className="settings-list-actions">
              <button type="button" className="settings-btn" disabled={savingQuote} onClick={() => void handleSaveQuote()}>
                {savingQuote ? 'Saving...' : modalMode === 'request' ? 'Submit Request' : 'Save'}
              </button>
              {modalMode === 'edit' && editingQuote && canManageQuotes ? (
                <button
                  type="button"
                  className="settings-btn settings-btn-subtle settings-btn-danger"
                  disabled={savingQuote || deletingQuoteId === editingQuote.id}
                  onClick={async () => {
                    await deleteQuote(editingQuote);
                    closeModal();
                  }}
                >
                  {deletingQuoteId === editingQuote.id ? 'Deleting...' : 'Delete'}
                </button>
              ) : null}
              <button type="button" className="settings-btn settings-btn-subtle" disabled={savingQuote} onClick={closeModal}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {sourceModalGroup ? (
        <div className="quotes-modal-backdrop" role="presentation" onClick={() => setSourceModalKey(null)}>
          <div
            className="quotes-modal card-surface"
            role="dialog"
            aria-modal="true"
            aria-label={`${sourceModalGroup.source} quotes`}
            onClick={(event) => event.stopPropagation()}
          >
            <h3 className="settings-title">{sourceModalGroup.source}</h3>
            <p className="settings-muted" style={{ marginBottom: '0.75rem' }}>
              {sourceModalGroup.quotes.length} {sourceModalGroup.quotes.length === 1 ? 'quote' : 'quotes'}
            </p>
            {canManageQuotes ? (
              <div className="settings-list-actions" style={{ marginBottom: '0.6rem' }}>
                <button
                  type="button"
                  className="settings-btn"
                  onClick={() => {
                    setSourceModalKey(null);
                    openAddQuoteForSource(sourceModalGroup);
                  }}
                >
                  Add Quote
                </button>
              </div>
            ) : null}
            <div className="settings-list">
              {sourceModalGroup.quotes.map((quote) => (
                <div
                  key={quote.id}
                  id={`quotes-quote-${quote.id}`}
                  className={`settings-list-item ${flashQuoteId === quote.id ? 'quotes-flash-target' : ''}`}
                >
                  <span className="settings-class-name">
                    <span className="settings-class-name-main">&ldquo;{quote.text}&rdquo;</span>
                    <span className="settings-class-tagline">
                      {' '}
                      | {quote.speakerFirstName || quote.character}
                    </span>
                    <span className="quotes-meta-line">
                      {quote.speakerFullName ? `Full name: ${quote.speakerFullName} | ` : ''}
                      Added by: {quote.addedByUsername || 'Legacy/Unknown'}
                    </span>
                  </span>
                  {canManageQuotes ? (
                    <div className="settings-list-actions">
                      <button
                        type="button"
                        className="settings-btn settings-btn-subtle"
                        onClick={() => {
                          setSourceModalKey(null);
                          openModal('edit', quote);
                        }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="settings-btn settings-btn-subtle settings-btn-danger"
                        disabled={deletingQuoteId === quote.id}
                        onClick={() => void deleteQuote(quote)}
                      >
                        {deletingQuoteId === quote.id ? 'Deleting...' : 'Delete'}
                      </button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
            {canManageQuotes ? (
              <div className="quotes-bulk-source-controls">
                <div className="quotes-bulk-source-row">
                  <input
                    className="settings-input"
                    placeholder="Search source title..."
                    value={bulkSourceQuery}
                    onChange={(event) => setBulkSourceQuery(event.target.value)}
                  />
                  <div className="quotes-search-mode-toggle">
                    <button
                      type="button"
                      className={`quotes-search-mode-btn ${bulkSourceSearchMode === 'cinema' ? 'is-active' : ''}`}
                      onClick={() => setBulkSourceSearchMode('cinema')}
                    >
                      Cinema
                    </button>
                    <button
                      type="button"
                      className={`quotes-search-mode-btn ${bulkSourceSearchMode === 'person' ? 'is-active' : ''}`}
                      onClick={() => setBulkSourceSearchMode('person')}
                    >
                      Person
                    </button>
                  </div>
                </div>
                {bulkSourceSearching ? <p className="settings-muted">Searching…</p> : null}
                {bulkSourceResults.length > 0 ? (
                  <div className="quotes-source-results">
                    {bulkSourceResults.map((result) => (
                      <button
                        key={`bulk-${result.mediaType}-${result.tmdbId}`}
                        type="button"
                        className={`quotes-source-result ${bulkSelectedSource?.tmdbId === result.tmdbId && bulkSelectedSource?.mediaType === result.mediaType ? 'quotes-source-result-active' : ''}`}
                        onClick={() => {
                          setBulkSelectedSource(result);
                        }}
                      >
                        {result.posterPath ? (
                          <img src={tmdbImagePath(result.posterPath, 'w92') ?? ''} alt="" loading="lazy" />
                        ) : (
                          <span className="quotes-source-result-fallback">{result.title.slice(0, 1).toUpperCase()}</span>
                        )}
                        <span>{result.title}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
                <div className="quotes-bulk-source-row">
                  <div className="quotes-bulk-source-current">
                    Current Source: {bulkSelectedSource?.title ?? sourceModalGroup.source}
                  </div>
                  <button
                    type="button"
                    className="settings-btn"
                    disabled={savingBulkSource || !bulkSelectedSource}
                    onClick={() => void updateSourceForAllInModal()}
                  >
                    {savingBulkSource ? 'Saving...' : 'Save source for all'}
                  </button>
                </div>
              </div>
            ) : null}
            <div className="settings-list-actions" style={{ marginTop: '0.8rem' }}>
              <button type="button" className="settings-btn settings-btn-subtle" onClick={() => setSourceModalKey(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
