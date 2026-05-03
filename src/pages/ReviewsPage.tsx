import { useCallback, useMemo, useRef, useState } from 'react';
import { Info, Pencil, Search, Settings, Star } from 'lucide-react';
import { InfoModal } from '../components/InfoModal';
import { UniversalEditModal, type UniversalEditTarget } from '../components/UniversalEditModal';
import type { MovieShowItem } from '../components/EntryRowMovieShow';
import { prepareWatchRecordsForSave } from '../lib/watchDayOrderUtils';
import { watchMatrixEntriesToWatchRecords } from '../lib/watchMatrixMapping';
import { buildReviewCards, findFirstMatchingReview, sortReviewCards, splitRoundRobin, type ReviewCardItem } from '../lib/reviews';
import { useListsStore } from '../state/listsStore';
import { useMoviesStore } from '../state/moviesStore';
import { useTvStore } from '../state/tvStore';
import { tmdbImagePath } from '../lib/tmdb';
import { useNavigate } from 'react-router-dom';
import { useMobileViewMode } from '../hooks/useMobileViewMode';
import './ReviewsPage.css';

type ActiveEditorState = {
  card: ReviewCardItem;
  openReviewEditor: boolean;
};

function cardToModalTarget(card: ReviewCardItem): UniversalEditTarget {
  const tmdbId = Number.parseInt(card.entryId.replace(/\D/g, ''), 10) || undefined;
  return {
    id: card.entryId,
    tmdbId,
    title: card.entryTitle,
    posterPath: card.posterPath,
    mediaType: card.mediaType,
    subtitle: card.releaseDate ? String(card.releaseDate.slice(0, 4)) : undefined,
    releaseDate: card.releaseDate,
    runtimeMinutes: card.runtimeMinutes,
    totalEpisodes: card.totalEpisodes,
    existingClassKey: card.classKey,
  };
}

function cardToFallbackItem(card: ReviewCardItem): MovieShowItem {
  return {
    id: card.entryId,
    classKey: card.classKey ?? 'UNRANKED',
    title: card.entryTitle,
    posterPath: card.posterPath,
    releaseDate: card.releaseDate,
    runtimeMinutes: card.runtimeMinutes,
    totalEpisodes: card.totalEpisodes,
    watchRecords: [],
    percentileRank: '—',
    absoluteRank: '—',
    rankInClass: '—',
    numberRanking: '',
    viewingDates: '',
    topCastNames: [],
    stickerTags: [],
    percentCompleted: '',
  };
}

export function ReviewsPage() {
  const navigate = useNavigate();
  const { isMobile } = useMobileViewMode();
  const [favoritesFirst, setFavoritesFirst] = useState(false);
  const [expandedReviewIds, setExpandedReviewIds] = useState<Set<string>>(() => new Set());
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchError, setSearchError] = useState<string | null>(null);
  const [focusedReviewId, setFocusedReviewId] = useState<string | null>(null);
  const [infoModalTarget, setInfoModalTarget] = useState<{
    tmdbId: number;
    mediaType: 'movie' | 'tv';
    title: string;
    posterPath?: string;
    releaseDate?: string;
    entryId: string;
  } | null>(null);
  const [activeEditor, setActiveEditor] = useState<ActiveEditorState | null>(null);
  const reviewRefs = useRef<Record<string, HTMLElement | null>>({});

  const {
    byClass: movieByClass,
    classOrder: movieClassOrder,
    classes: movieClasses,
    getMovieById,
    updateMovieWatchRecords,
    moveItemToClass: moveMovieToClass,
    getClassLabel: getMovieClassLabel,
  } = useMoviesStore();
  const {
    byClass: tvByClass,
    classOrder: tvClassOrder,
    classes: tvClasses,
    getShowById,
    updateShowWatchRecords,
    moveItemToClass: moveShowToClass,
    getClassLabel: getTvClassLabel,
  } = useTvStore();
  const {
    getEditableListsForMediaType,
    setEntryListMembership,
    getSelectedListIdsForEntry,
    collectionIdsByEntryId,
    globalCollections,
  } = useListsStore();

  const reviewCards = useMemo(() => buildReviewCards({ moviesByClass: movieByClass, tvByClass }), [movieByClass, tvByClass]);
  const sortedReviews = useMemo(() => sortReviewCards(reviewCards, favoritesFirst), [reviewCards, favoritesFirst]);
  const columns = useMemo(
    () => splitRoundRobin(sortedReviews, isMobile ? 1 : 3),
    [sortedReviews, isMobile]
  );

  const currentModalItem = useMemo(() => {
    if (!activeEditor) return null;
    if (activeEditor.card.mediaType === 'movie') {
      return getMovieById(activeEditor.card.entryId) ?? cardToFallbackItem(activeEditor.card);
    }
    return getShowById(activeEditor.card.entryId) ?? cardToFallbackItem(activeEditor.card);
  }, [activeEditor, getMovieById, getShowById]);

  const toggleExpand = useCallback((id: string) => {
    setExpandedReviewIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleOpenInfo = useCallback((card: ReviewCardItem) => {
    const tmdbId = Number.parseInt(card.entryId.replace(/\D/g, ''), 10);
    if (!tmdbId) return;
    setInfoModalTarget({
      tmdbId,
      mediaType: card.mediaType,
      title: card.entryTitle,
      posterPath: card.posterPath,
      releaseDate: card.releaseDate,
      entryId: card.entryId,
    });
  }, []);

  const handleSearch = useCallback(() => {
    const match = findFirstMatchingReview(sortedReviews, searchQuery);
    if (!match) {
      setSearchError('No matching reviews found.');
      return;
    }
    setSearchError(null);
    setFocusedReviewId(match.id);
    setExpandedReviewIds((prev) => new Set(prev).add(match.id));
    reviewRefs.current[match.id]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [searchQuery, sortedReviews]);

  const openReviewEditor = useCallback((card: ReviewCardItem) => {
    setActiveEditor({ card, openReviewEditor: true });
  }, []);

  const openSettingsModal = useCallback((card: ReviewCardItem) => {
    setActiveEditor({ card, openReviewEditor: false });
  }, []);

  return (
    <section className="reviews-page">
      <header className="page-heading">
        <div>
          <h1 className="page-title">Reviews</h1>
          <p className="reviews-subtitle">Your latest watch reviews, sorted newest first.</p>
        </div>
        <div className="reviews-controls">
          <label className="reviews-favorites-toggle" htmlFor="reviews-favorites-first">
            <input
              id="reviews-favorites-first"
              type="checkbox"
              checked={favoritesFirst}
              onChange={(event) => setFavoritesFirst(event.target.checked)}
            />
            <span>
              <Star size={14} />
              Favorites First
            </span>
          </label>
          <button
            type="button"
            className="reviews-search-toggle"
            onClick={() => {
              setSearchOpen((open) => !open);
              setSearchError(null);
            }}
          >
            <Search size={16} />
            Search
          </button>
        </div>
      </header>

      {searchOpen ? (
        <div className="reviews-search-bar">
          <input
            type="text"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') handleSearch();
            }}
            placeholder="Search entry title or review keywords..."
            aria-label="Search reviews"
          />
          <button type="button" onClick={handleSearch}>Go</button>
        </div>
      ) : null}
      {searchError ? <p className="reviews-search-error">{searchError}</p> : null}

      {sortedReviews.length === 0 ? (
        <div className="reviews-empty">No reviews yet. Add one from any entry settings menu.</div>
      ) : (
        <div className="reviews-columns" data-columns={isMobile ? 1 : 3}>
          {columns.map((column, columnIndex) => (
            <div className="reviews-column" key={`reviews-col-${columnIndex}`}>
              {column.map((card) => {
                const expanded = expandedReviewIds.has(card.id);
                const posterUrl = card.posterPath ? tmdbImagePath(card.posterPath, 'w185') : null;
                return (
                  <article
                    key={card.id}
                    ref={(el) => {
                      reviewRefs.current[card.id] = el;
                    }}
                    className={`reviews-card ${expanded ? 'reviews-card-expanded' : ''} ${focusedReviewId === card.id ? 'reviews-card-focused' : ''}`}
                    onClick={() => toggleExpand(card.id)}
                  >
                    <div className="reviews-card-head">
                      <div className="reviews-card-summary">
                        {posterUrl ? <img src={posterUrl} alt="" className="reviews-card-poster" loading="lazy" /> : <div className="reviews-card-poster reviews-card-poster-placeholder" />}
                        <div>
                          <h3>{card.reviewTitle}</h3>
                          <p>{card.entryTitle}</p>
                          <span>{card.reviewDateLabel}</span>
                        </div>
                      </div>
                      <div className="reviews-card-actions" onClick={(event) => event.stopPropagation()}>
                        <button type="button" onClick={() => handleOpenInfo(card)} aria-label="View entry info">
                          <Info size={14} />
                        </button>
                        <button type="button" onClick={() => openSettingsModal(card)} aria-label="Open entry settings">
                          <Settings size={14} />
                        </button>
                        <button type="button" onClick={() => openReviewEditor(card)} aria-label="Edit this review">
                          <Pencil size={14} />
                        </button>
                      </div>
                    </div>
                    {expanded ? (
                      <div className="reviews-card-body">
                        <p>{card.reviewBody || 'No review body text.'}</p>
                        {card.favoriteReview ? <div className="reviews-favorite-chip">Favorite review</div> : null}
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {infoModalTarget ? (
        <InfoModal
          isOpen
          onClose={() => setInfoModalTarget(null)}
          tmdbId={infoModalTarget.tmdbId}
          mediaType={infoModalTarget.mediaType}
          title={infoModalTarget.title}
          posterPath={infoModalTarget.posterPath}
          releaseDate={infoModalTarget.releaseDate}
          collectionTags={infoModalTarget.mediaType === 'movie'
            ? (collectionIdsByEntryId.get(infoModalTarget.entryId) ?? []).map((id) => ({
                id,
                label: globalCollections.find((item) => item.id === id)?.name ?? id,
                color: globalCollections.find((item) => item.id === id)?.color,
              }))
            : []}
          onEditWatches={() => {
            const match = sortedReviews.find((card) => card.entryId === infoModalTarget.entryId);
            if (match) {
              setInfoModalTarget(null);
              openSettingsModal(match);
            }
          }}
        />
      ) : null}

      {activeEditor && currentModalItem ? (
        <UniversalEditModal
          target={cardToModalTarget(activeEditor.card)}
          initialWatches={currentModalItem.watchRecords}
          currentClassKey={currentModalItem.classKey}
          currentClassLabel={
            currentModalItem.classKey
              ? (activeEditor.card.mediaType === 'movie'
                  ? getMovieClassLabel(currentModalItem.classKey)
                  : getTvClassLabel(currentModalItem.classKey))
              : undefined
          }
          rankedClasses={(activeEditor.card.mediaType === 'movie' ? movieClasses : tvClasses).map((c) => ({
            key: c.key,
            label: c.label,
            tagline: c.tagline,
            isRanked: c.isRanked,
          }))}
          isWatchlistItem={false}
          availableTags={getEditableListsForMediaType(activeEditor.card.mediaType).map((list) => ({
            listId: list.id,
            label: list.name,
            color: list.color,
            selected: getSelectedListIdsForEntry(activeEditor.card.entryId).includes(list.id),
            editableInWatchModal: list.allowWatchModalTagEditing !== false,
            href: `/lists/${list.id}`,
          }))}
          collectionTags={(collectionIdsByEntryId.get(activeEditor.card.entryId) ?? []).map((id) => ({
            id,
            label: globalCollections.find((item) => item.id === id)?.name ?? id,
            color: globalCollections.find((item) => item.id === id)?.color,
            href: `/lists/collection/${id}`,
          }))}
          isSaving={false}
          initialReviewEntryId={activeEditor.openReviewEditor ? activeEditor.card.watchRecordId : undefined}
          onClose={() => setActiveEditor(null)}
          onGoPickTemplate={() => {
            setActiveEditor(null);
            navigate(activeEditor.card.mediaType === 'movie' ? '/movies#movie-class-templates' : '/tv#tv-class-templates', { replace: true });
          }}
          onSave={async (params, goToMedia) => {
            const keepModalOpen = Boolean(params.keepModalOpen);
            const watches = prepareWatchRecordsForSave(
              watchMatrixEntriesToWatchRecords(params.watches),
              activeEditor.card.entryId,
              movieByClass,
              tvByClass,
              movieClassOrder,
              tvClassOrder
            );
            if (activeEditor.card.mediaType === 'movie') {
              updateMovieWatchRecords(activeEditor.card.entryId, watches);
              if (params.classKey) {
                moveMovieToClass(activeEditor.card.entryId, params.classKey, {
                  toTop: params.position === 'top',
                  toMiddle: params.position === 'middle',
                });
              }
              if (params.listMemberships?.length) {
                setEntryListMembership(activeEditor.card.entryId, 'movie', params.listMemberships, {
                  title: activeEditor.card.entryTitle,
                  posterPath: activeEditor.card.posterPath,
                  releaseDate: activeEditor.card.releaseDate,
                });
              }
              if (!keepModalOpen && goToMedia) {
                navigate('/movies', { replace: true, state: { scrollToId: activeEditor.card.entryId } });
              }
            } else {
              updateShowWatchRecords(activeEditor.card.entryId, watches);
              if (params.classKey) {
                moveShowToClass(activeEditor.card.entryId, params.classKey, {
                  toTop: params.position === 'top',
                  toMiddle: params.position === 'middle',
                });
              }
              if (params.listMemberships?.length) {
                setEntryListMembership(activeEditor.card.entryId, 'tv', params.listMemberships, {
                  title: activeEditor.card.entryTitle,
                  posterPath: activeEditor.card.posterPath,
                  releaseDate: activeEditor.card.releaseDate,
                });
              }
              if (!keepModalOpen && goToMedia) {
                navigate('/tv', { replace: true, state: { scrollToId: activeEditor.card.entryId } });
              }
            }
            if (!keepModalOpen) {
              setActiveEditor(null);
            }
          }}
          onTagToggle={(listId, selected) => {
            setEntryListMembership(
              activeEditor.card.entryId,
              activeEditor.card.mediaType === 'movie' ? 'movie' : 'tv',
              [{ listId, selected }],
              {
                title: activeEditor.card.entryTitle,
                posterPath: activeEditor.card.posterPath,
                releaseDate: activeEditor.card.releaseDate,
              }
            );
          }}
        />
      ) : null}
    </section>
  );
}
