export type SearchResultType = 'movie' | 'tv' | 'person';

export type MockSearchResult = {
  id: string;
  type: SearchResultType;
  title: string;
  subtitle: string;
};

export const mockSearchResults: MockSearchResult[] = [
  { id: 'sr-1', type: 'movie', title: 'Arrival', subtitle: '2016 · Sci-Fi/Drama' },
  { id: 'sr-2', type: 'tv', title: 'The Leftovers', subtitle: '2014–2017 · Season 2' },
  { id: 'sr-3', type: 'person', title: 'Regina King', subtitle: 'Actor · Born 1971' }
];

