const STORAGE_KEY = 'clastone_persist_debounce_ms';
export const DEFAULT_PERSIST_DEBOUNCE_MS = 5000;
const MIN_MS = 1000;
const MAX_MS = 120000;

const listeners = new Set<() => void>();

function clampMs(raw: number): number {
  if (!Number.isFinite(raw)) return DEFAULT_PERSIST_DEBOUNCE_MS;
  return Math.min(MAX_MS, Math.max(MIN_MS, Math.round(raw)));
}

/** Debounce for movies / TV / people / directors / watchlist Firestore persist (not settings UI or lists). */
export function getPersistDebounceMs(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw == null || raw === '') return DEFAULT_PERSIST_DEBOUNCE_MS;
    return clampMs(Number(raw));
  } catch {
    return DEFAULT_PERSIST_DEBOUNCE_MS;
  }
}

export function setPersistDebounceMs(ms: number): void {
  const next = clampMs(ms);
  try {
    localStorage.setItem(STORAGE_KEY, String(next));
  } catch {
    /* ignore */
  }
  listeners.forEach((fn) => {
    try {
      fn();
    } catch {
      /* ignore */
    }
  });
}

export function subscribePersistDebounce(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
