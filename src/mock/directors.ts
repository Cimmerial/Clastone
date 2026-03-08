import type { PersonItem } from '../state/peopleStore';
import { ClassKey } from '../components/RankedList';

export const directorClasses: ClassKey[] = [
  'ABSOLUTE_FAVORITE',
  'MARVELOUS',
  'AWESOME',
  'GREAT',
  'UNRANKED',
  'DELICIOUS_GARBAGE'
];

const directors: PersonItem[] = [
  {
    id: 'director-1',
    classKey: 'ABSOLUTE_FAVORITE',
    absoluteRank: '1 / 40',
    percentileRank: '99%',
    media_type: 'person',
    rankInClass: '#1 in ABSOLUTE_FAVORITE',
    title: 'Denis Villeneuve',
    birthday: 'Oct 3, 1967',
    roles: [],
    moviesSeen: [],
    showsSeen: [],
    movieMinutes: 0,
    showMinutes: 0
  },
  {
    id: 'director-2',
    classKey: 'AWESOME',
    absoluteRank: '12 / 40',
    rankInClass: '#3 in AWESOME',
    title: 'Greta Gerwig',
    birthday: 'Aug 4, 1983',
    roles: [],
    moviesSeen: [],
    showsSeen: [],
    movieMinutes: 0,
    showMinutes: 0,
    percentileRank: '85%',
    media_type: 'person'
  }
];

export const directorsByClass: Record<ClassKey, PersonItem[]> = directorClasses.reduce(
  (acc, classKey) => {
    acc[classKey] = directors.filter((d) => d.classKey === classKey);
    return acc;
  },
  {} as Record<ClassKey, PersonItem[]>
);

