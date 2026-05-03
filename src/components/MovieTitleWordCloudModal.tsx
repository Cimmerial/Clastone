import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import WordCloud from 'wordcloud';
import { lockBodyScroll, unlockBodyScroll } from '../lib/bodyScrollLock';
import {
  buildCombinedWordCloudList,
  pickRandomWordCloudShape,
  type MovieWordCloudShape,
} from '../lib/movieTitleWordCloud';
import './MovieTitleWordCloudModal.css';

export type ProfileWordCloudSources = {
  movieTitles: string[];
  tvShowTitles: string[];
  /** Actor and director names combined */
  actorsAndDirectors: string[];
};

type WordCloudBucket = 'movies' | 'tv' | 'people';

/** Fixed wordcloud2 tuning (formerly “layout options”). */
const WC_DENSITY_DIVISOR = 72; // tight packing
const WC_SIZE_BOOST = 1.45;
const WC_ELLIPTICITY = 0.3; // flat silhouette
const WC_ROTATE_RATIO = 0.22;
const WC_MIN_ROTATION = -Math.PI / 10;
const WC_MAX_ROTATION = Math.PI / 10;

function defaultBucket(sources: ProfileWordCloudSources): WordCloudBucket | null {
  if (sources.movieTitles.length > 0) return 'movies';
  if (sources.tvShowTitles.length > 0) return 'tv';
  if (sources.actorsAndDirectors.length > 0) return 'people';
  return null;
}

export function MovieTitleWordCloudModal({
  isOpen,
  onClose,
  sources,
  profilePossessive,
}: {
  isOpen: boolean;
  onClose: () => void;
  sources: ProfileWordCloudSources;
  /** Grammar: lowercase "your" or a name phrase like "Sam's". */
  profilePossessive: string;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [bucket, setBucket] = useState<WordCloudBucket>('movies');
  const [shape, setShape] = useState<MovieWordCloudShape>(() => pickRandomWordCloudShape());

  const activeTexts = useMemo(() => {
    if (bucket === 'movies') return sources.movieTitles;
    if (bucket === 'tv') return sources.tvShowTitles;
    return sources.actorsAndDirectors;
  }, [bucket, sources.movieTitles, sources.tvShowTitles, sources.actorsAndDirectors]);

  const wordList = useMemo(
    () => buildCombinedWordCloudList([{ texts: activeTexts, enabled: true }], true),
    [activeTexts]
  );

  const hasWordsIfNoStopFilter = useMemo(
    () => buildCombinedWordCloudList([{ texts: activeTexts, enabled: true }], false).length > 0,
    [activeTexts]
  );

  useEffect(() => {
    if (!isOpen) return;
    const d = defaultBucket(sources);
    if (d) setBucket(d);
    else setBucket('movies');
    setShape(pickRandomWordCloudShape());
  }, [isOpen, sources]);

  useEffect(() => {
    if (!isOpen) return;
    lockBodyScroll();
    return () => {
      unlockBodyScroll();
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  const runWordCloud = useCallback(() => {
    const canvas = canvasRef.current;
    const viewport = viewportRef.current;
    if (!canvas || !viewport || wordList.length === 0) return;

    const w = Math.max(220, Math.floor(viewport.clientWidth));
    const h = Math.max(260, Math.floor(viewport.clientHeight));
    if (w < 2 || h < 2) return;

    canvas.width = w;
    canvas.height = h;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;

    WordCloud.stop();
    const maxCount = wordList[0]?.[1] ?? 1;
    const shortSide = Math.min(w, h);
    const gridSize = Math.max(3, Math.min(10, Math.floor(shortSide / WC_DENSITY_DIVISOR)));

    WordCloud(canvas, {
      list: wordList,
      shape,
      shuffle: true,
      backgroundColor: 'transparent',
      color: 'random-light',
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      rotateRatio: WC_ROTATE_RATIO,
      minRotation: WC_MIN_ROTATION,
      maxRotation: WC_MAX_ROTATION,
      gridSize,
      minSize: 5,
      drawOutOfBound: false,
      shrinkToFit: true,
      ellipticity: WC_ELLIPTICITY,
      origin: [Math.floor(w / 2), Math.floor(h / 2)],
      weightFactor: (n) => {
        const t = n / maxCount;
        return (4 + t * 18) * 0.88 * WC_SIZE_BOOST;
      },
    });
  }, [wordList, shape]);

  useLayoutEffect(() => {
    if (!isOpen || wordList.length === 0) return;
    runWordCloud();
  }, [isOpen, runWordCloud]);

  useEffect(() => {
    if (!isOpen || wordList.length === 0) return;
    const vp = viewportRef.current;
    if (!vp || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      runWordCloud();
    });
    ro.observe(vp);
    return () => ro.disconnect();
  }, [isOpen, runWordCloud, wordList]);

  if (!isOpen) return null;

  const hasMovieData = sources.movieTitles.length > 0;
  const hasTvData = sources.tvShowTitles.length > 0;
  const hasPeopleData = sources.actorsAndDirectors.length > 0;
  const hasAnyLibraryData = hasMovieData || hasTvData || hasPeopleData;

  const sourcePhrase =
    bucket === 'movies'
      ? 'movie titles'
      : bucket === 'tv'
        ? 'TV show titles'
        : 'actor & director names';

  const filteredOutAllWords =
    wordList.length === 0 && hasWordsIfNoStopFilter;

  return (
    <div
      className="movie-wordcloud-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="profile-wordcloud-title"
      onClick={onClose}
    >
      <div className="movie-wordcloud-modal" onClick={(e) => e.stopPropagation()}>
        <div className="movie-wordcloud-modal-header">
          <div>
            <div id="profile-wordcloud-title" className="movie-wordcloud-modal-title">
              Word cloud
            </div>
            <div className="movie-wordcloud-modal-subtitle">
              Words from {profilePossessive} ranked {sourcePhrase} — on the fly, just for fun. Common filler words are
              dropped automatically.
            </div>
          </div>
          <button type="button" className="movie-wordcloud-modal-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="movie-wordcloud-modal-toolbar">
          <div className="movie-wordcloud-source-radios" role="radiogroup" aria-label="Source">
            <label className={`movie-wordcloud-radio ${!hasMovieData ? 'movie-wordcloud-radio--disabled' : ''}`}>
              <input
                type="radio"
                name="wordcloud-bucket"
                checked={bucket === 'movies'}
                disabled={!hasMovieData}
                onChange={() => setBucket('movies')}
              />
              <span>Movies</span>
            </label>
            <label className={`movie-wordcloud-radio ${!hasTvData ? 'movie-wordcloud-radio--disabled' : ''}`}>
              <input
                type="radio"
                name="wordcloud-bucket"
                checked={bucket === 'tv'}
                disabled={!hasTvData}
                onChange={() => setBucket('tv')}
              />
              <span>TV shows</span>
            </label>
            <label className={`movie-wordcloud-radio ${!hasPeopleData ? 'movie-wordcloud-radio--disabled' : ''}`}>
              <input
                type="radio"
                name="wordcloud-bucket"
                checked={bucket === 'people'}
                disabled={!hasPeopleData}
                onChange={() => setBucket('people')}
              />
              <span>Actors &amp; directors</span>
            </label>
          </div>
          <button
            type="button"
            className="movie-wordcloud-shuffle-shape"
            disabled={wordList.length === 0}
            onClick={() => setShape(pickRandomWordCloudShape())}
            title="Pick another random outline shape"
          >
            New shape
          </button>
        </div>

        <div className="movie-wordcloud-modal-body">
          {!hasAnyLibraryData ? (
            <p className="movie-wordcloud-empty">Nothing ranked yet to draw from.</p>
          ) : filteredOutAllWords ? (
            <p className="movie-wordcloud-empty">
              Everything in this list was only common filler words — try another source tab.
            </p>
          ) : wordList.length === 0 ? (
            <p className="movie-wordcloud-empty">Couldn&apos;t extract enough words from this source.</p>
          ) : (
            <div className="movie-wordcloud-canvas-wrap">
              <div ref={viewportRef} className="movie-wordcloud-viewport">
                <canvas ref={canvasRef} className="movie-wordcloud-canvas" aria-hidden />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
