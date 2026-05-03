import { useCallback, useEffect, useMemo, useState } from 'react';
import { tmdbPersonDetailsFull } from '../lib/tmdb';
import { birthYearFromBirthday } from '../lib/profilePeopleListHelpers';

/**
 * Fetches TMDB birthdays for people whose stored row has no parseable birth year
 * (e.g. never backfilled). Used on profile "by birth year" views so grouping matches
 * the info modal, without requiring Firestore writes for friends' data.
 */
export function useProfilePeopleBirthdayEnrichment<
  T extends { id: string; tmdbId?: number; birthday?: string }
>(people: T[], enabled: boolean): (item: T) => string | undefined {
  const [extraByTmdbId, setExtraByTmdbId] = useState<Record<number, string>>({});

  const fetchKey = useMemo(() => {
    if (!enabled) return '';
    return people
      .map((p) => {
        const tid = p.tmdbId ?? (parseInt(String(p.id).replace(/\D/g, ''), 10) || 0);
        const hasYear = birthYearFromBirthday(p.birthday) != null;
        return `${tid}:${hasYear ? '1' : '0'}`;
      })
      .join('|');
  }, [people, enabled]);

  useEffect(() => {
    if (!enabled || !fetchKey) return;

    let cancelled = false;

    const run = async () => {
      const needTmdbIds = new Set<number>();
      for (const p of people) {
        const tid = p.tmdbId ?? (parseInt(String(p.id).replace(/\D/g, ''), 10) || 0);
        if (tid <= 0) continue;
        if (birthYearFromBirthday(p.birthday) != null) continue;
        needTmdbIds.add(tid);
      }

      for (const tid of needTmdbIds) {
        if (cancelled) return;
        try {
          const cache = await tmdbPersonDetailsFull(tid);
          if (cancelled) return;
          const b = cache?.birthday?.trim();
          if (b) {
            setExtraByTmdbId((prev) => (prev[tid] ? prev : { ...prev, [tid]: b }));
          }
        } catch {
          /* ignore */
        }
        await new Promise((r) => setTimeout(r, 75));
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [enabled, fetchKey]);

  return useCallback(
    (item: T) => {
      const tid = item.tmdbId ?? (parseInt(String(item.id).replace(/\D/g, ''), 10) || 0);
      if (item.birthday?.trim()) return item.birthday;
      if (tid > 0 && extraByTmdbId[tid]) return extraByTmdbId[tid];
      return undefined;
    },
    [extraByTmdbId]
  );
}
