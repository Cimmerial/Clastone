import { ClassKey, RankedItemBase } from '../components/RankedList';
import type { MovieShowItem } from '../components/EntryRowMovieShow';

export type MovieClassDef = {
  key: ClassKey;
  label: string;
  /** If false, items in this class do not affect global percentile/absolute ranks. */
  isRanked: boolean;
};

export const defaultMovieClassDefs: MovieClassDef[] = [
  { key: 'OLYMPUS', label: 'OLYMPUS', isRanked: true },
  { key: 'DAMN_GOOD', label: 'DAMN GOOD', isRanked: true },
  { key: 'GOOD', label: 'GOOD', isRanked: true },
  { key: 'ALRIGHT', label: 'ALRIGHT', isRanked: true },
  { key: 'MEH', label: 'MEH', isRanked: true },
  { key: 'BAD', label: 'BAD', isRanked: true },
  { key: 'BABY', label: 'BABY', isRanked: false },
  { key: 'DELICIOUS_GARBAGE', label: 'DELICIOUS GARBAGE', isRanked: false },
  { key: 'UNRANKED', label: 'UNRANKED', isRanked: false }
];

export const movieClasses: ClassKey[] = defaultMovieClassDefs.map((c) => c.key);

type MovieItem = MovieShowItem & RankedItemBase;

const movies: MovieItem[] = [
  {
    id: 'movie-1',
    classKey: 'OLYMPUS',
    percentileRank: '98%',
    absoluteRank: '1 / 120',
    numberRanking: '9.8 / 10.0',
    rankInClass: '#1 in OLYMPUS',
    title: 'Arrival',
    viewingDates: 'Watched 3× · Last: Jan 2024',
    watchTime: '6h 10m total',
    topCastNames: ['Amy Adams', 'Jeremy Renner', 'Forest Whitaker'],
    stickerTags: ['BEST_SCI_FI', 'BEST_SCORE'],
    percentCompleted: '300%'
  },
  {
    id: 'movie-2',
    classKey: 'OLYMPUS',
    percentileRank: '96%',
    absoluteRank: '2 / 120',
    numberRanking: '9.6 / 10.0',
    rankInClass: '#2 in OLYMPUS',
    title: 'Mad Max: Fury Road',
    viewingDates: 'Watched 4× · Last: Oct 2023',
    watchTime: '8h 20m total',
    topCastNames: ['Charlize Theron', 'Tom Hardy'],
    stickerTags: ['BEST_ACTION', 'BEST_WORLD_BUILDING'],
    percentCompleted: '400%'
  },
  {
    id: 'movie-3',
    classKey: 'DAMN_GOOD',
    percentileRank: '90%',
    absoluteRank: '10 / 120',
    numberRanking: '9.0 / 10.0',
    rankInClass: '#1 in DAMN_GOOD',
    title: 'Spider-Man: Into the Spider-Verse',
    viewingDates: 'Watched 2× · Last: Jun 2023',
    watchTime: '3h 40m total',
    topCastNames: ['Shameik Moore', 'Hailee Steinfeld'],
    stickerTags: ['BEST_ANIMATION'],
    percentCompleted: '200%'
  }
];

export const moviesByClass: Record<ClassKey, MovieItem[]> = movieClasses.reduce(
  (acc, classKey) => {
    acc[classKey] = movies.filter((m) => m.classKey === classKey);
    return acc;
  },
  {} as Record<ClassKey, MovieItem[]>
);

