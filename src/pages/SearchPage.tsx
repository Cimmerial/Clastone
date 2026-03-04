import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  tmdbSearchMulti,
  tmdbMovieDetails,
  tmdbImagePath,
  type TmdbMultiResult
} from '../lib/tmdb';
import { useMoviesStore } from '../state/moviesStore';
import './SearchPage.css';

function resultId(r: TmdbMultiResult): string {
  return `tmdb-${r.media_type}-${r.id}`;
}

export function SearchPage() {
  const [query, setQuery] = useState('');
  const [remoteResults, setRemoteResults] = useState<TmdbMultiResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const {
    addMovieFromSearch,
    addWatchToMovie,
    getMovieById,
    setMovieRuntime,
    classOrder
  } = useMoviesStore();
  const [recordTarget, setRecordTarget] = useState<TmdbMultiResult | null>(null);
  const [recordError, setRecordError] = useState<string | null>(null);
  const [recordYear, setRecordYear] = useState('');
  const [recordMonth, setRecordMonth] = useState('');
  const [recordDay, setRecordDay] = useState('');
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

  const handleOpenRecord = (r: TmdbMultiResult) => {
    if (r.media_type === 'person') return;
    setRecordTarget(r);
    setRecordError(null);
    setRecordYear('');
    setRecordMonth('');
    setRecordDay('');
    setRecordClassKey('');
  };

  const handleConfirmRecord = async () => {
    if (!recordTarget || recordTarget.media_type === 'person') return;
    const id = resultId(recordTarget);
    const existing = getMovieById(id);

    const yearNum = Number(recordYear);
    const monthNum = recordMonth ? Number(recordMonth) : undefined;
    const dayNum = recordDay ? Number(recordDay) : undefined;

    if (!yearNum || Number.isNaN(yearNum)) {
      setRecordError('Please enter at least a year.');
      return;
    }
    if (monthNum !== undefined && (monthNum < 1 || monthNum > 12)) {
      setRecordError('Month must be between 1 and 12.');
      return;
    }
    if (dayNum !== undefined && (dayNum < 1 || dayNum > 31)) {
      setRecordError('Day must be between 1 and 31.');
      return;
    }

    if (existing) {
      addWatchToMovie(id, { year: yearNum, month: monthNum, day: dayNum });
      if (existing.runtimeMinutes == null && recordTarget.media_type === 'movie') {
        try {
          const { runtime } = await tmdbMovieDetails(recordTarget.id);
          if (runtime != null) setMovieRuntime(id, runtime);
        } catch {
          /* ignore */
        }
      }
    } else {
      if (!recordClassKey) {
        setRecordError('Pick a class for this new entry.');
        return;
      }
      setIsSaving(true);
      let runtimeMinutes: number | undefined;
      if (recordTarget.media_type === 'movie') {
        try {
          const { runtime } = await tmdbMovieDetails(recordTarget.id);
          runtimeMinutes = runtime ?? undefined;
        } catch {
          /* ignore */
        }
      }
      addMovieFromSearch({
        id,
        title: recordTarget.title,
        subtitle: recordTarget.subtitle,
        classKey: recordClassKey,
        firstWatch: { year: yearNum, month: monthNum, day: dayNum },
        runtimeMinutes
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
        <p className="page-subtitle">Search for movies, shows, and people to add.</p>
      </header>

      <div className="search-shell card-surface">
        <div className="search-controls">
          <label className="search-label">
            <span>Search</span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Try “Game of Thrones”, “arrival”, “regina”…"
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
            const isMedia = r.media_type === 'movie' || r.media_type === 'tv';
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
                {isMedia ? (
                  <button
                    type="button"
                    className="search-card-action"
                    onClick={() => handleOpenRecord(r)}
                  >
                    Record Watch
                  </button>
                ) : (
                  <span className="search-card-no-action">—</span>
                )}
              </article>
            );
          })}
        </div>
      </div>

      {recordTarget && recordTarget.media_type !== 'person' && (
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
                <label>
                  <span>Year*</span>
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
                    placeholder="5"
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
                    placeholder="12"
                    min={1}
                    max={31}
                  />
                </label>
              </div>

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
