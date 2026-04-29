import {
  addDoc,
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  updateDoc,
  where,
  type Firestore,
} from 'firebase/firestore';

export type FeedbackKind = 'feature_request' | 'bug_report';
export type FeedbackStatus = 'default' | 'in_process' | 'completed';

export type FeatureFeedbackItem = {
  id: string;
  kind: FeedbackKind;
  title: string;
  body: string;
  status: FeedbackStatus;
  createdAt: string;
  updatedAt: string;
  authorUid: string | null;
  authorLabel: string;
  authorKey: string;
};

const FEATURE_FEEDBACK_ROOT = 'featureFeedback';
export const FEATURE_FEEDBACK_DAILY_LIMIT = 20;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function toFeedbackKind(value: unknown): FeedbackKind {
  return value === 'bug_report' ? 'bug_report' : 'feature_request';
}

function toFeedbackStatus(value: unknown): FeedbackStatus {
  if (value === 'in_process') return 'in_process';
  if (value === 'completed') return 'completed';
  return 'default';
}

function toFeedbackItem(id: string, data: Record<string, unknown>): FeatureFeedbackItem {
  return {
    id,
    kind: toFeedbackKind(data.kind),
    title: String(data.title ?? ''),
    body: String(data.body ?? ''),
    status: toFeedbackStatus(data.status),
    createdAt: String(data.createdAt ?? ''),
    updatedAt: String(data.updatedAt ?? ''),
    authorUid: typeof data.authorUid === 'string' ? data.authorUid : null,
    authorLabel: String(data.authorLabel ?? 'Unknown'),
    authorKey: String(data.authorKey ?? ''),
  };
}

export async function createFeatureFeedback(
  db: Firestore,
  payload: {
    kind: FeedbackKind;
    title: string;
    body: string;
    authorUid: string | null;
    authorLabel: string;
    authorKey: string;
  },
): Promise<void> {
  const now = new Date().toISOString();
  await addDoc(collection(db, FEATURE_FEEDBACK_ROOT), {
    kind: payload.kind,
    title: payload.title.trim(),
    body: payload.body.trim(),
    status: 'default',
    createdAt: now,
    updatedAt: now,
    authorUid: payload.authorUid,
    authorLabel: payload.authorLabel.trim(),
    authorKey: payload.authorKey,
  });
}

export async function loadFeatureFeedback(db: Firestore): Promise<FeatureFeedbackItem[]> {
  const snap = await getDocs(query(collection(db, FEATURE_FEEDBACK_ROOT), orderBy('createdAt', 'asc')));
  if (snap.empty) return [];
  return snap.docs
    .map((d) => toFeedbackItem(d.id, d.data() as Record<string, unknown>))
    .filter((item) => item.title.length > 0 && item.body.length > 0);
}

export async function updateFeatureFeedbackStatus(
  db: Firestore,
  id: string,
  status: FeedbackStatus,
): Promise<void> {
  await updateDoc(doc(db, FEATURE_FEEDBACK_ROOT, id), {
    status,
    updatedAt: new Date().toISOString(),
  });
}

export async function countRecentFeatureFeedbackByAuthorKey(
  db: Firestore,
  authorKey: string,
): Promise<number> {
  const since = new Date(Date.now() - ONE_DAY_MS).toISOString();
  const snap = await getDocs(query(
    collection(db, FEATURE_FEEDBACK_ROOT),
    where('authorKey', '==', authorKey),
  ));
  return snap.docs.reduce((count, d) => {
    const createdAt = String((d.data() as Record<string, unknown>).createdAt ?? '');
    return createdAt >= since ? count + 1 : count;
  }, 0);
}
