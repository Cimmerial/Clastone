/** Current year for dropdown upper bound. */
export const CURRENT_YEAR = new Date().getFullYear();

const YEAR_START_DEFAULT = 1900;

/** Year options from minYear to current year, newest first. Use minYear = release year so you can't pick a year before the title existed. */
export function getYearOptions(minYear?: number): { value: string; label: string }[] {
  const start = minYear != null && !Number.isNaN(minYear) ? Math.min(minYear, CURRENT_YEAR) : YEAR_START_DEFAULT;
  const empty = { value: '', label: '—' };
  const years = Array.from(
    { length: CURRENT_YEAR - start + 1 },
    (_, i) => CURRENT_YEAR - i
  ).map((y) => ({ value: String(y), label: String(y) }));
  return [empty, ...years];
}

/** Year options from 1900 to current year (for contexts with no release year). */
export const YEAR_OPTIONS = getYearOptions(YEAR_START_DEFAULT);

export const MONTH_OPTIONS = [
  { value: '', label: '—' },
  ...Array.from({ length: 12 }, (_, i) => ({
    value: String(i + 1),
    label: new Date(2000, i, 1).toLocaleString('default', { month: 'short' })
  }))
];

export const DAY_OPTIONS = [
  { value: '', label: '—' },
  ...Array.from({ length: 31 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }))
];

export type DatePreset = 'today' | 'yesterday' | 'this_year';

export function applyDatePreset(preset: DatePreset): { year: string; month: string; day: string } {
  const d = new Date();
  if (preset === 'today') {
    return {
      year: String(d.getFullYear()),
      month: String(d.getMonth() + 1),
      day: String(d.getDate())
    };
  }
  if (preset === 'yesterday') {
    const y = new Date(d);
    y.setDate(y.getDate() - 1);
    return {
      year: String(y.getFullYear()),
      month: String(y.getMonth() + 1),
      day: String(y.getDate())
    };
  }
  return {
    year: String(d.getFullYear()),
    month: '',
    day: ''
  };
}

export const DATE_PRESET_OPTIONS: { value: DatePreset; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'this_year', label: 'This year' }
];
