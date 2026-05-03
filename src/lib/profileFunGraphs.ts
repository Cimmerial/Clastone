import type { ThemedDropdownOption } from '../components/ThemedDropdown';

export type ProfileFunGraphId =
  | 'watchcount_per_year'
  | 'amount_per_ranked_class'
  | 'genre'
  | 'release_year'
  | 'avg_runtime_per_ranked_class'
  | 'avg_watch_percent_per_ranked_class'
  | 'runtime_vs_ranking'
  | 'ranking_vs_release_year';

export const PROFILE_FUN_GRAPH_OPTIONS_OWN: ThemedDropdownOption<ProfileFunGraphId>[] = [
  { value: 'watchcount_per_year', label: 'Watchcount per Year' },
  { value: 'amount_per_ranked_class', label: 'Amount per Ranked Class' },
  { value: 'genre', label: 'Genre' },
  { value: 'release_year', label: 'Release Year' },
  { value: 'avg_runtime_per_ranked_class', label: 'Avg Runtime per Ranked Class' },
  { value: 'avg_watch_percent_per_ranked_class', label: 'Avg Watch % per Ranked Class' },
  { value: 'runtime_vs_ranking', label: 'Runtime vs Ranking' },
  { value: 'ranking_vs_release_year', label: 'Ranking vs Release Year' },
];

export const PROFILE_FUN_GRAPH_OPTIONS_FRIEND: ThemedDropdownOption<ProfileFunGraphId>[] =
  PROFILE_FUN_GRAPH_OPTIONS_OWN.filter(
    (o) => o.value !== 'runtime_vs_ranking' && o.value !== 'ranking_vs_release_year'
  );
