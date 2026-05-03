import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Check, ChevronDown, ChevronRight, GripVertical, Home, Info, Pencil, Trash2, X } from 'lucide-react';
import { NavLink, useNavigate } from 'react-router-dom';
import { updateProfile } from 'firebase/auth';
import { collection, doc, getDoc, getDocs, query, setDoc, where } from 'firebase/firestore';
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
import { tmdbImagePath, tmdbMediaPosters } from '../lib/tmdb';
import {
  getPersistDebounceMs,
  setPersistDebounceMs,
  subscribePersistDebounce,
  DEFAULT_PERSIST_DEBOUNCE_MS,
} from '../lib/persistDebounce';
import {
  loadFeatureFeedback,
  updateFeatureFeedbackStatus,
  type FeatureFeedbackItem,
  type FeedbackKind,
  type FeedbackStatus,
} from '../lib/firestoreFeatureFeedback';
import './SettingsPage.css';

type ClassSectionKey = 'classManagement' | 'display' | 'dev' | 'babydev';
type ClassManagerKind = 'movies' | 'tv' | 'actors' | 'directors';
type EditableClass = { key: string; label: string; tagline?: string; isRanked?: boolean };

type BabyRoleUser = {
  uid: string;
  username?: string;
  email?: string;
  devRole?: string;
};

function DisplayToggle({
  label,
  info,
  checked,
  onChange,
  footer,
}: {
  label: string;
  info: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  footer?: ReactNode;
}) {
  return (
    <div className="settings-display-toggle-wrap">
      <div className="settings-display-toggle-row">
        <span className="settings-display-toggle-label">{label}</span>
        <span className="settings-display-info-wrap">
          <button type="button" className="settings-display-info-btn" aria-label={`About: ${label}`}>
            <Info size={15} strokeWidth={2.4} aria-hidden />
          </button>
          <div className="settings-display-tooltip" role="tooltip">
            {info}
          </div>
        </span>
        <label className="settings-switch">
          <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
          <span className="settings-switch-slider" />
        </label>
      </div>
      {footer ? <div className="settings-display-toggle-footer">{footer}</div> : null}
    </div>
  );
}

function SettingsCollapsibleCardHeader({
  title,
  expanded,
  onToggle,
  titleId,
}: {
  title: string;
  expanded: boolean;
  onToggle: () => void;
  titleId: string;
}) {
  return (
    <div
      className="settings-card-heading-row settings-card-heading-row--toggle"
      role="button"
      tabIndex={0}
      aria-expanded={expanded}
      aria-label={`${expanded ? 'Collapse' : 'Expand'} ${title}`}
      onClick={onToggle}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onToggle();
        }
      }}
    >
      <h2 className="settings-title" id={titleId}>
        {title}
      </h2>
      <span className="settings-collapse-toggle" aria-hidden="true">
        {expanded ? <ChevronDown size={18} strokeWidth={2.8} /> : <ChevronRight size={18} strokeWidth={2.8} />}
      </span>
    </div>
  );
}

export function SettingsPage() {
  const navigate = useNavigate();
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
  const [quotesNotice, setQuotesNotice] = useState<string | null>(null);
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
  const [exampleProfileUid, setExampleProfileUid] = useState<string | null>(null);
  const [featureFeedbackItems, setFeatureFeedbackItems] = useState<FeatureFeedbackItem[]>([]);
  const [featureFeedbackLoading, setFeatureFeedbackLoading] = useState(false);
  const [featureFeedbackError, setFeatureFeedbackError] = useState<string | null>(null);
  const [showCompletedFeedback, setShowCompletedFeedback] = useState<Record<FeedbackKind, boolean>>({
    feature_request: false,
    bug_report: false,
  });
  const [editingFeedbackItem, setEditingFeedbackItem] = useState<FeatureFeedbackItem | null>(null);
  const [editingFeedbackStatus, setEditingFeedbackStatus] = useState<FeedbackStatus>('default');
  const [savingFeedbackStatus, setSavingFeedbackStatus] = useState(false);

  const signedIn = hasFirebaseConfig && user;

  const canAddRanked = useMemo(() => newRankedLabel.trim().length > 0, [newRankedLabel]);
  const canAddUnranked = useMemo(() => newUnrankedLabel.trim().length > 0, [newUnrankedLabel]);
  const canAddRankedTv = useMemo(() => newRankedLabelTv.trim().length > 0, [newRankedLabelTv]);
  const canAddUnrankedTv = useMemo(() => newUnrankedLabelTv.trim().length > 0, [newUnrankedLabelTv]);
  const canAddRankedPeople = useMemo(() => newRankedLabelPeople.trim().length > 0, [newRankedLabelPeople]);
  const canAddUnrankedPeople = useMemo(() => newUnrankedLabelPeople.trim().length > 0, [newUnrankedLabelPeople]);
  const canAddRankedDirectors = useMemo(() => newRankedLabelDirectors.trim().length > 0, [newRankedLabelDirectors]);
  const canAddUnrankedDirectors = useMemo(() => newUnrankedLabelDirectors.trim().length > 0, [newUnrankedLabelDirectors]);
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

  const canManageQuotes = isAdmin || isBabyDev;
  const canManageDevPanel = isAdmin;
  const canManageBabydevPanel = isBabyDev;
  const canUploadCustomPfp = isAdmin || isBabyDev;
  const canManageFeatureFeedback = isAdmin;

  useEffect(() => subscribePersistDebounce(() => {
    setPersistDebounceSec(Math.round(getPersistDebounceMs() / 1000));
  }), []);

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

  useEffect(() => {
    if (!db) return;
    let cancelled = false;
    (async () => {
      try {
        const adminQuery = query(
          collection(db, 'users'),
          where('email', '==', 'cimmerial@clastone.local')
        );
        const snap = await getDocs(adminQuery);
        if (!cancelled) {
          setExampleProfileUid(snap.empty ? null : snap.docs[0].id);
        }
      } catch {
        if (!cancelled) setExampleProfileUid(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const refreshFeatureFeedback = async () => {
    if (!db || !canManageFeatureFeedback) return;
    setFeatureFeedbackLoading(true);
    setFeatureFeedbackError(null);
    try {
      const items = await loadFeatureFeedback(db);
      setFeatureFeedbackItems(items);
    } catch (error) {
      setFeatureFeedbackError(error instanceof Error ? error.message : 'Failed to load feedback.');
    } finally {
      setFeatureFeedbackLoading(false);
    }
  };

  useEffect(() => {
    if (!signedIn || !canManageFeatureFeedback) return;
    void refreshFeatureFeedback();
  }, [signedIn, canManageFeatureFeedback]);

  const groupedFeatureFeedback = useMemo(() => {
    const byKind: Record<FeedbackKind, FeatureFeedbackItem[]> = {
      feature_request: [],
      bug_report: [],
    };
    featureFeedbackItems.forEach((item) => {
      byKind[item.kind].push(item);
    });
    const sortOldestFirst = (a: FeatureFeedbackItem, b: FeatureFeedbackItem) =>
      a.createdAt.localeCompare(b.createdAt);
    (Object.keys(byKind) as FeedbackKind[]).forEach((kind) => {
      byKind[kind].sort(sortOldestFirst);
    });
    return byKind;
  }, [featureFeedbackItems]);

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

  const renderQuoteTools = (sectionTitle: string) => (
    <div className="settings-dev-quotes">
      <h3 className="settings-subtitle settings-subtitle-spaced">{sectionTitle}</h3>
      <p className="settings-muted">
        Quote management moved to the dedicated Quotes page.
      </p>
      <div className="settings-list-actions">
        <NavLink to="/quotes" className="settings-btn settings-btn-subtle">
          Open Quotes Page
        </NavLink>
      </div>
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
          <SettingsCollapsibleCardHeader
            title="Class Management"
            expanded={expandedSections.classManagement}
            onToggle={() => handleToggleSection('classManagement')}
            titleId="settings-heading-class-management"
          />
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
          <SettingsCollapsibleCardHeader
            title="Display"
            expanded={expandedSections.display}
            onToggle={() => handleToggleSection('display')}
            titleId="settings-heading-display"
          />
          {expandedSections.display && (
            <>
              <p className="settings-muted settings-display-lead">
                Short labels below; hover the info icon on each row for full behavior and examples.
              </p>

              <div className="settings-display-grid">
                <div className="settings-display-col">
                  <h3 className="settings-display-col-title">Actor projects</h3>
                  <DisplayToggle
                    label="Talk / awards clutter"
                    checked={settings.boycottTalkShows}
                    onChange={(v) => updateSettings({ boycottTalkShows: v })}
                    info='When on, drops variety and awards-style titles from person filmographies—examples include "The Tonight Show", "Jimmy Kimmel Live!", "The Graham Norton Show", "Golden Globe Awards", "LIVE with Kelly and Mark", "The One Show", "Late Night with Seth Meyers", and "The Late Late Show with James Corden". Applies to ranked actor/director rows, Search person projects, and the person info modal.'
                  />
                  <DisplayToggle
                    label="Hide “Self” credits"
                    checked={settings.excludeSelfRoles}
                    onChange={(v) => updateSettings({ excludeSelfRoles: v })}
                    info='Hides roles billed as "Self" or "Self - Guest" (talk-show beats, award ceremonies, documentary appearances, etc.) from the same places as other actor-project filters.'
                  />
                  <DisplayToggle
                    label="Hide The Simpsons"
                    checked={settings.excludeSimpsons}
                    onChange={(v) => updateSettings({ excludeSimpsons: v })}
                    info="Removes The Simpsons from appearing in filmography of people within info modal."
                  />
                  <DisplayToggle
                    label="Hide Family Guy"
                    checked={settings.excludeFamilyGuy}
                    onChange={(v) => updateSettings({ excludeFamilyGuy: v })}
                    info="Removes Family Guy from appearing in filmography of people within info modal."
                  />
                </div>

                <div className="settings-display-col">
                  <h3 className="settings-display-col-title">Layout</h3>
                  <div className="settings-display-tile-block">
                    <div className="settings-display-toggle-row settings-display-toggle-row--header-only">
                      <span className="settings-display-toggle-label">Poster tile size</span>
                      <span className="settings-display-info-wrap">
                        <button type="button" className="settings-display-info-btn" aria-label="About: Poster tile size">
                          <Info size={15} strokeWidth={2.4} aria-hidden />
                        </button>
                        <div className="settings-display-tooltip" role="tooltip">
                          Controls how large movie/show posters appear in tile-style lists app-wide. Small is the default for new sessions; pick Medium or Large if you want bigger thumbnails.
                        </div>
                      </span>
                    </div>
                    <div
                      className="settings-display-segmented"
                      role="group"
                      aria-label="Poster tile size"
                    >
                      {(
                        [
                          { key: 'small' as const, label: 'Small' },
                          { key: 'default' as const, label: 'Medium' },
                          { key: 'big' as const, label: 'Large' },
                        ]
                      ).map(({ key, label }) => (
                        <button
                          key={key}
                          type="button"
                          className={`settings-display-segmented-btn${settings.tileViewSize === key ? ' is-active' : ''}`}
                          onClick={() => updateSettings({ tileViewSize: key })}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <DisplayToggle
                    label="Spotlight backdrop"
                    checked={settings.useSpotlightBackground}
                    onChange={(v) => updateSettings({ useSpotlightBackground: v })}
                    info="Adds the animated colored-dot background (similar to the login screen) across main pages."
                  />
                  <DisplayToggle
                    label="Seen = green border"
                    checked={settings.collectionSeenBorderMode}
                    onChange={(v) => updateSettings({ collectionSeenBorderMode: v })}
                    info="In collections: off = unseen entries look muted; on = seen entries get a strong green border instead of graying out unseen. Applies to your lists and when browsing friends’ collections."
                  />
                </div>

                <div className="settings-display-col">
                  <h3 className="settings-display-col-title">Home</h3>
                  <DisplayToggle
                    label="Show Featured sample profile"
                    checked={settings.showExampleProfile}
                    onChange={(v) => updateSettings({ showExampleProfile: v })}
                    info="Shows the highlighted example profile card on the Home page so new visitors can jump into a filled-out profile."
                    footer={
                      settings.showExampleProfile ? (
                        <button
                          type="button"
                          className="settings-btn settings-btn-subtle settings-display-follow-btn"
                          onClick={() => navigate(exampleProfileUid ? `/friends/${exampleProfileUid}` : '/friends')}
                        >
                          Open example profile
                        </button>
                      ) : null
                    }
                  />
                  <DisplayToggle
                    label="Show Home quick-start"
                    checked={settings.showHomeHeroIntro}
                    onChange={(v) => updateSettings({ showHomeHeroIntro: v })}
                    info='Shows the top Home block from “Rank, Track, Organize” through shortcut buttons like “View My Stats”. You can still reopen it from here if you hide it from Home.'
                  />
                </div>
              </div>
            </>
          )}
        </div>

        {signedIn && canManageDevPanel && (
          <div className="settings-card card-surface settings-card-wide settings-collapsible-card">
            <SettingsCollapsibleCardHeader
              title="Dev"
              expanded={expandedSections.dev}
              onToggle={() => handleToggleSection('dev')}
              titleId="settings-heading-dev"
            />
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
                <div className="settings-dev-quotes">
                  <h3 className="settings-subtitle settings-subtitle-spaced">Feature requests and bug reports</h3>
                  {featureFeedbackError ? <p className="settings-quote-error">{featureFeedbackError}</p> : null}
                  <div className="settings-list-actions">
                    <button
                      type="button"
                      className="settings-btn settings-btn-subtle"
                      onClick={() => void refreshFeatureFeedback()}
                      disabled={featureFeedbackLoading || !db}
                    >
                      Refresh
                    </button>
                  </div>
                  {featureFeedbackLoading ? <p className="settings-muted">Loading feedback…</p> : null}
                  {!featureFeedbackLoading ? (
                    <div className="settings-list">
                      {(['feature_request', 'bug_report'] as FeedbackKind[]).map((kind) => {
                        const label = kind === 'feature_request' ? 'Feature requests' : 'Bug reports';
                        const items = groupedFeatureFeedback[kind];
                        const active = items.filter((item) => item.status !== 'completed');
                        const completed = items.filter((item) => item.status === 'completed');
                        return (
                          <div key={kind} className="settings-feedback-group">
                            <h4 className="settings-subtitle">{label}</h4>
                            {active.length === 0 ? <p className="settings-muted">No active {label.toLowerCase()}.</p> : null}
                            {active.map((item) => (
                              <div key={item.id} className="settings-list-item settings-feedback-item">
                                <span className="settings-class-name">
                                  <span className="settings-class-name-main">{item.title}</span>
                                  <span className="settings-class-tagline">
                                    {' '}| {feedbackStatusLabel(item.status)} | by {item.authorLabel}
                                  </span>
                                  <span className="settings-feedback-body">{item.body}</span>
                                </span>
                                <div className="settings-list-actions">
                                  <button
                                    type="button"
                                    className="settings-btn settings-btn-subtle"
                                    onClick={() => {
                                      setEditingFeedbackItem(item);
                                      setEditingFeedbackStatus(item.status);
                                    }}
                                  >
                                    Edit
                                  </button>
                                </div>
                              </div>
                            ))}
                            {completed.length > 0 ? (
                              <>
                                <div className="settings-list-actions">
                                  <button
                                    type="button"
                                    className="settings-btn settings-btn-subtle"
                                    onClick={() => setShowCompletedFeedback((prev) => ({ ...prev, [kind]: !prev[kind] }))}
                                  >
                                    {showCompletedFeedback[kind]
                                      ? `Hide completed (${completed.length})`
                                      : `Show completed (${completed.length})`}
                                  </button>
                                </div>
                                {showCompletedFeedback[kind] ? completed.map((item) => (
                                  <div key={item.id} className="settings-list-item settings-feedback-item settings-feedback-item-completed">
                                    <span className="settings-class-name">
                                      <span className="settings-class-name-main">{item.title}</span>
                                      <span className="settings-class-tagline">
                                        {' '}| Completed | by {item.authorLabel}
                                      </span>
                                      <span className="settings-feedback-body">{item.body}</span>
                                    </span>
                                    <div className="settings-list-actions">
                                      <button
                                        type="button"
                                        className="settings-btn settings-btn-subtle"
                                        onClick={() => {
                                          setEditingFeedbackItem(item);
                                          setEditingFeedbackStatus(item.status);
                                        }}
                                      >
                                        Edit
                                      </button>
                                    </div>
                                  </div>
                                )) : null}
                              </>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              </>
            )}
          </div>
        )}

        {signedIn && canManageBabydevPanel && (
          <div className="settings-card card-surface settings-card-wide settings-collapsible-card">
            <SettingsCollapsibleCardHeader
              title="Babydev"
              expanded={expandedSections.babydev}
              onToggle={() => handleToggleSection('babydev')}
              titleId="settings-heading-babydev"
            />
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
      {editingFeedbackItem ? (
        <div className="settings-modal-backdrop" role="presentation">
          <div
            className="settings-modal card-surface"
            role="dialog"
            aria-modal="true"
            aria-label="Edit feedback status"
          >
            <h4 className="settings-title">Edit status</h4>
            <p className="settings-muted">{editingFeedbackItem.title}</p>
            <select
              className="settings-select"
              value={editingFeedbackStatus}
              onChange={(e) => setEditingFeedbackStatus(e.target.value as FeedbackStatus)}
              disabled={savingFeedbackStatus}
            >
              <option value="default">Default</option>
              <option value="in_process">In process</option>
              <option value="completed">Completed</option>
            </select>
            <div className="settings-list-actions">
              <button
                type="button"
                className="settings-btn"
                disabled={savingFeedbackStatus || !db}
                onClick={async () => {
                  if (!db) return;
                  setSavingFeedbackStatus(true);
                  try {
                    await updateFeatureFeedbackStatus(db, editingFeedbackItem.id, editingFeedbackStatus);
                    setEditingFeedbackItem(null);
                    await refreshFeatureFeedback();
                  } catch (error) {
                    setFeatureFeedbackError(error instanceof Error ? error.message : 'Failed to update status.');
                  } finally {
                    setSavingFeedbackStatus(false);
                  }
                }}
              >
                {savingFeedbackStatus ? 'Saving...' : 'Save'}
              </button>
              <button
                type="button"
                className="settings-btn settings-btn-subtle"
                disabled={savingFeedbackStatus}
                onClick={() => setEditingFeedbackItem(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section >
  );
}

function feedbackStatusLabel(status: FeedbackStatus): string {
  if (status === 'in_process') return 'In process';
  if (status === 'completed') return 'Completed';
  return 'Default';
}
