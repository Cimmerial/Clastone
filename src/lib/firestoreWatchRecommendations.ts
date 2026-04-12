import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  where,
  type Firestore,
  type QueryDocumentSnapshot
} from 'firebase/firestore';
import type { IncomingWatchRecommendation } from './mergeWatchlistRecommendations';

const SUBCOLLECTION = 'incomingWatchRecommendations';

/** Console prefix: filter DevTools with `[Clastone][watchRecommend]` */
export const WATCH_RECOMMEND_DEBUG = '[Clastone][watchRecommend]';

export function watchRecommendationDocId(fromUid: string, mediaId: string): string {
  const safeMedia = mediaId.replace(/\//g, '_');
  return `${fromUid}_${safeMedia}`;
}

export function parseIncomingRecommendationDoc(
  d: QueryDocumentSnapshot
): IncomingWatchRecommendation | null {
  const data = d.data() as Partial<IncomingWatchRecommendation>;
  if (
    !data.fromUid ||
    !data.toUid ||
    !data.mediaId ||
    (data.listType !== 'movies' && data.listType !== 'tv') ||
    !data.title ||
    !data.createdAt
  ) {
    return null;
  }
  return {
    fromUid: data.fromUid,
    fromUsername: data.fromUsername ?? '',
    toUid: data.toUid,
    mediaId: data.mediaId,
    listType: data.listType,
    title: data.title,
    posterPath: data.posterPath,
    releaseDate: data.releaseDate,
    createdAt: data.createdAt
  };
}

export async function loadIncomingRecommendations(
  db: Firestore,
  userId: string
): Promise<IncomingWatchRecommendation[]> {
  const col = collection(db, 'users', userId, SUBCOLLECTION);
  const snap = await getDocs(col);
  const out: IncomingWatchRecommendation[] = [];
  snap.forEach((d) => {
    const parsed = parseIncomingRecommendationDoc(d);
    if (parsed) out.push(parsed);
  });
  return out;
}

/** Logs paths and whether `friends/{fromUid}_{toUid}` exists (deployed rules require it for create). */
export async function logWatchRecommendFirestoreDebug(
  db: Firestore,
  label: string,
  ctx: { fromUid: string; toUid: string; mediaId: string }
): Promise<void> {
  const friendDocId = `${ctx.fromUid}_${ctx.toUid}`;
  const friendRef = doc(db, 'friends', friendDocId);
  const recId = watchRecommendationDocId(ctx.fromUid, ctx.mediaId);
  const incomingPath = `users/${ctx.toUid}/${SUBCOLLECTION}/${recId}`;
  let friendExists = false;
  let friendErr: string | undefined;
  try {
    const snap = await getDoc(friendRef);
    friendExists = snap.exists();
  } catch (e: unknown) {
    friendErr = e instanceof Error ? e.message : String(e);
  }
  console.log(WATCH_RECOMMEND_DEBUG, label, {
    friendDocId,
    friendDocExists: friendExists,
    friendDocReadError: friendErr,
    incomingDocPath: incomingPath,
    mediaId: ctx.mediaId,
    fromUid: ctx.fromUid,
    toUid: ctx.toUid
  });
}

export async function setWatchRecommendation(
  db: Firestore,
  params: {
    fromUid: string;
    fromUsername: string;
    toUid: string;
    mediaId: string;
    listType: 'movies' | 'tv';
    title: string;
    posterPath?: string;
    releaseDate?: string;
  }
): Promise<void> {
  const id = watchRecommendationDocId(params.fromUid, params.mediaId);
  const ref = doc(db, 'users', params.toUid, SUBCOLLECTION, id);
  const payload = {
    ...params,
    createdAt: new Date().toISOString()
  };
  console.log(WATCH_RECOMMEND_DEBUG, 'setWatchRecommendation:start', {
    path: ref.path,
    keys: Object.keys(payload),
    listType: params.listType,
    title: params.title
  });
  try {
    await setDoc(ref, payload);
    console.log(WATCH_RECOMMEND_DEBUG, 'setWatchRecommendation:ok', { path: ref.path });
  } catch (e: unknown) {
    const err = e as { code?: string; message?: string };
    console.error(WATCH_RECOMMEND_DEBUG, 'setWatchRecommendation:failed', {
      path: ref.path,
      code: err?.code,
      message: err?.message,
      hint:
        err?.code === 'permission-denied'
          ? 'Check deployed firestore.rules include incomingWatchRecommendations + friends doc id fromUid_toUid'
          : undefined
    });
    await logWatchRecommendFirestoreDebug(db, 'setWatchRecommendation:afterDeny', {
      fromUid: params.fromUid,
      toUid: params.toUid,
      mediaId: params.mediaId
    });
    throw e;
  }
}

export async function removeWatchRecommendation(
  db: Firestore,
  fromUid: string,
  toUid: string,
  mediaId: string
): Promise<void> {
  const id = watchRecommendationDocId(fromUid, mediaId);
  const ref = doc(db, 'users', toUid, SUBCOLLECTION, id);
  console.log(WATCH_RECOMMEND_DEBUG, 'removeWatchRecommendation:start', { path: ref.path });
  try {
    await deleteDoc(ref);
    console.log(WATCH_RECOMMEND_DEBUG, 'removeWatchRecommendation:ok', { path: ref.path });
  } catch (e: unknown) {
    const err = e as { code?: string; message?: string };
    console.error(WATCH_RECOMMEND_DEBUG, 'removeWatchRecommendation:failed', {
      path: ref.path,
      code: err?.code,
      message: err?.message
    });
    throw e;
  }
}

/**
 * When the recipient removes a title from their watchlist, delete every incoming
 * recommendation doc for that mediaId so friends’ toggles clear and merge won’t bring it back.
 */
export async function deleteIncomingRecommendationsForMedia(
  db: Firestore,
  recipientUid: string,
  mediaId: string
): Promise<void> {
  const col = collection(db, 'users', recipientUid, SUBCOLLECTION);
  const q = query(col, where('mediaId', '==', mediaId));
  const snap = await getDocs(q);
  if (snap.empty) return;
  await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
}

export async function getWatchRecommendationExists(
  db: Firestore,
  fromUid: string,
  toUid: string,
  mediaId: string
): Promise<boolean> {
  const id = watchRecommendationDocId(fromUid, mediaId);
  const ref = doc(db, 'users', toUid, SUBCOLLECTION, id);
  try {
    const snap = await getDoc(ref);
    return snap.exists();
  } catch (e: unknown) {
    const err = e as { code?: string; message?: string };
    console.error(WATCH_RECOMMEND_DEBUG, 'getWatchRecommendationExists:failed', {
      path: ref.path,
      code: err?.code,
      message: err?.message
    });
    throw e;
  }
}
