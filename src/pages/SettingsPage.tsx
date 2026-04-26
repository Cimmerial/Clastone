import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, ChevronRight, GripVertical, Home, Pencil, Trash2, X } from 'lucide-react';
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
  migrateGeneralQuotesToProfile,
  migrateLegacyQuotesIfNeeded,
  updateGlobalQuote,
  type FirebaseQuote,
  type QuoteCategory,
} from '../lib/firestoreQuotes';
import { tmdbImagePath, tmdbMediaPosters } from '../lib/tmdb';
import {
  getPersistDebounceMs,
  setPersistDebounceMs,
  subscribePersistDebounce,
  DEFAULT_PERSIST_DEBOUNCE_MS,
} from '../lib/persistDebounce';
import './SettingsPage.css';

const quoteCategories: QuoteCategory[] = ['movies', 'tv', 'actors', 'directors', 'watchlist', 'search', 'profile', 'settings'];

type ClassSectionKey = 'classManagement' | 'display' | 'dev' | 'babydev';
type ClassManagerKind = 'movies' | 'tv' | 'actors' | 'directors';
type EditableClass = { key: string; label: string; tagline?: string; isRanked?: boolean };

type BabyRoleUser = {
  uid: string;
  username?: string;
  email?: string;
  devRole?: string;
};

export function SettingsPage() {
  const { user, username, signOut, isAdmin, isBabyDev, pfpPhotoUrl } = useAuth();
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
    classManagement: false,
    display: false,
    dev: false,
    babydev: false,
  });
  const [selectedClassManager, setSelectedClassManager] = useState<ClassManagerKind>('movies');
  const [isClassTypeMenuOpen, setIsClassTypeMenuOpen] = useState(false);
  const [draggedClassKey, setDraggedClassKey] = useState<string | null>(null);
  const [draggedClassGroup, setDraggedClassGroup] = useState<'ranked' | 'unranked' | null>(null);
  const [editingClass, setEditingClass] = useState<{ kind: ClassManagerKind; key: string } | null>(null);
  const [editingLabel, setEditingLabel] = useState('');
  const [editingTagline, setEditingTagline] = useState('');
  const [persistDebounceSec, setPersistDebounceSec] = useState(() =>
    Math.round(getPersistDebounceMs() / 1000)
  );
  const [quotes, setQuotes] = useState<FirebaseQuote[]>([]);
  const [quoteForm, setQuoteForm] = useState({
    category: 'movies' as QuoteCategory,
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
  const [posterLookupTarget, setPosterLookupTarget] = useState<{
    id: string;
    title: string;
    mediaType: 'movie' | 'tv';
    tmdbId: number;
  } | null>(null);
  const [alternatePosterPaths, setAlternatePosterPaths] = useState<string[]>([]);
  const [loadingAlternatePosters, setLoadingAlternatePosters] = useState(false);
  const [alternatePosterError, setAlternatePosterError] = useState<string | null>(null);
  const [uploadingPfp, setUploadingPfp] = useState(false);
  const [showManageBabiesModal, setShowManageBabiesModal] = useState(false);
  const [babyUsersLoading, setBabyUsersLoading] = useState(false);
  const [babyUsersError, setBabyUsersError] = useState<string | null>(null);
  const [babyUsers, setBabyUsers] = useState<BabyRoleUser[]>([]);

  const signedIn = hasFirebaseConfig && user;

  const canAddRanked = useMemo(() => newRankedLabel.trim().length > 0, [newRankedLabel]);
  const canAddUnranked = useMemo(() => newUnrankedLabel.trim().length > 0, [newUnrankedLabel]);
  const canAddRankedTv = useMemo(() => newRankedLabelTv.trim().length > 0, [newRankedLabelTv]);
  const canAddUnrankedTv = useMemo(() => newUnrankedLabelTv.trim().length > 0, [newUnrankedLabelTv]);
  const canAddRankedPeople = useMemo(() => newRankedLabelPeople.trim().length > 0, [newRankedLabelPeople]);
  const canAddUnrankedPeople = useMemo(() => newUnrankedLabelPeople.trim().length > 0, [newUnrankedLabelPeople]);
  const canAddRankedDirectors = useMemo(() => newRankedLabelDirectors.trim().length > 0, [newRankedLabelDirectors]);
  const canAddUnrankedDirectors = useMemo(() => newUnrankedLabelDirectors.trim().length > 0, [newUnrankedLabelDirectors]);
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
      tmdbId: item.tmdbId,
    }));
    const shows = Object.values(tvByClass).flat().map((item) => ({
      id: item.id,
      title: item.title,
      posterPath: item.posterPath,
      mediaType: 'tv' as const,
      absoluteRank: item.absoluteRank,
      tmdbId: item.tmdbId,
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
  const canUploadCustomPfp = isAdmin || isBabyDev;

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
        const migratedGeneral = await migrateGeneralQuotesToProfile(db);
        if (!cancelled && migratedGeneral) {
          setQuotesNotice('General quotes migrated to Profile quotes.');
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
      await setDoc(doc(db, 'users', user.uid), { pfpPosterPath: posterPath, pfpPhotoUrl: null }, { merge: true });
      setPfpPosterPath(posterPath);
      setShowPfpModal(false);
      setPfpQuery('');
      setPosterLookupTarget(null);
      setAlternatePosterPaths([]);
      setAlternatePosterError(null);
    } finally {
      setSavingPfp(false);
    }
  };

  const uploadCustomPfp = async (file: File) => {
    if (!signedIn || !db || !user) return;
    const isImage = file.type.startsWith('image/');
    if (!isImage) {
      setAlternatePosterError('Please choose an image file.');
      return;
    }
    // Stored as data URL in Firestore user doc; keep well under 1MB document limit.
    const maxBytes = 600 * 1024;
    if (file.size > maxBytes) {
      setAlternatePosterError('Please use an image smaller than 600KB.');
      return;
    }
    setUploadingPfp(true);
    setAlternatePosterError(null);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('Failed to read image'));
        reader.onload = () => {
          if (typeof reader.result === 'string') resolve(reader.result);
          else reject(new Error('Invalid image data'));
        };
        reader.readAsDataURL(file);
      });
      await setDoc(doc(db, 'users', user.uid), { pfpPosterPath: null, pfpPhotoUrl: dataUrl }, { merge: true });
      setPfpPosterPath(null);
      setShowPfpModal(false);
      setPfpQuery('');
      setPosterLookupTarget(null);
      setAlternatePosterPaths([]);
      setAlternatePosterError(null);
    } catch {
      setAlternatePosterError('Could not upload that image right now.');
    } finally {
      setUploadingPfp(false);
    }
  };

  const handleViewOtherPosters = async (item: (typeof filteredPfpCandidates)[number]) => {
    if (item.tmdbId == null) {
      setPosterLookupTarget(null);
      setAlternatePosterPaths([]);
      setAlternatePosterError('This saved entry has no TMDB id, so alternate posters are unavailable.');
      return;
    }
    setPosterLookupTarget({ id: item.id, title: item.title, mediaType: item.mediaType, tmdbId: item.tmdbId });
    setAlternatePosterPaths([]);
    setAlternatePosterError(null);
    setLoadingAlternatePosters(true);
    try {
      const posters = await tmdbMediaPosters(item.tmdbId, item.mediaType);
      setAlternatePosterPaths(posters);
      if (posters.length === 0) {
        setAlternatePosterError('No alternate posters found on TMDB for this title.');
      }
    } catch {
      setAlternatePosterError('Could not load alternate posters right now.');
    } finally {
      setLoadingAlternatePosters(false);
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

  const classManagerOptions: Array<{ key: ClassManagerKind; label: string }> = [
    { key: 'movies', label: 'Movies' },
    { key: 'tv', label: 'TV Shows' },
    { key: 'actors', label: 'Actors' },
    { key: 'directors', label: 'Directors' }
  ];

  const activeClassManager = useMemo(() => {
    switch (selectedClassManager) {
      case 'tv':
        return {
          classes: tvClasses as EditableClass[],
          byClass: tvByClass as Record<string, unknown[]>,
          addClass: (label: string, options?: { isRanked?: boolean }) => addTvClass(label, options),
          renameLabel: (classKey: string, next: string) => renameTvClassLabel(classKey as any, next),
          renameTagline: (classKey: string, next: string) => renameTvClassTagline(classKey as any, next),
          moveClass: (classKey: string, delta: number) => moveTvClass(classKey as any, delta),
          deleteClass: (classKey: string) => deleteTvClass(classKey as any),
          canInitializeDefaults: false
        };
      case 'actors':
        return {
          classes: peopleClasses as EditableClass[],
          byClass: peopleByClass as Record<string, unknown[]>,
          addClass: addPersonClass,
          renameLabel: renamePersonClassLabel,
          renameTagline: renamePersonClassTagline,
          moveClass: movePersonClass,
          deleteClass: deletePersonClass,
          canInitializeDefaults: true,
          initializeDefaults: () => defaultPeopleClasses.forEach((c) => addPersonClass(c.label, { isRanked: c.isRanked }))
        };
      case 'directors':
        return {
          classes: directorClasses as EditableClass[],
          byClass: directorByClass as Record<string, unknown[]>,
          addClass: addDirectorClass,
          renameLabel: renameDirectorClassLabel,
          renameTagline: renameDirectorClassTagline,
          moveClass: moveDirectorClass,
          deleteClass: deleteDirectorClass,
          canInitializeDefaults: true,
          initializeDefaults: () =>
            defaultDirectorsClasses.forEach((c) => addDirectorClass(c.label, { isRanked: c.isRanked }))
        };
      case 'movies':
      default:
        return {
          classes: classes as EditableClass[],
          byClass: byClass as Record<string, unknown[]>,
          addClass: (label: string, options?: { isRanked?: boolean }) => addClass(label, options),
          renameLabel: (classKey: string, next: string) => renameClassLabel(classKey as any, next),
          renameTagline: (classKey: string, next: string) => renameClassTagline(classKey as any, next),
          moveClass: (classKey: string, delta: number) => moveClass(classKey as any, delta),
          deleteClass: (classKey: string) => deleteClass(classKey as any),
          canInitializeDefaults: false
        };
    }
  }, [
    selectedClassManager,
    tvClasses,
    tvByClass,
    addTvClass,
    renameTvClassLabel,
    renameTvClassTagline,
    moveTvClass,
    deleteTvClass,
    peopleClasses,
    peopleByClass,
    addPersonClass,
    renamePersonClassLabel,
    renamePersonClassTagline,
    movePersonClass,
    deletePersonClass,
    directorClasses,
    directorByClass,
    addDirectorClass,
    renameDirectorClassLabel,
    renameDirectorClassTagline,
    moveDirectorClass,
    deleteDirectorClass,
    classes,
    byClass,
    addClass,
    renameClassLabel,
    renameClassTagline,
    moveClass,
    deleteClass
  ]);

  const rankedManagedClasses = useMemo(
    () => activeClassManager.classes.filter((c) => c.isRanked !== false),
    [activeClassManager]
  );
  const unrankedManagedClasses = useMemo(
    () => activeClassManager.classes.filter((c) => c.isRanked === false),
    [activeClassManager]
  );

  const canDeleteManagedClass = (classKey: string) =>
    classKey !== 'UNRANKED' && classKey !== 'BABY' && classKey !== 'DELICIOUS_GARBAGE';

  const persistClassEdits = () => {
    if (!editingClass || editingClass.kind !== selectedClassManager) return;
    const sanitizedLabel = sanitizeLabel(editingLabel);
    const sanitizedTagline = sanitizeTagline(editingTagline);
    if (isValidLabel(sanitizedLabel)) {
      activeClassManager.renameLabel(editingClass.key, sanitizedLabel);
    }
    if (isValidTagline(sanitizedTagline)) {
      activeClassManager.renameTagline(editingClass.key, sanitizedTagline);
    }
    setEditingClass(null);
  };

  const reorderClassWithinGroup = (
    group: 'ranked' | 'unranked',
    sourceKey: string,
    targetKey: string
  ) => {
    const groupKeys = (group === 'ranked' ? rankedManagedClasses : unrankedManagedClasses).map((c) => c.key);
    const fromIndex = groupKeys.indexOf(sourceKey);
    const toIndex = groupKeys.indexOf(targetKey);
    if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return;
    const delta = fromIndex < toIndex ? 1 : -1;
    const steps = Math.abs(toIndex - fromIndex);
    for (let i = 0; i < steps; i += 1) {
      activeClassManager.moveClass(sourceKey, delta);
    }
  };

  useEffect(() => {
    setEditingClass(null);
    setIsClassTypeMenuOpen(false);
  }, [selectedClassManager]);

  const resetQuoteForm = () => {
    setQuoteForm({ category: 'movies', text: '', character: '', source: '' });
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
        <div className="settings-card card-surface settings-card-wide settings-collapsible-card">
          <div className="settings-card-heading-row">
            <h2 className="settings-title">Class Management</h2>
            <button
              type="button"
              className="settings-collapse-toggle"
              onClick={() => handleToggleSection('classManagement')}
              aria-label={expandedSections.classManagement ? 'Collapse class management' : 'Expand class management'}
            >
              {expandedSections.classManagement ? <ChevronDown size={18} strokeWidth={2.8} /> : <ChevronRight size={18} strokeWidth={2.8} />}
            </button>
          </div>
          {expandedSections.classManagement && (
            <>
              <p className="settings-muted">
                Drag to reorder classes. Ranked and unranked groups are managed separately.
              </p>
              <div className="settings-class-type-picker">
                <span className="settings-select-label">Editing:</span>
                <div className="settings-type-dropdown">
                  <button
                    type="button"
                    className="settings-type-dropdown-trigger"
                    onClick={() => setIsClassTypeMenuOpen((prev) => !prev)}
                  >
                    {classManagerOptions.find((opt) => opt.key === selectedClassManager)?.label}
                    <ChevronDown size={14} />
                  </button>
                  {isClassTypeMenuOpen ? (
                    <div className="settings-type-dropdown-menu">
                      {classManagerOptions.map((opt) => (
                        <button
                          key={opt.key}
                          type="button"
                          className={`settings-type-dropdown-item ${opt.key === selectedClassManager ? 'is-active' : ''}`}
                          onClick={() => setSelectedClassManager(opt.key)}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>

              <h3 className="settings-subtitle">Ranked classes</h3>
              <div className="settings-list">
                {rankedManagedClasses.map((c) => {
                  const count = (activeClassManager.byClass[c.key] ?? []).length;
                  const isEditing = editingClass?.kind === selectedClassManager && editingClass.key === c.key;
                  const isLocked = c.key === 'UNRANKED';
                  return (
                    <div
                      key={c.key}
                      className="settings-list-item settings-class-item"
                      draggable
                      onDragStart={() => {
                        setDraggedClassKey(c.key);
                        setDraggedClassGroup('ranked');
                      }}
                      onDragOver={(e) => {
                        if (draggedClassGroup === 'ranked') e.preventDefault();
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (!draggedClassKey) return;
                        reorderClassWithinGroup('ranked', draggedClassKey, c.key);
                        setDraggedClassKey(null);
                        setDraggedClassGroup(null);
                      }}
                      onDragEnd={() => {
                        setDraggedClassKey(null);
                        setDraggedClassGroup(null);
                      }}
                    >
                      <div className="settings-class-item-main">
                        <span className="settings-drag-handle"><GripVertical size={14} /></span>
                        <span className="settings-class-name">
                          <span className="settings-class-name-main">{c.label}</span>
                          {c.tagline ? <span className="settings-class-tagline"> | {c.tagline}</span> : null}
                          <span className="settings-class-count"> · {count} {count === 1 ? 'entry' : 'entries'}</span>
                        </span>
                      </div>
                      {!isLocked ? (
                        <div className="settings-list-actions">
                          <button
                            type="button"
                            className="settings-btn settings-btn-subtle"
                            onClick={() => {
                              setEditingClass({ kind: selectedClassManager, key: c.key });
                              setEditingLabel(c.label);
                              setEditingTagline(c.tagline ?? '');
                            }}
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            type="button"
                            className="settings-btn settings-btn-subtle"
                            disabled={count > 0 || !canDeleteManagedClass(c.key)}
                            onClick={() => {
                              if (confirm(`Delete class ${c.label}?`)) activeClassManager.deleteClass(c.key);
                            }}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ) : null}
                      {isEditing ? (
                        <div className="settings-inline-editor">
                          <input className="settings-input" value={editingLabel} onChange={(e) => setEditingLabel(e.target.value)} placeholder="Class name" />
                          <input className="settings-input" value={editingTagline} onChange={(e) => setEditingTagline(e.target.value)} placeholder="Tagline (optional)" />
                          <div className="settings-list-actions">
                            <button type="button" className="settings-btn settings-btn-subtle" onClick={persistClassEdits}><Check size={14} /></button>
                            <button type="button" className="settings-btn settings-btn-subtle" onClick={() => setEditingClass(null)}><X size={14} /></button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
              <div className="settings-add-row">
                <input
                  value={
                    selectedClassManager === 'movies' ? newRankedLabel :
                    selectedClassManager === 'tv' ? newRankedLabelTv :
                    selectedClassManager === 'actors' ? newRankedLabelPeople :
                    newRankedLabelDirectors
                  }
                  onChange={(e) => {
                    const v = e.target.value;
                    if (selectedClassManager === 'movies') setNewRankedLabel(v);
                    else if (selectedClassManager === 'tv') setNewRankedLabelTv(v);
                    else if (selectedClassManager === 'actors') setNewRankedLabelPeople(v);
                    else setNewRankedLabelDirectors(v);
                  }}
                  placeholder="Add ranked class…"
                  className="settings-input"
                />
                <button
                  type="button"
                  className="settings-btn"
                  disabled={
                    selectedClassManager === 'movies' ? !canAddRanked :
                    selectedClassManager === 'tv' ? !canAddRankedTv :
                    selectedClassManager === 'actors' ? !canAddRankedPeople :
                    !canAddRankedDirectors
                  }
                  onClick={() => {
                    const raw =
                      selectedClassManager === 'movies' ? newRankedLabel :
                      selectedClassManager === 'tv' ? newRankedLabelTv :
                      selectedClassManager === 'actors' ? newRankedLabelPeople :
                      newRankedLabelDirectors;
                    const sanitized = sanitizeClassName(raw);
                    if (!sanitized) return;
                    activeClassManager.addClass(sanitized.label, { isRanked: true });
                    if (selectedClassManager === 'movies') setNewRankedLabel('');
                    else if (selectedClassManager === 'tv') setNewRankedLabelTv('');
                    else if (selectedClassManager === 'actors') setNewRankedLabelPeople('');
                    else setNewRankedLabelDirectors('');
                  }}
                >
                  Add
                </button>
              </div>

              <h3 className="settings-subtitle settings-subtitle-spaced">Unranked / saved classes</h3>
              <div className="settings-list">
                {unrankedManagedClasses.map((c) => {
                  const count = (activeClassManager.byClass[c.key] ?? []).length;
                  const isEditing = editingClass?.kind === selectedClassManager && editingClass.key === c.key;
                  const isLocked = c.key === 'UNRANKED';
                  return (
                    <div
                      key={c.key}
                      className="settings-list-item settings-class-item"
                      draggable
                      onDragStart={() => {
                        setDraggedClassKey(c.key);
                        setDraggedClassGroup('unranked');
                      }}
                      onDragOver={(e) => {
                        if (draggedClassGroup === 'unranked') e.preventDefault();
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (!draggedClassKey) return;
                        reorderClassWithinGroup('unranked', draggedClassKey, c.key);
                        setDraggedClassKey(null);
                        setDraggedClassGroup(null);
                      }}
                      onDragEnd={() => {
                        setDraggedClassKey(null);
                        setDraggedClassGroup(null);
                      }}
                    >
                      <div className="settings-class-item-main">
                        <span className="settings-drag-handle"><GripVertical size={14} /></span>
                        <span className="settings-class-name">
                          <span className="settings-class-name-main">{c.label}</span>
                          {c.tagline ? <span className="settings-class-tagline"> | {c.tagline}</span> : null}
                          <span className="settings-class-count"> · {count} {count === 1 ? 'entry' : 'entries'}</span>
                        </span>
                      </div>
                      {!isLocked ? (
                        <div className="settings-list-actions">
                          <button
                            type="button"
                            className="settings-btn settings-btn-subtle"
                            onClick={() => {
                              setEditingClass({ kind: selectedClassManager, key: c.key });
                              setEditingLabel(c.label);
                              setEditingTagline(c.tagline ?? '');
                            }}
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            type="button"
                            className="settings-btn settings-btn-subtle"
                            disabled={count > 0 || !canDeleteManagedClass(c.key)}
                            onClick={() => {
                              if (confirm(`Delete class ${c.label}?`)) activeClassManager.deleteClass(c.key);
                            }}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ) : null}
                      {isEditing ? (
                        <div className="settings-inline-editor">
                          <input className="settings-input" value={editingLabel} onChange={(e) => setEditingLabel(e.target.value)} placeholder="Class name" />
                          <input className="settings-input" value={editingTagline} onChange={(e) => setEditingTagline(e.target.value)} placeholder="Tagline (optional)" />
                          <div className="settings-list-actions">
                            <button type="button" className="settings-btn settings-btn-subtle" onClick={persistClassEdits}><Check size={14} /></button>
                            <button type="button" className="settings-btn settings-btn-subtle" onClick={() => setEditingClass(null)}><X size={14} /></button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
              <div className="settings-add-row">
                <input
                  value={
                    selectedClassManager === 'movies' ? newUnrankedLabel :
                    selectedClassManager === 'tv' ? newUnrankedLabelTv :
                    selectedClassManager === 'actors' ? newUnrankedLabelPeople :
                    newUnrankedLabelDirectors
                  }
                  onChange={(e) => {
                    const v = e.target.value;
                    if (selectedClassManager === 'movies') setNewUnrankedLabel(v);
                    else if (selectedClassManager === 'tv') setNewUnrankedLabelTv(v);
                    else if (selectedClassManager === 'actors') setNewUnrankedLabelPeople(v);
                    else setNewUnrankedLabelDirectors(v);
                  }}
                  placeholder="Add unranked class…"
                  className="settings-input"
                />
                <button
                  type="button"
                  className="settings-btn"
                  disabled={
                    selectedClassManager === 'movies' ? !canAddUnranked :
                    selectedClassManager === 'tv' ? !canAddUnrankedTv :
                    selectedClassManager === 'actors' ? !canAddUnrankedPeople :
                    !canAddUnrankedDirectors
                  }
                  onClick={() => {
                    const raw =
                      selectedClassManager === 'movies' ? newUnrankedLabel :
                      selectedClassManager === 'tv' ? newUnrankedLabelTv :
                      selectedClassManager === 'actors' ? newUnrankedLabelPeople :
                      newUnrankedLabelDirectors;
                    const sanitized = sanitizeClassName(raw);
                    if (!sanitized) return;
                    activeClassManager.addClass(sanitized.label, { isRanked: false });
                    if (selectedClassManager === 'movies') setNewUnrankedLabel('');
                    else if (selectedClassManager === 'tv') setNewUnrankedLabelTv('');
                    else if (selectedClassManager === 'actors') setNewUnrankedLabelPeople('');
                    else setNewUnrankedLabelDirectors('');
                  }}
                >
                  Add
                </button>
              </div>
              {activeClassManager.canInitializeDefaults && activeClassManager.classes.length === 0 ? (
                <div className="settings-empty-classes">
                  <p>No classes defined.</p>
                  <button type="button" className="settings-btn settings-btn-subtle" onClick={activeClassManager.initializeDefaults}>
                    Initialize with Defaults
                  </button>
                </div>
              ) : null}
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

          <div className="settings-toggle-row">
            <div className="settings-toggle-info">
              <span className="settings-toggle-label">Collection seen/unseen style</span>
              <span className="settings-toggle-description">
                Off (default): unseen entries are grayed out. On: unseen entries look normal, and seen entries get a thick green border. Applies to your collections and friends' collection views.
              </span>
            </div>
            <label className="settings-switch">
              <input
                type="checkbox"
                checked={settings.collectionSeenBorderMode}
                onChange={(e) => updateSettings({ collectionSeenBorderMode: e.target.checked })}
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
                ) : pfpPhotoUrl ? (
                  <img
                    src={pfpPhotoUrl}
                    alt="Current profile picture"
                    className="settings-pfp-preview"
                  />
                ) : (
                  <span className="settings-pfp-placeholder" aria-label="No profile picture set">
                    <Home size={14} strokeWidth={2.25} aria-hidden />
                  </span>
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
            {alternatePosterError ? <p className="settings-quote-error">{alternatePosterError}</p> : null}
            {posterLookupTarget ? (
              <div className="settings-pfp-alt-head">
                <span className="settings-muted">
                  Other posters for: <strong>{posterLookupTarget.title}</strong>
                </span>
                <button
                  type="button"
                  className="settings-btn settings-btn-subtle"
                  onClick={() => {
                    setPosterLookupTarget(null);
                    setAlternatePosterPaths([]);
                    setAlternatePosterError(null);
                  }}
                  disabled={savingPfp || loadingAlternatePosters}
                >
                  Back to saved list
                </button>
              </div>
            ) : null}
            <div className="settings-pfp-grid">
              {posterLookupTarget ? (
                loadingAlternatePosters ? (
                  <p className="settings-muted">Loading alternate posters...</p>
                ) : (
                  alternatePosterPaths.slice(0, 120).map((posterPath) => (
                    <button
                      key={`${posterLookupTarget.mediaType}-${posterLookupTarget.tmdbId}-${posterPath}`}
                      type="button"
                      className="settings-pfp-option"
                      onClick={() => void savePfp(posterPath)}
                      disabled={savingPfp}
                      title={`Use poster from ${posterLookupTarget.title}`}
                    >
                      <img src={tmdbImagePath(posterPath, 'w185') ?? ''} alt={posterLookupTarget.title} loading="lazy" />
                    </button>
                  ))
                )
              ) : (
                filteredPfpCandidates.slice(0, 120).map((item) => (
                  <div key={`${item.mediaType}-${item.id}`} className="settings-pfp-candidate">
                    <button
                      type="button"
                      className="settings-pfp-option"
                      onClick={() => void savePfp(item.posterPath ?? null)}
                      disabled={savingPfp}
                      title={`${item.title} (${item.mediaType === 'movie' ? 'Movie' : 'Show'})`}
                    >
                      <img src={tmdbImagePath(item.posterPath, 'w185') ?? ''} alt={item.title} loading="lazy" />
                    </button>
                    <button
                      type="button"
                      className="settings-btn settings-btn-subtle settings-pfp-alt-btn"
                      onClick={() => void handleViewOtherPosters(item)}
                      disabled={savingPfp || loadingAlternatePosters}
                    >
                      View other posters
                    </button>
                  </div>
                ))
              )}
              {!posterLookupTarget && filteredPfpCandidates.length === 0 ? (
                <p className="settings-muted">No saved entries with posters match this search.</p>
              ) : null}
            </div>
            {canUploadCustomPfp ? (
              <div className="settings-pfp-upload-row">
                <label className="settings-btn settings-btn-subtle settings-pfp-upload-label">
                  Upload custom image
                  <input
                    type="file"
                    accept="image/*"
                    className="settings-pfp-upload-input"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void uploadCustomPfp(file);
                      e.currentTarget.value = '';
                    }}
                    disabled={savingPfp || loadingAlternatePosters || uploadingPfp}
                  />
                </label>
                {uploadingPfp ? <span className="settings-muted">Uploading image...</span> : null}
              </div>
            ) : null}
            <div className="settings-list-actions">
              <button
                type="button"
                className="settings-btn settings-btn-subtle"
                onClick={() => void savePfp(null)}
                disabled={savingPfp || uploadingPfp}
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
