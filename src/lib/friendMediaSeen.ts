import type { Firestore } from 'firebase/firestore';
import { loadMovies } from './firestoreMovies';
import { loadTvShows } from './firestoreTvShows';

/** True if the friend has at least one non-empty watch record for this title id. */
export async function friendHasSeenMedia(
  db: Firestore,
  friendUid: string,
  itemId: string,
  mediaType: 'movie' | 'tv'
): Promise<boolean> {
  const byClass =
    mediaType === 'movie'
      ? (await loadMovies(db, friendUid)).byClass
      : (await loadTvShows(db, friendUid)).byClass;

  for (const list of Object.values(byClass)) {
    const item = list.find((i) => i.id === itemId);
    if (item && (item.watchRecords?.length ?? 0) > 0) return true;
  }
  return false;
}
