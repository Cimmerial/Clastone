import type { PersonItem } from '../components/EntryRowPerson';
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
    rankInClass: '#1 in ABSOLUTE_FAVORITE',
    name: 'Regina King',
    birthday: 'Jan 15, 1971',
    topPerformances: ['The Leftovers', 'Watchmen', 'If Beale Street Could Talk']
  },
  {
    id: 'actor-2',
    classKey: 'MARVELOUS',
    absoluteRank: '9 / 80',
    rankInClass: '#2 in MARVELOUS',
    name: 'Amy Adams',
    birthday: 'Aug 20, 1974',
    topPerformances: ['Arrival', 'Nocturnal Animals', 'Her']
  }
];

export const actorsByClass: Record<ClassKey, PersonItem[]> = actorClasses.reduce(
  (acc, classKey) => {
    acc[classKey] = actors.filter((a) => a.classKey === classKey);
    return acc;
  },
  {} as Record<ClassKey, PersonItem[]>
);

