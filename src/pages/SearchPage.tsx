import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  tmdbSearchMulti,
  tmdbMovieDetailsFull,
  tmdbImagePath,
  type TmdbMultiResult
} from '../lib/tmdb';
import type { WatchRecord, WatchRecordType } from '../components/EntryRowMovieShow';
import { useMoviesStore } from '../state/moviesStore';
import './SearchPage.css';

function resultId(r: TmdbMultiResult): string {
  return `tmdb-${r.media_type}-${r.id}`;
}

const WATCH_TYPES: { value: WatchRecordType; label: string }[] = [
  { value: 'DATE', label: 'Watch date' },
  { value: 'RANGE', label: 'Start / end date' },
  { value: 'DNF', label: 'DNF' },
  { value: 'CURRENT', label: 'Currently watching' },
  { value: 'LONG_AGO', label: 'Long ago' },
  { value: 'UNKNOWN', label: 'Unknown' }
];

export function SearchPage() {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [remoteResults, setRemoteResults] = useState<TmdbMultiResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const {
    addMovieFromSearch,
    addWatchToMovie,
    getMovieById,
    updateMovieCache,
    classOrder
  } = useMoviesStore();
  const [recordTarget, setRecordTarget] = useState<TmdbMultiResult | null>(null);
  const [recordError, setRecordError] = useState<string | null>(null);
  const [recordType, setRecordType] = useState<WatchRecordType>('DATE');
  const [recordYear, setRecordYear] = useState('');
  const [recordMonth, setRecordMonth] = useState('');
  const [recordDay, setRecordDay] = useState('');
  const [recordEndYear, setRecordEndYear] = useState('');
  const [recordEndMonth, setRecordEndMonth] = useState('');
  const [recordEndDay, setRecordEndDay] = useState('');
  const [recordDnfPercent, setRecordDnfPercent] = useState(50);
  const [recordClassKey, setRecordClassKey] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);
  const navigate = useNavigate();

  const trimmed = useMemo(() => query.trim(), [query]);

  useEffect(() => {
    abortRef.current?.abort();
    setError(null);

    if (!trimmed) {
      setRemoteResults([]);
      setIsLoading(false);
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;

    const t = window.setTimeout(async () => {
      try {
        setIsLoading(true);
        const results = await tmdbSearchMulti(trimmed, controller.signal);
        setRemoteResults(results);
      } catch (e) {
        if (controller.signal.aborted) return;
        setRemoteResults([]);
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    }, 250);

    return () => {
      window.clearTimeout(t);
      controller.abort();
    };
  }, [trimmed]);

  // Autofocus the search input when arriving on this page.
  useEffect(() => {
    const t = window.setTimeout(() => {
      inputRef.current?.focus();
    }, 0);
    return () => window.clearTimeout(t);
  }, []);

  const handleOpenRecord = (r: TmdbMultiResult) => {
    if (r.media_type !== 'movie') return;
    setRecordTarget(r);
    setRecordError(null);
    setRecordType('DATE');
    setRecordYear('');
    setRecordMonth('');
    setRecordDay('');
    setRecordEndYear('');
    setRecordEndMonth('');
    setRecordEndDay('');
    setRecordDnfPercent(50);
    setRecordClassKey('');
  };

  const handleAddToUnranked = async (r: TmdbMultiResult) => {
    if (r.media_type !== 'movie') return;
    const id = resultId(r);
    const existing = getMovieById(id);
    if (existing) return;
    setIsSaving(true);
    let cache = null;
    try {
      cache = await tmdbMovieDetailsFull(r.id);
    } catch {
      /* ignore */
    }
    addMovieFromSearch({
      id,
      title: r.title,
      subtitle: 'Saved',
      classKey: 'UNRANKED',
      runtimeMinutes: cache?.runtimeMinutes,
      posterPath: r.poster_path ?? cache?.posterPath,
      cache: cache ?? undefined
    });
    setIsSaving(false);
  };

  const buildWatchRecord = (): WatchRecord | null => {
    if (recordType === 'DNF' || recordType === 'CURRENT') {
      const yearNum = Number(recordYear);
      if (!yearNum || Number.isNaN(yearNum)) return null;
      const monthNum = recordMonth ? Number(recordMonth) : undefined;
      const dayNum = recordDay ? Number(recordDay) : undefined;
      if (monthNum !== undefined && (monthNum < 1 || monthNum > 12)) return null;
      if (dayNum !== undefined && (dayNum < 1 || dayNum > 31)) return null;
      return {
        id: crypto.randomUUID(),
        type: recordType,
        year: yearNum,
        month: monthNum,
        day: dayNum,
        dnfPercent: Math.min(100, Math.max(0, recordDnfPercent))
      };
    }
    if (recordType === 'LONG_AGO' || recordType === 'UNKNOWN') {
      return { id: crypto.randomUUID(), type: recordType };
    }
    const yearNum = Number(recordYear);
    if (!yearNum || Number.isNaN(yearNum)) return null;
    if (recordType === 'DATE') {
      const monthNum = recordMonth ? Number(recordMonth) : undefined;
      const dayNum = recordDay ? Number(recordDay) : undefined;
      if (monthNum !== undefined && (monthNum < 1 || monthNum > 12)) return null;
      if (dayNum !== undefined && (dayNum < 1 || dayNum > 31)) return null;
      return {
        id: crypto.randomUUID(),
        type: 'DATE',
        year: yearNum,
        month: monthNum,
        day: dayNum
      };
    }
    // RANGE
    const endYearNum = recordEndYear ? Number(recordEndYear) : undefined;
    const monthNum = recordMonth ? Number(recordMonth) : undefined;
    const dayNum = recordDay ? Number(recordDay) : undefined;
    const endMonthNum = recordEndMonth ? Number(recordEndMonth) : undefined;
    const endDayNum = recordEndDay ? Number(recordEndDay) : undefined;
    if (monthNum !== undefined && (monthNum < 1 || monthNum > 12)) return null;
    if (dayNum !== undefined && (dayNum < 1 || dayNum > 31)) return null;
    if (endMonthNum !== undefined && (endMonthNum < 1 || endMonthNum > 12)) return null;
    if (endDayNum !== undefined && (endDayNum < 1 || endDayNum > 31)) return null;
    return {
      id: crypto.randomUUID(),
      type: 'RANGE',
      year: yearNum,
      month: monthNum,
      day: dayNum,
      endYear: endYearNum,
      endMonth: endMonthNum,
      endDay: endDayNum
    };
  };

  const handleConfirmRecord = async () => {
    if (!recordTarget || recordTarget.media_type !== 'movie') return;
    const id = resultId(recordTarget);
    const existing = getMovieById(id);

    if (recordType === 'DATE' || recordType === 'RANGE') {
      const yearNum = Number(recordYear);
      if (!yearNum || Number.isNaN(yearNum)) {
        setRecordError('Please enter at least a year for this type.');
        return;
      }
    }
    if (recordType === 'DNF' || recordType === 'CURRENT') {
      const yearNum = Number(recordYear);
      if (!yearNum || Number.isNaN(yearNum)) {
        setRecordError('Please enter a start year for this type.');
        return;
      }
    }

    const watch = buildWatchRecord();
    if (!watch) {
      setRecordError('Invalid date fields.');
      return;
    }

    if (existing) {
      const needsCache = existing.tmdbId == null || existing.overview == null;
      if (needsCache) {
        try {
          const cache = await tmdbMovieDetailsFull(recordTarget.id);
          if (cache) updateMovieCache(id, cache);
        } catch {
          /* ignore */
        }
      }
      addWatchToMovie(id, watch, {
        posterPath: recordTarget.poster_path ?? existing.posterPath
      });
    } else {
      if (!recordClassKey) {
        setRecordError('Pick a class for this new entry.');
        return;
      }
      setIsSaving(true);
      let cache = null;
      try {
        cache = await tmdbMovieDetailsFull(recordTarget.id);
      } catch {
        /* ignore */
      }
      addMovieFromSearch({
        id,
        title: recordTarget.title,
        subtitle: recordTarget.subtitle,
        classKey: recordClassKey,
        firstWatch: watch,
        runtimeMinutes: cache?.runtimeMinutes,
        posterPath: recordTarget.poster_path ?? cache?.posterPath,
        cache: cache ?? undefined
      });
      setIsSaving(false);
    }

    setRecordTarget(null);
    setRecordError(null);
    navigate('/movies', { state: { scrollToId: id } });
  };

  return (
    <section>
      <header className="page-heading">
        <div>
          <h1 className="page-title">Search</h1>
          <p className="page-tagline">TMDB WIRED</p>
        </div>
      </header>

      <div className="search-shell card-surface">
        <div className="search-controls">
          <label className="search-label">
            <span>Search</span>
            <input
              ref={inputRef}
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Try “Arcane”, “La La Land”, “Emma Stone”…"
              className="search-input"
            />
          </label>
          <div className="chip chip-accent">
            <span>{isLoading ? 'Searching…' : 'TMDB'}</span>
          </div>
        </div>

        {error && <div className="search-error">{error}</div>}

        <div className="search-results">
          {remoteResults.map((r) => {
            const id = resultId(r);
            const isMovie = r.media_type === 'movie';
            const isTv = r.media_type === 'tv';
            const imgPath = r.media_type === 'person' ? r.profile_path : r.poster_path;
            const imgUrl = tmdbImagePath(imgPath);

            return (
              <article key={`${r.media_type}-${r.id}`} className="search-card">
                <div className="search-card-poster">
                  {imgUrl ? (
                    <img src={imgUrl} alt={r.title} />
                  ) : (
                    <div className="search-card-poster-fallback">
                      {r.media_type === 'person' ? '👤' : '🎬'}
                    </div>
                  )}
                </div>
                <div className="search-card-main">
                  <div className="search-card-badge">
                    {r.media_type === 'movie'
                      ? 'MOVIE'
                      : r.media_type === 'tv'
                        ? 'TV'
                        : 'PERSON'}
                  </div>
                  <div className="search-card-title">{r.title}</div>
                  <div className="search-card-subtitle">{r.subtitle}</div>
                </div>
                {isMovie ? (
                  <div className="search-card-actions">
                    <button
                      type="button"
                      className="search-card-action"
                      disabled={isSaving}
                      onClick={() => handleOpenRecord(r)}
                    >
                      Record Watch
                    </button>
                    <button
                      type="button"
                      className="search-card-action search-card-action-subtle"
                      disabled={isSaving}
                      onClick={() => void handleAddToUnranked(r)}
                    >
                      Add to unranked
                    </button>
                  </div>
                ) : isTv ? (
                  <span className="search-card-coming-soon">Shows coming soon</span>
                ) : (
                  <span className="search-card-no-action">—</span>
                )}
              </article>
            );
          })}
        </div>
      </div>

      {recordTarget && recordTarget.media_type === 'movie' && (
        <div className="record-modal-backdrop" onClick={() => setRecordTarget(null)}>
          <div className="record-modal" onClick={(e) => e.stopPropagation()}>
            <header className="record-modal-header">
              <h2>Record watch</h2>
              <button
                type="button"
                className="record-modal-close"
                onClick={() => setRecordTarget(null)}
                aria-label="Close record watch"
              >
                ✕
              </button>
            </header>
            <p className="record-modal-title">{recordTarget.title}</p>

            <div className="record-modal-fields">
              <div className="record-modal-field-row">
                <label className="record-modal-class-label">
                  <span>Type</span>
                  <select
                    value={recordType}
                    onChange={(e) => setRecordType(e.target.value as WatchRecordType)}
                  >
                    {WATCH_TYPES.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {(recordType === 'DATE' || recordType === 'RANGE') && (
                <div className="record-modal-field-row">
                  <label>
                    <span>{recordType === 'RANGE' ? 'Start year*' : 'Year*'}</span>
                    <input
                      type="number"
                      value={recordYear}
                      onChange={(e) => setRecordYear(e.target.value)}
                      placeholder="2024"
                    />
                  </label>
                  <label>
                    <span>Month</span>
                    <input
                      type="number"
                      value={recordMonth}
                      onChange={(e) => setRecordMonth(e.target.value)}
                      placeholder="—"
                      min={1}
                      max={12}
                    />
                  </label>
                  <label>
                    <span>Day</span>
                    <input
                      type="number"
                      value={recordDay}
                      onChange={(e) => setRecordDay(e.target.value)}
                      placeholder="—"
                      min={1}
                      max={31}
                    />
                  </label>
                </div>
              )}

              {recordType === 'RANGE' && (
                <div className="record-modal-field-row">
                  <label>
                    <span>End year</span>
                    <input
                      type="number"
                      value={recordEndYear}
                      onChange={(e) => setRecordEndYear(e.target.value)}
                      placeholder="—"
                    />
                  </label>
                  <label>
                    <span>Month</span>
                    <input
                      type="number"
                      value={recordEndMonth}
                      onChange={(e) => setRecordEndMonth(e.target.value)}
                      placeholder="—"
                      min={1}
                      max={12}
                    />
                  </label>
                  <label>
                    <span>Day</span>
                    <input
                      type="number"
                      value={recordEndDay}
                      onChange={(e) => setRecordEndDay(e.target.value)}
                      placeholder="—"
                      min={1}
                      max={31}
                    />
                  </label>
                </div>
              )}

              {(recordType === 'DNF' || recordType === 'CURRENT') && (
                <>
                  <div className="record-modal-field-row">
                    <label>
                      <span>Started year*</span>
                      <input
                        type="number"
                        value={recordYear}
                        onChange={(e) => setRecordYear(e.target.value)}
                        placeholder="2024"
                      />
                    </label>
                    <label>
                      <span>Month</span>
                      <input
                        type="number"
                        value={recordMonth}
                        onChange={(e) => setRecordMonth(e.target.value)}
                        placeholder="—"
                        min={1}
                        max={12}
                      />
                    </label>
                    <label>
                      <span>Day</span>
                      <input
                        type="number"
                        value={recordDay}
                        onChange={(e) => setRecordDay(e.target.value)}
                        placeholder="—"
                        min={1}
                        max={31}
                      />
                    </label>
                  </div>
                  <div className="record-modal-field-row">
                    <label className="record-modal-field-slider">
                      <span>
                        {recordType === 'DNF' ? 'Got through' : 'Current progress'}: {recordDnfPercent}%
                      </span>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={recordDnfPercent}
                        onChange={(e) => setRecordDnfPercent(Number(e.target.value))}
                      />
                    </label>
                  </div>
                </>
              )}

              {!getMovieById(resultId(recordTarget)) && (
                <div className="record-modal-field-row">
                  <label className="record-modal-class-label">
                    <span>Class for new entry*</span>
                    <select
                      value={recordClassKey}
                      onChange={(e) => setRecordClassKey(e.target.value)}
                    >
                      <option value="">Pick a class…</option>
                      {classOrder.map((key) => (
                        <option key={key} value={key}>
                          {key}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              )}
            </div>

            {recordError && <div className="record-modal-error">{recordError}</div>}

            <footer className="record-modal-footer">
              <button
                type="button"
                className="record-modal-btn"
                onClick={handleConfirmRecord}
                disabled={isSaving}
              >
                {isSaving ? 'Saving…' : 'Save and go to movie'}
              </button>
            </footer>
          </div>
        </div>
      )}
    </section>
  );
}
