import { ClassKey, RankedItemBase } from '../components/RankedList';
import type { MovieShowItem } from '../components/EntryRowMovieShow';

export const tvClasses: ClassKey[] = [
  'OLYMPUS',
  'DAMN_GOOD',
  'GOOD',
  'ALRIGHT',
  'MEH',
  'BAD',
  'DELICIOUS_GARBAGE'
];

type TvItem = MovieShowItem & RankedItemBase;

const tvShows: TvItem[] = [
  {
    id: 'tv-1',
    classKey: 'OLYMPUS',
    percentileRank: '99%',
    absoluteRank: '1 / 60',
    numberRanking: '10.0 / 10.0',
    rankInClass: '#1 in OLYMPUS',
    title: 'The Leftovers S2',
    viewingDates: 'Watched 2× · Last: Nov 2022',
    topCastNames: ['Justin Theroux', 'Carrie Coon', 'Regina King'],
    stickerTags: ['BEST_DRAMA'],
    percentCompleted: '200%'
  },
  {
    id: 'tv-2',
    classKey: 'DAMN_GOOD',
    percentileRank: '94%',
    absoluteRank: '4 / 60',
    numberRanking: '9.3 / 10.0',
    rankInClass: '#2 in DAMN_GOOD',
    title: 'Better Call Saul S5',
    viewingDates: 'Watched 1× · Last: May 2023',
    topCastNames: ['Bob Odenkirk', 'Rhea Seehorn'],
    stickerTags: ['BEST_CHARACTER_STUDY'],
    percentCompleted: '100%'
  }
];

export const tvByClass: Record<ClassKey, TvItem[]> = tvClasses.reduce(
  (acc, classKey) => {
    acc[classKey] = tvShows.filter((s) => s.classKey === classKey);
    return acc;
  },
  {} as Record<ClassKey, TvItem[]>
);

