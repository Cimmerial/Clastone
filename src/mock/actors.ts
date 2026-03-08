import type { PersonItem } from '../state/peopleStore';
import { ClassKey } from '../components/RankedList';

export const actorClasses: ClassKey[] = [
  'ABSOLUTE_FAVORITE',
  'MARVELOUS',
  'AWESOME',
  'GREAT',
  'UNRANKED',
  'DELICIOUS_GARBAGE'
];

const actors: PersonItem[] = [
  {
    id: 'actor-1',
    classKey: 'ABSOLUTE_FAVORITE',
    absoluteRank: '1 / 80',
    percentileRank: '99%',
    media_type: 'person',
    rankInClass: '#1 in ABSOLUTE_FAVORITE',
    title: 'Regina King',
    birthday: 'Jan 15, 1971',
    roles: [],
    moviesSeen: [],
    showsSeen: [],
    movieMinutes: 0,
    showMinutes: 0
  },
  {
    id: 'actor-2',
    classKey: 'MARVELOUS',
    absoluteRank: '9 / 80',
    percentileRank: '88%',
    media_type: 'person',
    rankInClass: '#2 in MARVELOUS',
    title: 'Amy Adams',
    birthday: 'Aug 20, 1974',
    roles: [],
    moviesSeen: [],
    showsSeen: [],
    movieMinutes: 0,
    showMinutes: 0
  }
];

export const actorsByClass: Record<ClassKey, PersonItem[]> = actorClasses.reduce(
  (acc, classKey) => {
    acc[classKey] = actors.filter((a) => a.classKey === classKey);
    return acc;
  },
  {} as Record<ClassKey, PersonItem[]>
);

