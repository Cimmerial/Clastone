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
};

type CopyStatus = { kind: 'ok' | 'err'; text: string } | null;

type MediaKind = 'movies' | 'shows' | 'actors' | 'directors';

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
}: ProfileCopyTopRankedSectionProps) {
  const countInputId = useId();
  const wlCountInputId = useId();

  const [media, setMedia] = useState<MediaKind>('movies');
  const [countStr, setCountStr] = useState('25');
  const [includeTmdbId, setIncludeTmdbId] = useState(false);
  const [includeClasses, setIncludeClasses] = useState(true);
  const [onlyRankedClasses, setOnlyRankedClasses] = useState(false);
  const [rankedStatus, setRankedStatus] = useState<CopyStatus>(null);

  const [wlMedia, setWlMedia] = useState<'movies' | 'shows'>('movies');
  const [wlCountStr, setWlCountStr] = useState('50');
  const [wlIncludeTmdb, setWlIncludeTmdb] = useState(false);
  const [wlStatus, setWlStatus] = useState<CopyStatus>(null);

  const parsedCount = useMemo(() => {
    const n = parseInt(countStr.replace(/\D/g, ''), 10);
    return Number.isFinite(n) ? n : 0;
  }, [countStr]);

  const parsedWlCount = useMemo(() => {
    const n = parseInt(wlCountStr.replace(/\D/g, ''), 10);
    return Number.isFinite(n) ? n : 0;
  }, [wlCountStr]);

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

  const canCopyRanked = parsedCount > 0 && totalRankedAvailable > 0;

  const wlEntries = wlMedia === 'movies' ? watchlistMovies : watchlistTv;
  const canCopyWl = parsedWlCount > 0 && wlEntries.length > 0;

  const handleCopyRanked = useCallback(async () => {
    if (!canCopyRanked) return;
    const text = buildRankedCopyText({
      classOrder: effectiveClassOrder,
      byClass: rankedByClass,
      getClassLabel: getRankedLabel,
      getClassTagline: getRankedTagline,
      maxItems: parsedCount,
      includeTmdbId,
      includeClassHeaders: includeClasses,
    });
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
    parsedCount,
    includeTmdbId,
    includeClasses,
  ]);

  const handleCopyWatchlist = useCallback(async () => {
    if (!canCopyWl) return;
    const text = buildWatchlistCopyText(wlEntries, parsedWlCount, wlIncludeTmdb);
    try {
      await navigator.clipboard.writeText(text);
      setWlStatus({ kind: 'ok', text: 'Copied.' });
    } catch {
      setWlStatus({ kind: 'err', text: 'Clipboard blocked.' });
    }
  }, [canCopyWl, wlEntries, parsedWlCount, wlIncludeTmdb]);

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

          <div className="profile-copy-field-row">
            <label className="profile-copy-field" htmlFor={countInputId}>
              <span className="profile-copy-field-label">Top</span>
              <input
                id={countInputId}
                className="profile-copy-input"
                inputMode="numeric"
                value={countStr}
                onChange={(e) => {
                  setCountStr(e.target.value);
                  setRankedStatus(null);
                }}
              />
            </label>
          </div>

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

          <div className="profile-copy-field-row">
            <label className="profile-copy-field" htmlFor={wlCountInputId}>
              <span className="profile-copy-field-label">Top</span>
              <input
                id={wlCountInputId}
                className="profile-copy-input"
                inputMode="numeric"
                value={wlCountStr}
                onChange={(e) => {
                  setWlCountStr(e.target.value);
                  setWlStatus(null);
                }}
              />
            </label>
          </div>

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
