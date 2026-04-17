import { useEffect, useMemo, useState } from 'react';
import { ArrowUp, ArrowDown, ChevronDown, ChevronRight } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { updateProfile } from 'firebase/auth';
import { collection, doc, getDoc, getDocs, setDoc } from 'firebase/firestore';
import { useAuth, hasFirebaseConfig } from '../context/AuthContext';
import { RandomQuote } from '../components/RandomQuote';
import { useMoviesStore } from '../state/moviesStore';
import { useTvStore } from '../state/tvStore';
import { useWatchlistStore } from '../state/watchlistStore';
import { useSettingsStore } from '../state/settingsStore';
import { useSyncStatus } from '../context/SyncStatusContext';
import { usePeopleStore, defaultPeopleClasses } from '../state/peopleStore';
import { useDirectorsStore, defaultDirectorsClasses } from '../state/directorsStore';
import { sanitizeClassName, sanitizeLabel, sanitizeTagline, isValidLabel, isValidTagline } from '../lib/sanitize';
import { db } from '../lib/firebase';
import {
  addGlobalQuote,
  deleteGlobalQuote,
  loadGlobalQuotes,
  migrateLegacyQuotesIfNeeded,
  updateGlobalQuote,
  type FirebaseQuote,
  type QuoteCategory,
} from '../lib/firestoreQuotes';
import { tmdbImagePath } from '../lib/tmdb';
import {
  getPersistDebounceMs,
  setPersistDebounceMs,
  subscribePersistDebounce,
  DEFAULT_PERSIST_DEBOUNCE_MS,
} from '../lib/persistDebounce';
import './SettingsPage.css';

const quoteCategories: QuoteCategory[] = ['movies', 'tv', 'actors', 'directors', 'watchlist', 'search', 'profile', 'settings', 'general'];

type ClassSectionKey = 'movies' | 'tv' | 'actors' | 'directors' | 'display' | 'dev' | 'babydev';

type BabyRoleUser = {
  uid: string;
  username?: string;
  email?: string;
  devRole?: string;
};

export function SettingsPage() {
  const { user, username, signOut, isAdmin, isBabyDev } = useAuth();
  const { status } = useSyncStatus();
  const { settings, updateSettings } = useSettingsStore();
  const {
    classes,
    byClass,
    getMovieById,
    addClass,
    renameClassLabel,
    renameClassTagline,
    moveClass,
    deleteClass,
    forceSync: forceSyncMovies
  } = useMoviesStore();
  const {
    classes: tvClasses,
    byClass: tvByClass,
    getShowById,
    addClass: addTvClass,
    renameClassLabel: renameTvClassLabel,
    renameClassTagline: renameTvClassTagline,
    moveClass: moveTvClass,
    deleteClass: deleteTvClass,
    forceSync: forceSyncTv
  } = useTvStore();
  const {
    classes: peopleClasses,
    byClass: peopleByClass,
    addClass: addPersonClass,
    renameItemClass: renamePersonClassLabel,
    renameItemClassTagline: renamePersonClassTagline,
    moveItemInClassOrder: movePersonClass,
    deleteClass: deletePersonClass,
    forceSync: forceSyncPeople
  } = usePeopleStore();
  const {
    classes: directorClasses,
    byClass: directorByClass,
    addClass: addDirectorClass,
    renameItemClass: renameDirectorClassLabel,
    renameItemClassTagline: renameDirectorClassTagline,
    moveItemInClassOrder: moveDirectorClass,
    deleteClass: deleteDirectorClass,
    forceSync: forceSyncDirectors
  } = useDirectorsStore();
  const { forceSync: forceSyncWatchlist } = useWatchlistStore();
  const [newRankedLabel, setNewRankedLabel] = useState('');
  const [newUnrankedLabel, setNewUnrankedLabel] = useState('');
  const [newRankedLabelTv, setNewRankedLabelTv] = useState('');
  const [newUnrankedLabelTv, setNewUnrankedLabelTv] = useState('');
  const [newRankedLabelPeople, setNewRankedLabelPeople] = useState('');
  const [newUnrankedLabelPeople, setNewUnrankedLabelPeople] = useState('');
  const [newRankedLabelDirectors, setNewRankedLabelDirectors] = useState('');
  const [newUnrankedLabelDirectors, setNewUnrankedLabelDirectors] = useState('');
  const [expandedSections, setExpandedSections] = useState<Record<ClassSectionKey, boolean>>({
    movies: false,
    tv: false,
    actors: false,
    directors: false,
    display: false,
    dev: false,
    babydev: false,
  });
  const [persistDebounceSec, setPersistDebounceSec] = useState(() =>
    Math.round(getPersistDebounceMs() / 1000)
  );
  const [quotes, setQuotes] = useState<FirebaseQuote[]>([]);
  const [quoteForm, setQuoteForm] = useState({
    category: 'settings' as QuoteCategory,
    text: '',
    character: '',
    source: '',
  });
  const [editingQuoteId, setEditingQuoteId] = useState<string | null>(null);
  const [quotesLoading, setQuotesLoading] = useState(false);
  const [quotesError, setQuotesError] = useState<string | null>(null);
  const [quotesNotice, setQuotesNotice] = useState<string | null>(null);
  const [showQuoteModal, setShowQuoteModal] = useState(false);
  const [showQuotesList, setShowQuotesList] = useState(false);
  const [pendingDeleteQuoteId, setPendingDeleteQuoteId] = useState<string | null>(null);
  const [showPfpModal, setShowPfpModal] = useState(false);
  const [pfpQuery, setPfpQuery] = useState('');
  const [pfpPosterPath, setPfpPosterPath] = useState<string | null>(null);
  const [savingPfp, setSavingPfp] = useState(false);
  const [showManageBabiesModal, setShowManageBabiesModal] = useState(false);
  const [babyUsersLoading, setBabyUsersLoading] = useState(false);
  const [babyUsersError, setBabyUsersError] = useState<string | null>(null);
  const [babyUsers, setBabyUsers] = useState<BabyRoleUser[]>([]);

  const signedIn = hasFirebaseConfig && user;

  const rankedClasses = useMemo(() => classes.filter((c) => c.isRanked), [classes]);
  const nonRankedClasses = useMemo(() => classes.filter((c) => !c.isRanked), [classes]);
  const rankedTvClasses = useMemo(() => tvClasses.filter((c) => c.isRanked), [tvClasses]);
  const nonRankedTvClasses = useMemo(() => tvClasses.filter((c) => !c.isRanked), [tvClasses]);
  const canAddRanked = useMemo(() => newRankedLabel.trim().length > 0, [newRankedLabel]);
  const canAddUnranked = useMemo(() => newUnrankedLabel.trim().length > 0, [newUnrankedLabel]);
  const canAddRankedTv = useMemo(() => newRankedLabelTv.trim().length > 0, [newRankedLabelTv]);
  const canAddUnrankedTv = useMemo(() => newUnrankedLabelTv.trim().length > 0, [newUnrankedLabelTv]);
  const canAddRankedPeople = useMemo(() => newRankedLabelPeople.trim().length > 0, [newRankedLabelPeople]);
  const canAddUnrankedPeople = useMemo(() => newUnrankedLabelPeople.trim().length > 0, [newUnrankedLabelPeople]);
  const canAddRankedDirectors = useMemo(() => newRankedLabelDirectors.trim().length > 0, [newRankedLabelDirectors]);
  const canAddUnrankedDirectors = useMemo(() => newUnrankedLabelDirectors.trim().length > 0, [newUnrankedLabelDirectors]);

  const rankedPeopleClasses = useMemo(() => peopleClasses.filter((c) => c.isRanked), [peopleClasses]);
  const nonRankedPeopleClasses = useMemo(() => peopleClasses.filter((c) => !c.isRanked), [peopleClasses]);
  const rankedDirectorClasses = useMemo(() => directorClasses.filter((c) => c.isRanked), [directorClasses]);
  const nonRankedDirectorClasses = useMemo(() => directorClasses.filter((c) => !c.isRanked), [directorClasses]);
  const sortedQuotes = useMemo(() => {
    const categoryOrder = new Map(quoteCategories.map((category, index) => [category, index]));
    return quotes.slice().sort((a, b) => {
      const categoryA = categoryOrder.get(a.category) ?? Number.MAX_SAFE_INTEGER;
      const categoryB = categoryOrder.get(b.category) ?? Number.MAX_SAFE_INTEGER;
      if (categoryA !== categoryB) return categoryA - categoryB;
      return a.text.localeCompare(b.text);
    });
  }, [quotes]);
  const accountAgeDays = useMemo(() => {
    const creationTime = user?.metadata.creationTime;
    if (!creationTime) return null;
    const createdAt = new Date(creationTime);
    if (Number.isNaN(createdAt.getTime())) return null;
    const ms = Date.now() - createdAt.getTime();
    return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
  }, [user?.metadata.creationTime]);

  const savedPosterCandidates = useMemo(() => {
    const movies = Object.values(byClass).flat().map((item) => ({
      id: item.id,
      title: item.title,
      posterPath: item.posterPath,
      mediaType: 'movie' as const,
      absoluteRank: item.absoluteRank,
    }));
    const shows = Object.values(tvByClass).flat().map((item) => ({
      id: item.id,
      title: item.title,
      posterPath: item.posterPath,
      mediaType: 'tv' as const,
      absoluteRank: item.absoluteRank,
    }));
    return [...movies, ...shows].filter((item) => Boolean(item.posterPath));
  }, [byClass, tvByClass]);

  const parseAbsoluteRank = (value?: string): number => {
    if (!value) return -1;
    const m = value.match(/^(\d+)\s*\/\s*\d+$/);
    return m ? Number(m[1]) : Number.MAX_SAFE_INTEGER;
  };

  const filteredPfpCandidates = useMemo(() => {
    const q = pfpQuery.trim().toLowerCase();
    const source = q
      ? savedPosterCandidates.filter((item) => item.title.toLowerCase().includes(q))
      : savedPosterCandidates;
    return source
      .slice()
      .sort((a, b) => {
        if (a.mediaType !== b.mediaType) return a.mediaType === 'movie' ? -1 : 1;
        const rankA = parseAbsoluteRank(
          a.mediaType === 'movie' ? (a.absoluteRank ?? getMovieById(a.id)?.absoluteRank) : (a.absoluteRank ?? getShowById(a.id)?.absoluteRank)
        );
        const rankB = parseAbsoluteRank(
          b.mediaType === 'movie' ? (b.absoluteRank ?? getMovieById(b.id)?.absoluteRank) : (b.absoluteRank ?? getShowById(b.id)?.absoluteRank)
        );
        if (rankA !== rankB) return rankA - rankB;
        return a.title.localeCompare(b.title);
      });
  }, [savedPosterCandidates, pfpQuery, getMovieById, getShowById]);

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

  const canManageQuotes = isAdmin || isBabyDev;
  const canManageDevPanel = isAdmin;
  const canManageBabydevPanel = isBabyDev;

  useEffect(() => subscribePersistDebounce(() => {
    setPersistDebounceSec(Math.round(getPersistDebounceMs() / 1000));
  }), []);

  useEffect(() => {
    if (!signedIn || !canManageQuotes || !db) return;
    let cancelled = false;
    (async () => {
      setQuotesLoading(true);
      setQuotesError(null);
      try {
        const migrated = await migrateLegacyQuotesIfNeeded(db);
        if (!cancelled && migrated) {
          setQuotesNotice('Legacy quotes migrated to Firebase.');
        }
        const loaded = await loadGlobalQuotes(db);
        if (!cancelled) setQuotes(loaded);
      } catch (error) {
        if (!cancelled) {
          setQuotesError(error instanceof Error ? error.message : 'Failed to load quotes.');
        }
      } finally {
        if (!cancelled) setQuotesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [signedIn, canManageQuotes]);

  useEffect(() => {
    if (!signedIn || !db || !user?.uid) return;
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'users', user.uid));
        if (cancelled) return;
        const data = snap.data();
        const posterPath = typeof data?.pfpPosterPath === 'string' ? data.pfpPosterPath : null;
        setPfpPosterPath(posterPath);
      } catch {
        if (!cancelled) setPfpPosterPath(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [signedIn, user?.uid]);

  const savePfp = async (posterPath: string | null) => {
    if (!signedIn || !db || !user) return;
    setSavingPfp(true);
    try {
      const photoURL = posterPath ? tmdbImagePath(posterPath, 'w185') : null;
      await updateProfile(user, { photoURL: photoURL ?? null });
      await setDoc(doc(db, 'users', user.uid), { pfpPosterPath: posterPath }, { merge: true });
      setPfpPosterPath(posterPath);
      setShowPfpModal(false);
      setPfpQuery('');
    } finally {
      setSavingPfp(false);
    }
  };

  const loadBabyRoleUsers = async () => {
    if (!db || !isAdmin) return;
    setBabyUsersLoading(true);
    setBabyUsersError(null);
    try {
      const snap = await getDocs(collection(db, 'users'));
      const users = snap.docs.map((d) => {
        const data = d.data();
        return {
          uid: d.id,
          username: typeof data.username === 'string' ? data.username : undefined,
          email: typeof data.email === 'string' ? data.email : undefined,
          devRole: typeof data.devRole === 'string' ? data.devRole : undefined
        } satisfies BabyRoleUser;
      });
      users.sort((a, b) => (a.username ?? a.email ?? a.uid).localeCompare(b.username ?? b.email ?? b.uid));
      setBabyUsers(users);
    } catch (error) {
      setBabyUsersError(error instanceof Error ? error.message : 'Failed to load users.');
    } finally {
      setBabyUsersLoading(false);
    }
  };

  const toggleBabyDev = async (targetUid: string, enable: boolean) => {
    if (!db || !isAdmin) return;
    try {
      await setDoc(doc(db, 'users', targetUid), { devRole: enable ? 'babydev' : null }, { merge: true });
      setBabyUsers((prev) => prev.map((u) => (u.uid === targetUid ? { ...u, devRole: enable ? 'babydev' : undefined } : u)));
    } catch (error) {
      setBabyUsersError(error instanceof Error ? error.message : 'Failed to update babydev role.');
    }
  };

  const handleToggleSection = (section: ClassSectionKey) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const resetQuoteForm = () => {
    setQuoteForm({ category: 'settings', text: '', character: '', source: '' });
    setEditingQuoteId(null);
  };

  const openAddQuoteModal = () => {
    resetQuoteForm();
    setShowQuoteModal(true);
  };

  const openEditQuoteModal = (quote: FirebaseQuote) => {
    setEditingQuoteId(quote.id);
    setQuoteForm({
      category: quote.category,
      text: quote.text,
      character: quote.character,
      source: quote.source,
    });
    setShowQuoteModal(true);
  };

  const closeQuoteModal = () => {
    setShowQuoteModal(false);
    resetQuoteForm();
  };

  const renderQuoteTools = (sectionTitle: string) => (
    <div className="settings-dev-quotes">
      <h3 className="settings-subtitle settings-subtitle-spaced">{sectionTitle}</h3>
      {quotesError ? <p className="settings-quote-error">{quotesError}</p> : null}
      <div className="settings-list-actions">
        <button type="button" className="settings-btn" disabled={!db} onClick={openAddQuoteModal}>
          Add Quote
        </button>
        <button
          type="button"
          className="settings-btn settings-btn-subtle"
          onClick={() => setShowQuotesList((prev) => !prev)}
          disabled={quotesLoading}
        >
          {showQuotesList ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          {showQuotesList ? 'Hide All Quotes' : 'Show All Quotes'}
        </button>
      </div>

      {showQuotesList && (
        <div className="settings-list settings-quotes-dropdown">
          {quotesLoading && <p className="settings-muted">Loading quotes…</p>}
          {!quotesLoading && sortedQuotes.length === 0 && <p className="settings-muted">No quotes in Firebase yet.</p>}
          {!quotesLoading &&
            sortedQuotes.map((quote) => (
              <div key={quote.id} className="settings-list-item">
                <span className="settings-class-name">
                  <span className="settings-class-name-main">{quote.category.toUpperCase()}</span>
                  <span className="settings-class-tagline">
                    {' '}
                    | &ldquo;{quote.text}&rdquo; — {quote.character} ({quote.source})
                  </span>
                </span>
                <div className="settings-list-actions">
                  <button type="button" className="settings-btn settings-btn-subtle" onClick={() => openEditQuoteModal(quote)}>
                    Edit
                  </button>
                  <button
                    type="button"
                    className={`settings-btn settings-btn-subtle ${pendingDeleteQuoteId === quote.id ? 'settings-btn-danger' : ''}`}
                    onClick={async () => {
                      if (!db) return;
                      if (pendingDeleteQuoteId !== quote.id) {
                        setPendingDeleteQuoteId(quote.id);
                        return;
                      }
                      try {
                        await deleteGlobalQuote(db, quote.id);
                        setPendingDeleteQuoteId(null);
                        await refreshQuotes();
                      } catch (error) {
                        setQuotesError(error instanceof Error ? error.message : 'Failed to delete quote.');
                      }
                    }}
                  >
                    {pendingDeleteQuoteId === quote.id ? 'Confirm Delete' : 'Delete'}
                  </button>
                </div>
              </div>
            ))}
        </div>
      )}

      {showQuoteModal && (
        <div className="settings-modal-backdrop" role="presentation" onClick={closeQuoteModal}>
          <div
            className="settings-modal card-surface"
            role="dialog"
            aria-modal="true"
            aria-label={editingQuoteId ? 'Edit quote modal' : 'Add quote modal'}
            onClick={(e) => e.stopPropagation()}
          >
            <h4 className="settings-title">{editingQuoteId ? 'Edit Quote' : 'Add Quote'}</h4>
            <div className="settings-quote-form">
              <select
                className="settings-select"
                value={quoteForm.category}
                onChange={(e) => setQuoteForm((prev) => ({ ...prev, category: e.target.value as QuoteCategory }))}
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
                value={quoteForm.text}
                onChange={(e) => setQuoteForm((prev) => ({ ...prev, text: e.target.value }))}
              />
              <input
                className="settings-input"
                placeholder="Character / speaker"
                value={quoteForm.character}
                onChange={(e) => setQuoteForm((prev) => ({ ...prev, character: e.target.value }))}
              />
              <input
                className="settings-input"
                placeholder="Source title"
                value={quoteForm.source}
                onChange={(e) => setQuoteForm((prev) => ({ ...prev, source: e.target.value }))}
              />
              <div className="settings-list-actions">
                <button
                  type="button"
                  className="settings-btn"
                  disabled={
                    !db ||
                    quoteForm.text.trim().length === 0 ||
                    quoteForm.character.trim().length === 0 ||
                    quoteForm.source.trim().length === 0
                  }
                  onClick={async () => {
                    if (!db) return;
                    try {
                      if (editingQuoteId) {
                        await updateGlobalQuote(db, editingQuoteId, {
                          category: quoteForm.category,
                          text: quoteForm.text,
                          character: quoteForm.character,
                          source: quoteForm.source,
                        });
                        setQuotesNotice('Quote updated.');
                      } else {
                        await addGlobalQuote(db, {
                          category: quoteForm.category,
                          text: quoteForm.text,
                          character: quoteForm.character,
                          source: quoteForm.source,
                        });
                        setQuotesNotice('Quote added.');
                      }
                      closeQuoteModal();
                      await refreshQuotes();
                    } catch (error) {
                      setQuotesError(error instanceof Error ? error.message : 'Failed to save quote.');
                    }
                  }}
                >
                  Save
                </button>
                <button type="button" className="settings-btn settings-btn-subtle" onClick={closeQuoteModal}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <section>
      <header className="page-heading">
        <div>
          <h1 className="page-title">Settings</h1>
          <RandomQuote />
        </div>
      </header>

      <div className="settings-grid">
        {quotesNotice ? (
          <p className="settings-muted" style={{ gridColumn: '1 / -1', marginBottom: '0.15rem' }}>
            {quotesNotice}
          </p>
        ) : null}
        <div className="settings-card card-surface settings-collapsible-card">
          <div className="settings-card-heading-row">
            <h2 className="settings-title">Movie Class Management</h2>
            <button
              type="button"
              className="settings-collapse-toggle"
              onClick={() => handleToggleSection('movies')}
              aria-label={expandedSections.movies ? 'Collapse movie class management' : 'Expand movie class management'}
            >
              {expandedSections.movies ? <ChevronDown size={18} strokeWidth={2.8} /> : <ChevronRight size={18} strokeWidth={2.8} />}
            </button>
          </div>
          {expandedSections.movies && (
            <>
          <p className="settings-muted">
            Ranked classes affect global percentiles/rankings;
            unranked ones do not.
          </p>

          <h3 className="settings-subtitle">Ranked classes</h3>
          <div className="settings-list">
            {rankedClasses.map((c) => {
              const count = (byClass[c.key] ?? []).length;
              return (
                <div key={c.key} className="settings-list-item">
                  <span className="settings-class-name">
                    <span className="settings-class-name-main">{c.label}</span>
                    {c.tagline ? <span className="settings-class-tagline"> | {c.tagline}</span> : null}{' '}
                    <span className="settings-class-count">
                      · {count} {count === 1 ? 'entry' : 'entries'}
                    </span>
                  </span>
                  <div className="settings-list-actions">
                    <button
                      type="button"
                      className="settings-btn settings-btn-subtle"
                      onClick={() => moveClass(c.key, -1)}
                    >
                      <ArrowUp size={14} />
                    </button>
                    <button
                      type="button"
                      className="settings-btn settings-btn-subtle"
                      onClick={() => moveClass(c.key, 1)}
                    >
                      <ArrowDown size={14} />
                    </button>
                    <button
                      type="button"
                      className="settings-btn settings-btn-subtle"
                      disabled={c.key === 'UNRANKED' || c.key === 'BABY' || c.key === 'DELICIOUS_GARBAGE'}
                      onClick={() => {
                        const next = prompt('Rename class', c.label);
                        if (!next) return;
                        const sanitized = sanitizeLabel(next);
                        if (isValidLabel(sanitized)) {
                          renameClassLabel(c.key, sanitized);
                        }
                      }}
                    >
                      Rename
                    </button>
                    <button
                      type="button"
                      className="settings-btn settings-btn-subtle"
                      onClick={() => {
                        const next = prompt('Tagline (shown as "CLASS | tagline")', c.tagline ?? '');
                        if (next === null) return;
                        const sanitized = sanitizeTagline(next);
                        if (isValidTagline(sanitized)) {
                          renameClassTagline(c.key, sanitized);
                        }
                      }}
                    >
                      Tagline
                    </button>
                    <button
                      type="button"
                      className="settings-btn settings-btn-subtle"
                      disabled={count > 0 || c.key === 'UNRANKED' || c.key === 'BABY' || c.key === 'DELICIOUS_GARBAGE'}
                      onClick={() => deleteClass(c.key)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="settings-add-row">
            <input
              value={newRankedLabel}
              onChange={(e) => setNewRankedLabel(e.target.value)}
              placeholder="Add ranked class…"
              className="settings-input"
            />
            <button
              type="button"
              className="settings-btn"
              disabled={!canAddRanked}
              onClick={() => {
                const sanitized = sanitizeClassName(newRankedLabel);
                if (sanitized) {
                  addClass(sanitized.label, { isRanked: true });
                  setNewRankedLabel('');
                }
              }}
            >
              Add
            </button>
          </div>

          <h3 className="settings-subtitle settings-subtitle-spaced">Unranked / saved classes</h3>
          <div className="settings-list">
            {nonRankedClasses.map((c) => {
              const count = (byClass[c.key] ?? []).length;
              return (
                <div key={c.key} className="settings-list-item">
                  <span className="settings-class-name">
                    <span className="settings-class-name-main">{c.label}</span>
                    {c.tagline ? <span className="settings-class-tagline"> | {c.tagline}</span> : null}{' '}
                    <span className="settings-class-count">
                      · {count} {count === 1 ? 'entry' : 'entries'}
                    </span>
                  </span>
                  <div className="settings-list-actions">
                    <button
                      type="button"
                      className="settings-btn settings-btn-subtle"
                      onClick={() => moveClass(c.key, -1)}
                    >
                      <ArrowUp size={14} />
                    </button>
                    <button
                      type="button"
                      className="settings-btn settings-btn-subtle"
                      onClick={() => moveClass(c.key, 1)}
                    >
                      <ArrowDown size={14} />
                    </button>
                    <button
                      type="button"
                      className="settings-btn settings-btn-subtle"
                      disabled={c.key === 'UNRANKED' || c.key === 'BABY' || c.key === 'DELICIOUS_GARBAGE'}
                      onClick={() => {
                        const next = prompt('Rename class', c.label);
                        if (!next) return;
                        const sanitized = sanitizeLabel(next);
                        if (isValidLabel(sanitized)) {
                          renameClassLabel(c.key, sanitized);
                        }
                      }}
                    >
                      Rename
                    </button>
                    <button
                      type="button"
                      className="settings-btn settings-btn-subtle"
                      onClick={() => {
                        const next = prompt('Tagline (shown as "CLASS | tagline")', c.tagline ?? '');
                        if (next === null) return;
                        const sanitized = sanitizeTagline(next);
                        if (isValidTagline(sanitized)) {
                          renameClassTagline(c.key, sanitized);
                        }
                      }}
                    >
                      Tagline
                    </button>
                    <button
                      type="button"
                      className="settings-btn settings-btn-subtle"
                      disabled={count > 0 || c.key === 'UNRANKED' || c.key === 'BABY' || c.key === 'DELICIOUS_GARBAGE'}
                      onClick={() => deleteClass(c.key)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="settings-add-row">
            <input
              value={newUnrankedLabel}
              onChange={(e) => setNewUnrankedLabel(e.target.value)}
              placeholder="Add unranked class…"
              className="settings-input"
            />
            <button
              type="button"
              className="settings-btn"
              disabled={!canAddUnranked}
              onClick={() => {
                addClass(newUnrankedLabel, { isRanked: false });
                setNewUnrankedLabel('');
              }}
            >
              Add
            </button>
          </div>
            </>
          )}
        </div>

        <div className="settings-card card-surface settings-collapsible-card">
          <div className="settings-card-heading-row">
            <h2 className="settings-title">TV Show Class Management</h2>
            <button
              type="button"
              className="settings-collapse-toggle"
              onClick={() => handleToggleSection('tv')}
              aria-label={expandedSections.tv ? 'Collapse TV show class management' : 'Expand TV show class management'}
            >
              {expandedSections.tv ? <ChevronDown size={18} strokeWidth={2.8} /> : <ChevronRight size={18} strokeWidth={2.8} />}
            </button>
          </div>
          {expandedSections.tv && (
            <>
          <p className="settings-muted">
            Ranked classes affect global percentiles/rankings;
            unranked ones do not.
          </p>

          <h3 className="settings-subtitle">Ranked classes</h3>
          <div className="settings-list">
            {rankedTvClasses.map((c) => {
              const count = (tvByClass[c.key] ?? []).length;
              return (
                <div key={c.key} className="settings-list-item">
                  <span className="settings-class-name">
                    <span className="settings-class-name-main">{c.label}</span>
                    {c.tagline ? <span className="settings-class-tagline"> | {c.tagline}</span> : null}{' '}
                    <span className="settings-class-count">
                      · {count} {count === 1 ? 'entry' : 'entries'}
                    </span>
                  </span>
                  <div className="settings-list-actions">
                    <button type="button" className="settings-btn settings-btn-subtle" onClick={() => moveTvClass(c.key, -1)}><ArrowUp size={14} /></button>
                    <button type="button" className="settings-btn settings-btn-subtle" onClick={() => moveTvClass(c.key, 1)}><ArrowDown size={14} /></button>
                    <button
                      type="button"
                      className="settings-btn settings-btn-subtle"
                      disabled={c.key === 'UNRANKED' || c.key === 'BABY' || c.key === 'DELICIOUS_GARBAGE'}
                      onClick={() => {
                        const next = prompt('Rename class', c.label);
                        if (!next) return;
                        renameTvClassLabel(c.key, next);
                      }}
                    >
                      Rename
                    </button>
                    <button
                      type="button"
                      className="settings-btn settings-btn-subtle"
                      onClick={() => {
                        const next = prompt('Tagline (shown as "CLASS | tagline")', c.tagline ?? '');
                        if (next === null) return;
                        renameTvClassTagline(c.key, next);
                      }}
                    >
                      Tagline
                    </button>
                    <button type="button" className="settings-btn settings-btn-subtle" disabled={count > 0 || c.key === 'UNRANKED' || c.key === 'BABY' || c.key === 'DELICIOUS_GARBAGE'} onClick={() => deleteTvClass(c.key)}>Delete</button>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="settings-add-row">
            <input value={newRankedLabelTv} onChange={(e) => setNewRankedLabelTv(e.target.value)} placeholder="Add ranked class…" className="settings-input" />
            <button type="button" className="settings-btn" disabled={!canAddRankedTv} onClick={() => { addTvClass(newRankedLabelTv, { isRanked: true }); setNewRankedLabelTv(''); }}>Add</button>
          </div>

          <h3 className="settings-subtitle settings-subtitle-spaced">Unranked / saved classes</h3>
          <div className="settings-list">
            {nonRankedTvClasses.map((c) => {
              const count = (tvByClass[c.key] ?? []).length;
              return (
                <div key={c.key} className="settings-list-item">
                  <span className="settings-class-name">
                    <span className="settings-class-name-main">{c.label}</span>
                    {c.tagline ? <span className="settings-class-tagline"> | {c.tagline}</span> : null}{' '}
                    <span className="settings-class-count">
                      · {count} {count === 1 ? 'entry' : 'entries'}
                    </span>
                  </span>
                  <div className="settings-list-actions">
                    <button type="button" className="settings-btn settings-btn-subtle" onClick={() => moveTvClass(c.key, -1)}><ArrowUp size={14} /></button>
                    <button type="button" className="settings-btn settings-btn-subtle" onClick={() => moveTvClass(c.key, 1)}><ArrowDown size={14} /></button>
                    <button
                      type="button"
                      className="settings-btn settings-btn-subtle"
                      disabled={c.key === 'UNRANKED' || c.key === 'BABY' || c.key === 'DELICIOUS_GARBAGE'}
                      onClick={() => {
                        const next = prompt('Rename class', c.label);
                        if (!next) return;
                        renameTvClassLabel(c.key, next);
                      }}
                    >
                      Rename
                    </button>
                    <button
                      type="button"
                      className="settings-btn settings-btn-subtle"
                      onClick={() => {
                        const next = prompt('Tagline (shown as "CLASS | tagline")', c.tagline ?? '');
                        if (next === null) return;
                        renameTvClassTagline(c.key, next);
                      }}
                    >
                      Tagline
                    </button>
                    <button type="button" className="settings-btn settings-btn-subtle" disabled={count > 0 || c.key === 'UNRANKED' || c.key === 'BABY' || c.key === 'DELICIOUS_GARBAGE'} onClick={() => deleteTvClass(c.key)}>Delete</button>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="settings-add-row">
            <input value={newUnrankedLabelTv} onChange={(e) => setNewUnrankedLabelTv(e.target.value)} placeholder="Add unranked class…" className="settings-input" />
            <button type="button" className="settings-btn" disabled={!canAddUnrankedTv} onClick={() => { addTvClass(newUnrankedLabelTv, { isRanked: false }); setNewUnrankedLabelTv(''); }}>Add</button>
          </div>
            </>
          )}
        </div>

        <div className="settings-card card-surface settings-collapsible-card">
          <div className="settings-card-heading-row">
            <h2 className="settings-title">Actor Class Management</h2>
            <button
              type="button"
              className="settings-collapse-toggle"
              onClick={() => handleToggleSection('actors')}
              aria-label={expandedSections.actors ? 'Collapse actor class management' : 'Expand actor class management'}
            >
              {expandedSections.actors ? <ChevronDown size={18} strokeWidth={2.8} /> : <ChevronRight size={18} strokeWidth={2.8} />}
            </button>
          </div>
          {expandedSections.actors && (
            <>
          <p className="settings-muted">
            Ranked classes for actors.
          </p>

          <h3 className="settings-subtitle">Ranked classes</h3>
          <div className="settings-list">
            {rankedPeopleClasses.map((c) => {
              const count = (peopleByClass[c.key] ?? []).length;
              return (
                <div key={c.key} className="settings-list-item">
                  <span className="settings-class-name">
                    <span className="settings-class-name-main">{c.label}</span>
                    {c.tagline ? <span className="settings-class-tagline"> | {c.tagline}</span> : null}{' '}
                    <span className="settings-class-count">
                      · {count} {count === 1 ? 'entry' : 'entries'}
                    </span>
                  </span>
                  <div className="settings-list-actions">
                    <button type="button" className="settings-btn settings-btn-subtle" onClick={() => movePersonClass(c.key, -1)}><ArrowUp size={14} /></button>
                    <button type="button" className="settings-btn settings-btn-subtle" onClick={() => movePersonClass(c.key, 1)}><ArrowDown size={14} /></button>
                    <button
                      type="button"
                      className="settings-btn settings-btn-subtle"
                      disabled={c.key === 'UNRANKED' || c.key === 'BABY' || c.key === 'DELICIOUS_GARBAGE'}
                      onClick={() => {
                        const next = prompt('Rename class', c.label);
                        if (!next) return;
                        renamePersonClassLabel(c.key, next);
                      }}
                    >
                      Rename
                    </button>
                    <button
                      type="button"
                      className="settings-btn settings-btn-subtle"
                      onClick={() => {
                        const next = prompt('Tagline', c.tagline ?? '');
                        if (next === null) return;
                        renamePersonClassTagline(c.key, next);
                      }}
                    >
                      Tagline
                    </button>
                    <button type="button" className="settings-btn settings-btn-subtle" disabled={count > 0 || c.key === 'UNRANKED' || c.key === 'BABY' || c.key === 'DELICIOUS_GARBAGE'} onClick={() => { if (confirm(`Delete class ${c.label}?`)) deletePersonClass(c.key); }}>Delete</button>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="settings-add-row">
            <input value={newRankedLabelPeople} onChange={(e) => setNewRankedLabelPeople(e.target.value)} placeholder="Add ranked class…" className="settings-input" />
            <button type="button" className="settings-btn" disabled={!canAddRankedPeople} onClick={() => { addPersonClass(newRankedLabelPeople, { isRanked: true }); setNewRankedLabelPeople(''); }}>Add</button>
          </div>

          {peopleClasses.length === 0 && (
            <div className="settings-empty-classes">
              <p>No actor classes defined.</p>
              <button type="button" className="settings-btn settings-btn-subtle" onClick={() => {
                defaultPeopleClasses.forEach(c => addPersonClass(c.label, { isRanked: c.isRanked }));
              }}>Initialize with Defaults</button>
            </div>
          )}

          <h3 className="settings-subtitle settings-subtitle-spaced">Unranked / saved classes</h3>
          <div className="settings-list">
            {nonRankedPeopleClasses.map((c) => {
              const count = (peopleByClass[c.key] ?? []).length;
              return (
                <div key={c.key} className="settings-list-item">
                  <span className="settings-class-name">
                    <span className="settings-class-name-main">{c.label}</span>
                    {c.tagline ? <span className="settings-class-tagline"> | {c.tagline}</span> : null}{' '}
                    <span className="settings-class-count">
                      · {count} {count === 1 ? 'entry' : 'entries'}
                    </span>
                  </span>
                  <div className="settings-list-actions">
                    <button type="button" className="settings-btn settings-btn-subtle" onClick={() => movePersonClass(c.key, -1)}><ArrowUp size={14} /></button>
                    <button type="button" className="settings-btn settings-btn-subtle" onClick={() => movePersonClass(c.key, 1)}><ArrowDown size={14} /></button>
                    <button
                      type="button"
                      className="settings-btn settings-btn-subtle"
                      disabled={c.key === 'UNRANKED' || c.key === 'BABY' || c.key === 'DELICIOUS_GARBAGE'}
                      onClick={() => {
                        const next = prompt('Rename class', c.label);
                        if (!next) return;
                        renamePersonClassLabel(c.key, next);
                      }}
                    >
                      Rename
                    </button>
                    <button
                      type="button"
                      className="settings-btn settings-btn-subtle"
                      onClick={() => {
                        const next = prompt('Tagline', c.tagline ?? '');
                        if (next === null) return;
                        renamePersonClassTagline(c.key, next);
                      }}
                    >
                      Tagline
                    </button>
                    <button type="button" className="settings-btn settings-btn-subtle" disabled={count > 0 || c.key === 'UNRANKED' || c.key === 'BABY' || c.key === 'DELICIOUS_GARBAGE'} onClick={() => { if (confirm(`Delete class ${c.label}?`)) deletePersonClass(c.key); }}>Delete</button>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="settings-add-row">
            <input value={newUnrankedLabelPeople} onChange={(e) => setNewUnrankedLabelPeople(e.target.value)} placeholder="Add unranked class…" className="settings-input" />
            <button type="button" className="settings-btn" disabled={!canAddUnrankedPeople} onClick={() => { addPersonClass(newUnrankedLabelPeople, { isRanked: false }); setNewUnrankedLabelPeople(''); }}>Add</button>
          </div>
            </>
          )}
        </div>

        <div className="settings-card card-surface settings-collapsible-card">
          <div className="settings-card-heading-row">
            <h2 className="settings-title">Director Class Management</h2>
            <button
              type="button"
              className="settings-collapse-toggle"
              onClick={() => handleToggleSection('directors')}
              aria-label={expandedSections.directors ? 'Collapse director class management' : 'Expand director class management'}
            >
              {expandedSections.directors ? <ChevronDown size={18} strokeWidth={2.8} /> : <ChevronRight size={18} strokeWidth={2.8} />}
            </button>
          </div>
          {expandedSections.directors && (
            <>
          <p className="settings-muted">
            Ranked classes for directors.
          </p>

          <h3 className="settings-subtitle">Ranked classes</h3>
          <div className="settings-list">
            {rankedDirectorClasses.map((c) => {
              const count = (directorByClass[c.key] ?? []).length;
              return (
                <div key={c.key} className="settings-list-item">
                  <span className="settings-class-name">
                    <span className="settings-class-name-main">{c.label}</span>
                    {c.tagline ? <span className="settings-class-tagline"> | {c.tagline}</span> : null}{' '}
                    <span className="settings-class-count">
                      · {count} {count === 1 ? 'entry' : 'entries'}
                    </span>
                  </span>
                  <div className="settings-list-actions">
                    <button type="button" className="settings-btn settings-btn-subtle" onClick={() => moveDirectorClass(c.key, -1)}><ArrowUp size={14} /></button>
                    <button type="button" className="settings-btn settings-btn-subtle" onClick={() => moveDirectorClass(c.key, 1)}><ArrowDown size={14} /></button>
                    <button
                      type="button"
                      className="settings-btn settings-btn-subtle"
                      disabled={c.key === 'UNRANKED' || c.key === 'BABY' || c.key === 'DELICIOUS_GARBAGE'}
                      onClick={() => {
                        const next = prompt('Rename class', c.label);
                        if (!next) return;
                        renameDirectorClassLabel(c.key, next);
                      }}
                    >
                      Rename
                    </button>
                    <button
                      type="button"
                      className="settings-btn settings-btn-subtle"
                      onClick={() => {
                        const next = prompt('Tagline', c.tagline ?? '');
                        if (next === null) return;
                        renameDirectorClassTagline(c.key, next);
                      }}
                    >
                      Tagline
                    </button>
                    <button type="button" className="settings-btn settings-btn-subtle" disabled={count > 0 || c.key === 'UNRANKED' || c.key === 'BABY' || c.key === 'DELICIOUS_GARBAGE'} onClick={() => { if (confirm(`Delete class ${c.label}?`)) deleteDirectorClass(c.key); }}>Delete</button>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="settings-add-row">
            <input value={newRankedLabelDirectors} onChange={(e) => setNewRankedLabelDirectors(e.target.value)} placeholder="Add ranked class…" className="settings-input" />
            <button type="button" className="settings-btn" disabled={!canAddRankedDirectors} onClick={() => { addDirectorClass(newRankedLabelDirectors, { isRanked: true }); setNewRankedLabelDirectors(''); }}>Add</button>
          </div>

          {directorClasses.length === 0 && (
            <div className="settings-empty-classes">
              <p>No director classes defined.</p>
              <button type="button" className="settings-btn settings-btn-subtle" onClick={() => {
                defaultDirectorsClasses.forEach(c => addDirectorClass(c.label, { isRanked: c.isRanked }));
              }}>Initialize with Defaults</button>
            </div>
          )}

          <h3 className="settings-subtitle settings-subtitle-spaced">Unranked / saved classes</h3>
          <div className="settings-list">
            {nonRankedDirectorClasses.map((c) => {
              const count = (directorByClass[c.key] ?? []).length;
              return (
                <div key={c.key} className="settings-list-item">
                  <span className="settings-class-name">
                    <span className="settings-class-name-main">{c.label}</span>
                    {c.tagline ? <span className="settings-class-tagline"> | {c.tagline}</span> : null}{' '}
                    <span className="settings-class-count">
                      · {count} {count === 1 ? 'entry' : 'entries'}
                    </span>
                  </span>
                  <div className="settings-list-actions">
                    <button type="button" className="settings-btn settings-btn-subtle" onClick={() => moveDirectorClass(c.key, -1)}><ArrowUp size={14} /></button>
                    <button type="button" className="settings-btn settings-btn-subtle" onClick={() => moveDirectorClass(c.key, 1)}><ArrowDown size={14} /></button>
                    <button
                      type="button"
                      className="settings-btn settings-btn-subtle"
                      disabled={c.key === 'UNRANKED' || c.key === 'BABY' || c.key === 'DELICIOUS_GARBAGE'}
                      onClick={() => {
                        const next = prompt('Rename class', c.label);
                        if (!next) return;
                        renameDirectorClassLabel(c.key, next);
                      }}
                    >
                      Rename
                    </button>
                    <button
                      type="button"
                      className="settings-btn settings-btn-subtle"
                      onClick={() => {
                        const next = prompt('Tagline', c.tagline ?? '');
                        if (next === null) return;
                        renameDirectorClassTagline(c.key, next);
                      }}
                    >
                      Tagline
                    </button>
                    <button type="button" className="settings-btn settings-btn-subtle" disabled={count > 0 || c.key === 'UNRANKED' || c.key === 'BABY' || c.key === 'DELICIOUS_GARBAGE'} onClick={() => { if (confirm(`Delete class ${c.label}?`)) deleteDirectorClass(c.key); }}>Delete</button>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="settings-add-row">
            <input value={newUnrankedLabelDirectors} onChange={(e) => setNewUnrankedLabelDirectors(e.target.value)} placeholder="Add unranked class…" className="settings-input" />
            <button type="button" className="settings-btn" disabled={!canAddUnrankedDirectors} onClick={() => { addDirectorClass(newUnrankedLabelDirectors, { isRanked: false }); setNewUnrankedLabelDirectors(''); }}>Add</button>
          </div>
            </>
          )}
        </div>

        <div className="settings-card card-surface settings-card-wide settings-collapsible-card">
          <div className="settings-card-heading-row">
            <h2 className="settings-title">Display</h2>
            <button
              type="button"
              className="settings-collapse-toggle"
              onClick={() => handleToggleSection('display')}
              aria-label={expandedSections.display ? 'Collapse display settings' : 'Expand display settings'}
            >
              {expandedSections.display ? <ChevronDown size={18} strokeWidth={2.8} /> : <ChevronRight size={18} strokeWidth={2.8} />}
            </button>
          </div>
          {expandedSections.display && (
            <>
          <p className="settings-muted">
            Adjust how entries appear across your lists.
          </p>
          <label className="settings-slider-label">
            <span>Show Cast Count: <strong>{settings.topCastCount}</strong></span>
            <input
              type="range"
              min={0}
              max={20}
              value={settings.topCastCount}
              className="settings-slider"
              onChange={(e) => {
                const v = Number(e.target.value);
                updateSettings({ topCastCount: v });
              }}
            />
            <span className="settings-slider-range">0 – 20</span>
          </label>

          <label className="settings-slider-label">
            <span>Actor Projects Limit: <strong>{settings.personProjectsLimit}</strong></span>
            <input
              type="range"
              min={0}
              max={20}
              value={settings.personProjectsLimit}
              className="settings-slider"
              onChange={(e) => {
                const v = Number(e.target.value);
                updateSettings({ personProjectsLimit: v });
              }}
            />
            <span className="settings-slider-range">0 – 20</span>
          </label>

          <div className="settings-select-row">
            <span className="settings-select-label">Tile View Size: <strong>{settings.tileViewSize}</strong></span>
            <select
              value={settings.tileViewSize}
              className="settings-select"
              onChange={(e) => {
                const v = e.target.value as 'small' | 'default' | 'big';
                updateSettings({ tileViewSize: v });
              }}
            >
              <option value="small">Small</option>
              <option value="default">Default</option>
              <option value="big">Big</option>
            </select>
          </div>


          <div className="settings-toggle-row">
            <div className="settings-toggle-info">
              <span className="settings-toggle-label">Boycott certain shows/movies from actor lists</span>
              <span className="settings-toggle-description">Hides variety/talk shows and awards like 'The Tonight Show', 'Jimmy Kimmel Live!', 'The Graham Norton Show', 'Golden Globe Awards', 'LIVE with Kelly and Mark', 'The One Show', 'Late Night with Seth Meyers', and 'The Late Late Show with James Corden'.</span>
            </div>
            <label className="settings-switch">
              <input
                type="checkbox"
                checked={settings.boycottTalkShows}
                onChange={(e) => updateSettings({ boycottTalkShows: e.target.checked })}
              />
              <span className="settings-switch-slider"></span>
            </label>
          </div>

          <div className="settings-toggle-row">
            <div className="settings-toggle-info">
              <span className="settings-toggle-label">Exclude The Simpsons from actor projects</span>
              <span className="settings-toggle-description">Hides The Simpsons TV show from actor filmographies to reduce clutter.</span>
            </div>
            <label className="settings-switch">
              <input
                type="checkbox"
                checked={settings.excludeSimpsons}
                onChange={(e) => updateSettings({ excludeSimpsons: e.target.checked })}
              />
              <span className="settings-switch-slider"></span>
            </label>
          </div>

          <div className="settings-toggle-row">
            <div className="settings-toggle-info">
              <span className="settings-toggle-label">Exclude "Self" roles from actor projects</span>
              <span className="settings-toggle-description">Hides roles where actors are listed as "Self" or "Self - Guest" (talk show appearances, award shows, documentaries, etc.) from info modal and detailed views.</span>
            </div>
            <label className="settings-switch">
              <input
                type="checkbox"
                checked={settings.excludeSelfRoles}
                onChange={(e) => updateSettings({ excludeSelfRoles: e.target.checked })}
              />
              <span className="settings-switch-slider"></span>
            </label>
          </div>

          <div className="settings-toggle-row">
            <div className="settings-toggle-info">
              <span className="settings-toggle-label">Use spotlight background</span>
              <span className="settings-toggle-description">Adds animated colored dots background effect (like login screen) to all pages.</span>
            </div>
            <label className="settings-switch">
              <input
                type="checkbox"
                checked={settings.useSpotlightBackground}
                onChange={(e) => updateSettings({ useSpotlightBackground: e.target.checked })}
              />
              <span className="settings-switch-slider"></span>
            </label>
          </div>

            </>
          )}
        </div>

        {signedIn && canManageDevPanel && (
          <div className="settings-card card-surface settings-card-wide settings-collapsible-card">
            <div className="settings-card-heading-row">
              <h2 className="settings-title">Dev</h2>
              <button
                type="button"
                className="settings-collapse-toggle"
                onClick={() => handleToggleSection('dev')}
                aria-label={expandedSections.dev ? 'Collapse dev settings' : 'Expand dev settings'}
              >
                {expandedSections.dev ? <ChevronDown size={18} strokeWidth={2.8} /> : <ChevronRight size={18} strokeWidth={2.8} />}
              </button>
            </div>
            {expandedSections.dev && (
              <>
                <p className="settings-muted">Admin tools (all environments).</p>
                <div className="settings-toggle-row">
                  <div className="settings-toggle-info">
                    <span className="settings-toggle-label">Global persist debounce</span>
                    <span className="settings-toggle-description">
                      Idle seconds after movies, TV, actors, directors, or watchlist changes before auto-save (1–120).
                      Default {DEFAULT_PERSIST_DEBOUNCE_MS / 1000}s. Takes effect on the next save cycle.
                    </span>
                  </div>
                </div>
                <div className="settings-add-row">
                  <input
                    type="number"
                    min={1}
                    max={120}
                    className="settings-input"
                    style={{ maxWidth: '6rem' }}
                    value={persistDebounceSec}
                    onChange={(e) => setPersistDebounceSec(Number(e.target.value))}
                  />
                  <span className="settings-muted" style={{ alignSelf: 'center' }}>
                    seconds
                  </span>
                  <button
                    type="button"
                    className="settings-btn"
                    onClick={() => {
                      const raw = Number(persistDebounceSec);
                      const sec = Math.min(120, Math.max(1, Math.round(Number.isFinite(raw) ? raw : DEFAULT_PERSIST_DEBOUNCE_MS / 1000)));
                      setPersistDebounceMs(sec * 1000);
                      setPersistDebounceSec(sec);
                      setQuotesNotice(`Persist debounce set to ${sec}s.`);
                    }}
                  >
                    Apply
                  </button>
                </div>
                {signedIn && canManageQuotes ? renderQuoteTools('Movie/Show Quote Management (Dev)') : null}
                <div className="settings-list-actions">
                  <button
                    type="button"
                    className="settings-btn"
                    onClick={() => {
                      setShowManageBabiesModal(true);
                      void loadBabyRoleUsers();
                    }}
                  >
                    Manage babies
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {signedIn && canManageBabydevPanel && (
          <div className="settings-card card-surface settings-card-wide settings-collapsible-card">
            <div className="settings-card-heading-row">
              <h2 className="settings-title">Babydev</h2>
              <button
                type="button"
                className="settings-collapse-toggle"
                onClick={() => handleToggleSection('babydev')}
                aria-label={expandedSections.babydev ? 'Collapse babydev settings' : 'Expand babydev settings'}
              >
                {expandedSections.babydev ? <ChevronDown size={18} strokeWidth={2.8} /> : <ChevronRight size={18} strokeWidth={2.8} />}
              </button>
            </div>
            {expandedSections.babydev && (
              <>
                <p className="settings-muted">Quote tools for BabyDev access.</p>
                {signedIn && canManageQuotes ? renderQuoteTools('Movie/Show Quote Management (BabyDev)') : null}
              </>
            )}
          </div>
        )}

        <div className="settings-card card-surface settings-card-wide">
          <h2 className="settings-title">Account</h2>
          <div className="settings-account-card">
            <div className="settings-account-row">
              <span className="settings-account-label">Signed in as</span>
              <span className="settings-account-value">
                {signedIn ? (user?.displayName || username || 'User') : 'Not signed in'}
              </span>
            </div>
            <div className="settings-account-row">
              <span className="settings-account-label">Account age</span>
              <span className="settings-account-value">
                {signedIn && accountAgeDays !== null ? `${accountAgeDays} days` : 'N/A'}
              </span>
            </div>
            <div className="settings-account-row">
              <span className="settings-account-label">Profile Picture</span>
              <span className="settings-account-value settings-account-value--pfp">
                {pfpPosterPath ? (
                  <img
                    src={tmdbImagePath(pfpPosterPath, 'w92') ?? ''}
                    alt="Current profile picture"
                    className="settings-pfp-preview"
                  />
                ) : (
                  'Not set'
                )}
                <button type="button" className="settings-btn settings-btn-subtle" onClick={() => setShowPfpModal(true)}>
                  Choose
                </button>
              </span>
            </div>
          </div>
          {signedIn && (
            <button type="button" className="settings-btn" onClick={() => signOut()}>
              Sign out
            </button>
          )}
        </div>
      </div>

      {showPfpModal && (
        <div className="settings-modal-backdrop" role="presentation" onClick={() => setShowPfpModal(false)}>
          <div
            className="settings-modal settings-pfp-modal card-surface"
            role="dialog"
            aria-modal="true"
            aria-label="Choose profile picture"
            onClick={(e) => e.stopPropagation()}
          >
            <h4 className="settings-title">Choose Profile Picture</h4>
            <input
              className="settings-input"
              placeholder="Search your saved movies/shows..."
              value={pfpQuery}
              onChange={(e) => setPfpQuery(e.target.value)}
              autoFocus
            />
            <div className="settings-pfp-grid">
              {filteredPfpCandidates.slice(0, 120).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="settings-pfp-option"
                  onClick={() => void savePfp(item.posterPath ?? null)}
                  disabled={savingPfp}
                  title={`${item.title} (${item.mediaType === 'movie' ? 'Movie' : 'Show'})`}
                >
                  <img src={tmdbImagePath(item.posterPath, 'w185') ?? ''} alt={item.title} loading="lazy" />
                </button>
              ))}
              {filteredPfpCandidates.length === 0 ? (
                <p className="settings-muted">No saved entries with posters match this search.</p>
              ) : null}
            </div>
            <div className="settings-list-actions">
              <button
                type="button"
                className="settings-btn settings-btn-subtle"
                onClick={() => void savePfp(null)}
                disabled={savingPfp}
              >
                Clear profile picture
              </button>
              <button type="button" className="settings-btn settings-btn-subtle" onClick={() => setShowPfpModal(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      {showManageBabiesModal && (
        <div className="settings-modal-backdrop" role="presentation" onClick={() => setShowManageBabiesModal(false)}>
          <div
            className="settings-modal settings-babydev-modal card-surface"
            role="dialog"
            aria-modal="true"
            aria-label="Manage baby devs"
            onClick={(e) => e.stopPropagation()}
          >
            <h4 className="settings-title">Manage BabyDev Access</h4>
            {babyUsersError ? <p className="settings-quote-error">{babyUsersError}</p> : null}
            {babyUsersLoading ? <p className="settings-muted">Loading users…</p> : null}
            {!babyUsersLoading && (
              <div className="settings-list settings-babydev-list">
                {babyUsers.map((u) => {
                  const isBaby = (u.devRole ?? '').toLowerCase() === 'babydev';
                  return (
                    <div key={u.uid} className="settings-list-item">
                      <span className="settings-class-name">
                        <span className="settings-class-name-main">{u.username ?? u.email ?? u.uid}</span>
                        <span className="settings-class-tagline"> | {u.email ?? u.uid}</span>
                      </span>
                      <div className="settings-list-actions">
                        <label className="settings-switch">
                          <input
                            type="checkbox"
                            checked={isBaby}
                            onChange={(e) => void toggleBabyDev(u.uid, e.target.checked)}
                          />
                          <span className="settings-switch-slider"></span>
                        </label>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="settings-list-actions">
              <button type="button" className="settings-btn settings-btn-subtle" onClick={() => setShowManageBabiesModal(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </section >
  );
}
