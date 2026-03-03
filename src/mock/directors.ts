import type { PersonItem } from '../components/EntryRowPerson';
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
    rankInClass: '#1 in ABSOLUTE_FAVORITE',
    name: 'Denis Villeneuve',
    birthday: 'Oct 3, 1967',
    topPerformances: ['Arrival', 'Blade Runner 2049', 'Sicario']
  },
  {
    id: 'director-2',
    classKey: 'AWESOME',
    absoluteRank: '12 / 40',
    rankInClass: '#3 in AWESOME',
    name: 'Greta Gerwig',
    birthday: 'Aug 4, 1983',
    topPerformances: ['Lady Bird', 'Little Women', 'Barbie']
  }
];

export const directorsByClass: Record<ClassKey, PersonItem[]> = directorClasses.reduce(
  (acc, classKey) => {
    acc[classKey] = directors.filter((d) => d.classKey === classKey);
    return acc;
  },
  {} as Record<ClassKey, PersonItem[]>
);

