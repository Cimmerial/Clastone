import { useCallback, useId, useMemo, useState } from 'react';
import { Copy } from 'lucide-react';
import type { MovieShowItem } from './EntryRowMovieShow';
import type { PersonItem } from '../state/peopleStore';
import type { DirectorItem } from '../state/directorsStore';
import { buildRankedCopyText, buildWatchlistCopyText, type WatchlistCopyEntry } from '../lib/buildRankedCopyText';
import './ProfileCopyTopRankedSection.css';

export type ProfileCopyTopRankedSectionProps = {
  movieClassOrder: string[];
  tvClassOrder: string[];
  peopleClassOrder: string[];
  directorsClassOrder: string[];
  moviesByClass: Record<string, MovieShowItem[]>;
  tvByClass: Record<string, MovieShowItem[]>;
  peopleByClass: Record<string, PersonItem[]>;
  directorsByClass: Record<string, DirectorItem[]>;
  getMovieClassLabel: (key: string) => string;
  getMovieClassTagline: (key: string) => string | undefined;
  getTvClassLabel: (key: string) => string;
  getTvClassTagline: (key: string) => string | undefined;
  getPeopleClassLabel: (key: string) => string;
  getPeopleClassTagline: (key: string) => string | undefined;
  getDirectorClassLabel: (key: string) => string;
  getDirectorClassTagline: (key: string) => string | undefined;
  isMovieClassRanked: (key: string) => boolean;
  isTvClassRanked: (key: string) => boolean;
  isPeopleClassRanked: (key: string) => boolean;
  isDirectorClassRanked: (key: string) => boolean;
  watchlistMovies: WatchlistCopyEntry[];
  watchlistTv: WatchlistCopyEntry[];
  /** Firebase UID for `/friends/{uid}` share link; omit when unknown. */
  profileShareUid?: string | null;
};

type CopyStatus = { kind: 'ok' | 'err'; text: string } | null;

type MediaKind = 'movies' | 'shows' | 'actors' | 'directors';

const PRESET_AMOUNTS = [4, 5, 10, 25, 50] as const;

type TopAmountChoice = (typeof PRESET_AMOUNTS)[number] | 'all' | 'custom';

function resolveTopMax(choice: TopAmountChoice, customStr: string, totalAvailable: number): number {
  if (choice === 'all') return Math.max(0, totalAvailable);
  if (choice === 'custom') {
    const n = parseInt(customStr.replace(/\D/g, ''), 10);
    return Number.isFinite(n) ? n : 0;
  }
  return choice;
}

type TopAmountPickerProps = {
  label: string;
  choice: TopAmountChoice;
  onChoice: (c: TopAmountChoice) => void;
  customStr: string;
  onCustomStr: (v: string) => void;
  customInputId: string;
  onInteract: () => void;
};

function TopAmountPicker({
  label,
  choice,
  onChoice,
  customStr,
  onCustomStr,
  customInputId,
  onInteract,
}: TopAmountPickerProps) {
  return (
    <div className="profile-copy-top-block">
      <span className="profile-copy-top-block-label">{label}</span>
      <div className="profile-copy-presets" role="group" aria-label={label}>
        {PRESET_AMOUNTS.map((n) => (
          <button
            key={n}
            type="button"
            className={`profile-copy-preset-btn ${choice === n ? 'active' : ''}`}
            onClick={() => {
              onChoice(n);
              onInteract();
            }}
          >
            {n}
          </button>
        ))}
        <button
          type="button"
          className={`profile-copy-preset-btn ${choice === 'all' ? 'active' : ''}`}
          onClick={() => {
            onChoice('all');
            onInteract();
          }}
        >
          ALL
        </button>
        <button
          type="button"
          className={`profile-copy-preset-btn ${choice === 'custom' ? 'active' : ''}`}
          onClick={() => {
            onChoice('custom');
            onInteract();
          }}
        >
          CUSTOM
        </button>
      </div>
      {choice === 'custom' ? (
        <div className="profile-copy-custom-row">
          <label className="profile-copy-field" htmlFor={customInputId}>
            <span className="profile-copy-field-label">Count</span>
            <input
              id={customInputId}
              className="profile-copy-input"
              inputMode="numeric"
              value={customStr}
              onChange={(e) => {
                onCustomStr(e.target.value);
                onInteract();
              }}
            />
          </label>
        </div>
      ) : null}
    </div>
  );
}

export function ProfileCopyTopRankedSection({
  movieClassOrder,
  tvClassOrder,
  peopleClassOrder,
  directorsClassOrder,
  moviesByClass,
  tvByClass,
  peopleByClass,
  directorsByClass,
  getMovieClassLabel,
  getMovieClassTagline,
  getTvClassLabel,
  getTvClassTagline,
  getPeopleClassLabel,
  getPeopleClassTagline,
  getDirectorClassLabel,
  getDirectorClassTagline,
  isMovieClassRanked,
  isTvClassRanked,
  isPeopleClassRanked,
  isDirectorClassRanked,
  watchlistMovies,
  watchlistTv,
  profileShareUid,
}: ProfileCopyTopRankedSectionProps) {
  const rankedCustomInputId = useId();
  const wlCustomInputId = useId();

  const profileShareUrl = useMemo(() => {
    const uid = profileShareUid?.trim();
    if (!uid) return null;
    if (typeof window === 'undefined') return null;
    return `${window.location.origin}/friends/${encodeURIComponent(uid)}`;
  }, [profileShareUid]);

  const [media, setMedia] = useState<MediaKind>('movies');
  const [rankedTopChoice, setRankedTopChoice] = useState<TopAmountChoice>(25);
  const [rankedCustomStr, setRankedCustomStr] = useState('100');
  const [includeTmdbId, setIncludeTmdbId] = useState(false);
  const [includeClasses, setIncludeClasses] = useState(true);
  const [onlyRankedClasses, setOnlyRankedClasses] = useState(false);
  const [rankedStatus, setRankedStatus] = useState<CopyStatus>(null);
  const [prependRankedProfileLink, setPrependRankedProfileLink] = useState(false);

  const [wlMedia, setWlMedia] = useState<'movies' | 'shows'>('movies');
  const [wlTopChoice, setWlTopChoice] = useState<TopAmountChoice>(50);
  const [wlCustomStr, setWlCustomStr] = useState('100');
  const [wlIncludeTmdb, setWlIncludeTmdb] = useState(false);
  const [wlStatus, setWlStatus] = useState<CopyStatus>(null);
  const [prependWatchlistProfileLink, setPrependWatchlistProfileLink] = useState(false);

  const rankedRankedFn = useMemo(() => {
    switch (media) {
      case 'movies':
        return isMovieClassRanked;
      case 'shows':
        return isTvClassRanked;
      case 'actors':
        return isPeopleClassRanked;
      case 'directors':
        return isDirectorClassRanked;
      default:
        return isMovieClassRanked;
    }
  }, [media, isMovieClassRanked, isTvClassRanked, isPeopleClassRanked, isDirectorClassRanked]);

  const baseClassOrder = useMemo(() => {
    switch (media) {
      case 'movies':
        return movieClassOrder;
      case 'shows':
        return tvClassOrder;
      case 'actors':
        return peopleClassOrder;
      case 'directors':
        return directorsClassOrder;
      default:
        return movieClassOrder;
    }
  }, [media, movieClassOrder, tvClassOrder, peopleClassOrder, directorsClassOrder]);

  const rankedByClass = useMemo(() => {
    switch (media) {
      case 'movies':
        return moviesByClass;
      case 'shows':
        return tvByClass;
      case 'actors':
        return peopleByClass;
      case 'directors':
        return directorsByClass;
      default:
        return moviesByClass;
    }
  }, [media, moviesByClass, tvByClass, peopleByClass, directorsByClass]);

  const getRankedLabel = useMemo(() => {
    switch (media) {
      case 'movies':
        return getMovieClassLabel;
      case 'shows':
        return getTvClassLabel;
      case 'actors':
        return getPeopleClassLabel;
      case 'directors':
        return getDirectorClassLabel;
      default:
        return getMovieClassLabel;
    }
  }, [media, getMovieClassLabel, getTvClassLabel, getPeopleClassLabel, getDirectorClassLabel]);

  const getRankedTagline = useMemo(() => {
    switch (media) {
      case 'movies':
        return getMovieClassTagline;
      case 'shows':
        return getTvClassTagline;
      case 'actors':
        return getPeopleClassTagline;
      case 'directors':
        return getDirectorClassTagline;
      default:
        return getMovieClassTagline;
    }
  }, [media, getMovieClassTagline, getTvClassTagline, getPeopleClassTagline, getDirectorClassTagline]);

  const effectiveClassOrder = useMemo(() => {
    if (!onlyRankedClasses) return baseClassOrder;
    return baseClassOrder.filter((k) => rankedRankedFn(k));
  }, [baseClassOrder, onlyRankedClasses, rankedRankedFn]);

  const totalRankedAvailable = useMemo(() => {
    let t = 0;
    for (const k of effectiveClassOrder) {
      t += rankedByClass[k]?.length ?? 0;
    }
    return t;
  }, [effectiveClassOrder, rankedByClass]);

  const rankedEffectiveMax = useMemo(
    () => resolveTopMax(rankedTopChoice, rankedCustomStr, totalRankedAvailable),
    [rankedTopChoice, rankedCustomStr, totalRankedAvailable]
  );

  const canCopyRanked = rankedEffectiveMax > 0 && totalRankedAvailable > 0;

  const wlEntries = wlMedia === 'movies' ? watchlistMovies : watchlistTv;
  const wlTotal = wlEntries.length;

  const wlEffectiveMax = useMemo(
    () => resolveTopMax(wlTopChoice, wlCustomStr, wlTotal),
    [wlTopChoice, wlCustomStr, wlTotal]
  );

  const canCopyWl = wlEffectiveMax > 0 && wlTotal > 0;

  const withRankedProfileLink = useCallback(
    (body: string) => {
      if (!prependRankedProfileLink || !profileShareUrl) return body;
      return `${profileShareUrl}\n\n${body}`;
    },
    [prependRankedProfileLink, profileShareUrl]
  );

  const withWatchlistProfileLink = useCallback(
    (body: string) => {
      if (!prependWatchlistProfileLink || !profileShareUrl) return body;
      return `${profileShareUrl}\n\n${body}`;
    },
    [prependWatchlistProfileLink, profileShareUrl]
  );

  const handleCopyRanked = useCallback(async () => {
    if (!canCopyRanked) return;
    const body = buildRankedCopyText({
      classOrder: effectiveClassOrder,
      byClass: rankedByClass,
      getClassLabel: getRankedLabel,
      getClassTagline: getRankedTagline,
      maxItems: rankedEffectiveMax,
      includeTmdbId,
      includeClassHeaders: includeClasses,
    });
    const text = withRankedProfileLink(body);
    try {
      await navigator.clipboard.writeText(text);
      setRankedStatus({ kind: 'ok', text: 'Copied.' });
    } catch {
      setRankedStatus({ kind: 'err', text: 'Clipboard blocked.' });
    }
  }, [
    canCopyRanked,
    effectiveClassOrder,
    rankedByClass,
    getRankedLabel,
    getRankedTagline,
    rankedEffectiveMax,
    includeTmdbId,
    includeClasses,
    withRankedProfileLink,
  ]);

  const handleCopyWatchlist = useCallback(async () => {
    if (!canCopyWl) return;
    const body = buildWatchlistCopyText(wlEntries, wlEffectiveMax, wlIncludeTmdb);
    const text = withWatchlistProfileLink(`Watchlist:\n\n${body}`);
    try {
      await navigator.clipboard.writeText(text);
      setWlStatus({ kind: 'ok', text: 'Copied.' });
    } catch {
      setWlStatus({ kind: 'err', text: 'Clipboard blocked.' });
    }
  }, [canCopyWl, wlEntries, wlEffectiveMax, wlIncludeTmdb, withWatchlistProfileLink]);

  const setMediaAndClear = (m: MediaKind) => {
    setMedia(m);
    setRankedStatus(null);
  };

  return (
    <div className="profile-copy-dual">
      <div className="profile-copy-dual-grid">
        <section className="profile-copy-card profile-copy-card--ranked" aria-labelledby="profile-copy-ranked-title">
          <h3 id="profile-copy-ranked-title" className="profile-copy-card-title">
            Copy ranked lists
          </h3>
          <p className="profile-copy-card-hint">
            Order matches the profile class list. Numbering runs across classes.
          </p>

          <div className="profile-copy-toolbar">
            <div className="profile-copy-segment profile-copy-segment--wrap" role="group" aria-label="List type">
              {(
                [
                  ['movies', 'Movies'],
                  ['shows', 'Shows'],
                  ['actors', 'Actors'],
                  ['directors', 'Directors'],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  className={`profile-copy-segment-btn ${media === key ? 'active' : ''}`}
                  onClick={() => setMediaAndClear(key)}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={onlyRankedClasses}
              className={`profile-copy-switch ${onlyRankedClasses ? 'profile-copy-switch--on' : ''}`}
              onClick={() => {
                setOnlyRankedClasses((v) => !v);
                setRankedStatus(null);
              }}
            >
              <span className="profile-copy-switch-knob" aria-hidden />
              <span className="profile-copy-switch-label">Only ranked classes</span>
            </button>
          </div>

          <TopAmountPicker
            label="Top"
            choice={rankedTopChoice}
            onChoice={setRankedTopChoice}
            customStr={rankedCustomStr}
            onCustomStr={setRankedCustomStr}
            customInputId={rankedCustomInputId}
            onInteract={() => setRankedStatus(null)}
          />

          <div className="profile-copy-options">
            <label className="profile-copy-option">
              <input
                type="checkbox"
                checked={includeTmdbId}
                onChange={(e) => {
                  setIncludeTmdbId(e.target.checked);
                  setRankedStatus(null);
                }}
              />
              <span>Include TMDB id</span>
            </label>
            <label className="profile-copy-option">
              <input
                type="checkbox"
                checked={includeClasses}
                onChange={(e) => {
                  setIncludeClasses(e.target.checked);
                  setRankedStatus(null);
                }}
              />
              <span>Include classes</span>
            </label>
            {profileShareUrl ? (
              <label className="profile-copy-option">
                <input
                  type="checkbox"
                  checked={prependRankedProfileLink}
                  onChange={(e) => {
                    setPrependRankedProfileLink(e.target.checked);
                    setRankedStatus(null);
                  }}
                />
                <span>Add profile link at top of list</span>
              </label>
            ) : null}
          </div>

          <div className="profile-copy-actions">
            <button
              type="button"
              className="profile-copy-btn profile-copy-btn--primary"
              disabled={!canCopyRanked}
              onClick={() => void handleCopyRanked()}
            >
              <Copy size={16} aria-hidden />
              Copy to clipboard
            </button>
            {rankedStatus && (
              <span
                className={
                  rankedStatus.kind === 'err'
                    ? 'profile-copy-feedback profile-copy-feedback--err'
                    : 'profile-copy-feedback'
                }
              >
                {rankedStatus.text}
              </span>
            )}
          </div>
        </section>

        <section className="profile-copy-card profile-copy-card--watchlist" aria-labelledby="profile-copy-wl-title">
          <h3 id="profile-copy-wl-title" className="profile-copy-card-title">
            Copy watchlist
          </h3>
          <p className="profile-copy-card-hint">Uses saved watchlist order (movies or shows).</p>

          <div className="profile-copy-toolbar profile-copy-toolbar--single">
            <div className="profile-copy-segment" role="group" aria-label="Watchlist type">
              <button
                type="button"
                className={`profile-copy-segment-btn ${wlMedia === 'movies' ? 'active' : ''}`}
                onClick={() => {
                  setWlMedia('movies');
                  setWlStatus(null);
                }}
              >
                Movies
              </button>
              <button
                type="button"
                className={`profile-copy-segment-btn ${wlMedia === 'shows' ? 'active' : ''}`}
                onClick={() => {
                  setWlMedia('shows');
                  setWlStatus(null);
                }}
              >
                Shows
              </button>
            </div>
          </div>

          <TopAmountPicker
            label="Top"
            choice={wlTopChoice}
            onChoice={setWlTopChoice}
            customStr={wlCustomStr}
            onCustomStr={setWlCustomStr}
            customInputId={wlCustomInputId}
            onInteract={() => setWlStatus(null)}
          />

          <div className="profile-copy-options">
            <label className="profile-copy-option">
              <input
                type="checkbox"
                checked={wlIncludeTmdb}
                onChange={(e) => {
                  setWlIncludeTmdb(e.target.checked);
                  setWlStatus(null);
                }}
              />
              <span>Include TMDB id</span>
            </label>
            {profileShareUrl ? (
              <label className="profile-copy-option">
                <input
                  type="checkbox"
                  checked={prependWatchlistProfileLink}
                  onChange={(e) => {
                    setPrependWatchlistProfileLink(e.target.checked);
                    setWlStatus(null);
                  }}
                />
                <span>Add profile link at top of list</span>
              </label>
            ) : null}
          </div>

          <div className="profile-copy-actions">
            <button
              type="button"
              className="profile-copy-btn profile-copy-btn--primary"
              disabled={!canCopyWl}
              onClick={() => void handleCopyWatchlist()}
            >
              <Copy size={16} aria-hidden />
              Copy watchlist
            </button>
            {wlStatus && (
              <span
                className={
                  wlStatus.kind === 'err' ? 'profile-copy-feedback profile-copy-feedback--err' : 'profile-copy-feedback'
                }
              >
                {wlStatus.text}
              </span>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
