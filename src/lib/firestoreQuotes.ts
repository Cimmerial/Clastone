import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  updateDoc,
  where,
  writeBatch,
  type Firestore,
  type Unsubscribe,
} from 'firebase/firestore';
import legacyQuotes from '../data/quotes.json';

export type QuoteCategory =
  | 'movies'
  | 'tv'
  | 'actors'
  | 'directors'
  | 'watchlist'
  | 'search'
  | 'profile'
  | 'settings';

export type FirebaseQuote = {
  id: string;
  category: QuoteCategory;
  text: string;
  speakerFirstName: string;
  speakerFullName: string;
  character: string;
  source: string;
  sourceTmdbId?: number;
  sourceMediaType?: 'movie' | 'tv' | 'person';
  sourcePosterPath?: string;
  addedByUid?: string;
  addedByUsername?: string;
  addedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type QuoteSubmissionStatus = 'pending' | 'approved' | 'rejected';

export type QuoteSubmission = {
  id: string;
  status: QuoteSubmissionStatus;
  category: QuoteCategory;
  text: string;
  speakerFirstName: string;
  speakerFullName: string;
  source: string;
  sourceTmdbId?: number;
  sourceMediaType?: 'movie' | 'tv' | 'person';
  sourcePosterPath?: string;
  requesterUid: string;
  requesterUsername: string;
  requesterLabel: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
  resolvedByUid?: string;
  resolvedByUsername?: string;
  approvedQuoteId?: string;
};

type LegacyQuote = {
  text: string;
  character: string;
  source: string;
};

type LegacyQuotesData = Record<string, LegacyQuote[]>;

const QUOTES_ROOT = 'globalQuotes';
export const QUOTE_SUBMISSIONS_ROOT = 'quoteSubmissions';

export class QuoteSubmissionAlreadyResolvedError extends Error {
  readonly resolvedByUsername?: string;

  constructor(message: string, resolvedByUsername?: string) {
    super(message);
    this.name = 'QuoteSubmissionAlreadyResolvedError';
    this.resolvedByUsername = resolvedByUsername;
  }
}

export class QuoteEditConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QuoteEditConflictError';
  }
}

function toQuoteCategory(value: string): QuoteCategory {
  const safe = value.trim().toLowerCase();
  // "general" has been retired; map it to profile.
  if (safe === 'general') return 'profile';
  if (
    safe === 'movies' ||
    safe === 'tv' ||
    safe === 'actors' ||
    safe === 'directors' ||
    safe === 'watchlist' ||
    safe === 'search' ||
    safe === 'profile' ||
    safe === 'settings'
  ) {
    return safe;
  }
  return 'profile';
}

export async function loadGlobalQuotes(db: Firestore): Promise<FirebaseQuote[]> {
  const snap = await getDocs(collection(db, QUOTES_ROOT));
  if (snap.empty) return [];
  return snap.docs
    .map((d) => {
      const data = d.data();
      const speakerFirstNameRaw = String(data.speakerFirstName ?? data.character ?? '').trim();
      const speakerFullNameRaw = String(data.speakerFullName ?? '').trim();
      const sourceRaw = String(data.source ?? '').trim();
      return {
        id: d.id,
        category: toQuoteCategory(String(data.category ?? 'profile')),
        text: String(data.text ?? ''),
        speakerFirstName: speakerFirstNameRaw,
        speakerFullName: speakerFullNameRaw,
        character: speakerFirstNameRaw,
        source: sourceRaw,
        sourceTmdbId: typeof data.sourceTmdbId === 'number' ? data.sourceTmdbId : undefined,
        sourceMediaType:
          data.sourceMediaType === 'movie' || data.sourceMediaType === 'tv' || data.sourceMediaType === 'person'
            ? data.sourceMediaType
            : undefined,
        sourcePosterPath: typeof data.sourcePosterPath === 'string' ? data.sourcePosterPath : undefined,
        addedByUid: typeof data.addedByUid === 'string' ? data.addedByUid : undefined,
        addedByUsername: typeof data.addedByUsername === 'string' ? data.addedByUsername : undefined,
        addedAt: typeof data.addedAt === 'string' ? data.addedAt : undefined,
        createdAt: String(data.createdAt ?? ''),
        updatedAt: String(data.updatedAt ?? ''),
      } satisfies FirebaseQuote;
    })
    .filter((q) => q.text.length > 0)
    .sort((a, b) => a.text.localeCompare(b.text));
}

export type QuoteWritePayload = {
  category: QuoteCategory;
  text: string;
  source: string;
  speakerFirstName?: string;
  speakerFullName?: string;
  character?: string;
  sourceTmdbId?: number;
  sourceMediaType?: 'movie' | 'tv' | 'person';
  sourcePosterPath?: string;
  addedByUid?: string;
  addedByUsername?: string;
  addedAt?: string;
};

function toQuoteWriteData(payload: QuoteWritePayload) {
  const speakerFirstName = (payload.speakerFirstName ?? payload.character ?? '').trim();
  const speakerFullName = (payload.speakerFullName ?? '').trim();
  const data: Record<string, unknown> = {
    category: payload.category,
    text: payload.text.trim(),
    source: payload.source.trim(),
    speakerFirstName,
    speakerFullName,
    // Keep legacy field populated for older UI code paths.
    character: speakerFirstName,
  };
  if (payload.sourceTmdbId != null) data.sourceTmdbId = payload.sourceTmdbId;
  if (payload.sourceMediaType) data.sourceMediaType = payload.sourceMediaType;
  if (payload.sourcePosterPath != null) data.sourcePosterPath = payload.sourcePosterPath.trim();
  if (payload.addedByUid != null) data.addedByUid = payload.addedByUid.trim();
  if (payload.addedByUsername != null) data.addedByUsername = payload.addedByUsername.trim();
  if (payload.addedAt != null) data.addedAt = payload.addedAt.trim();
  return data;
}

export async function addGlobalQuote(
  db: Firestore,
  payload: QuoteWritePayload,
): Promise<void> {
  const now = new Date().toISOString();
  const ref = doc(collection(db, QUOTES_ROOT));
  await runTransaction(db, async (tx) => {
    tx.set(ref, {
      ...toQuoteWriteData(payload),
      addedAt: payload.addedAt?.trim() || now,
      createdAt: now,
      updatedAt: now,
    });
  });
}

export async function addGlobalQuoteReturningId(
  db: Firestore,
  payload: QuoteWritePayload,
): Promise<string> {
  const now = new Date().toISOString();
  const ref = doc(collection(db, QUOTES_ROOT));
  await runTransaction(db, async (tx) => {
    tx.set(ref, {
      ...toQuoteWriteData(payload),
      addedAt: payload.addedAt?.trim() || now,
      createdAt: now,
      updatedAt: now,
    });
  });
  return ref.id;
}

export async function updateGlobalQuote(
  db: Firestore,
  quoteId: string,
  payload: QuoteWritePayload,
  options?: {
    expectedUpdatedAt?: string;
  },
): Promise<void> {
  const now = new Date().toISOString();
  const ref = doc(db, QUOTES_ROOT, quoteId);
  const expectedUpdatedAt = options?.expectedUpdatedAt?.trim();
  if (!expectedUpdatedAt) {
    await updateDoc(ref, {
      ...toQuoteWriteData(payload),
      updatedAt: now,
    });
    return;
  }

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) {
      throw new Error('Quote no longer exists.');
    }
    const currentUpdatedAt = String((snap.data() as Record<string, unknown>).updatedAt ?? '');
    if (currentUpdatedAt !== expectedUpdatedAt) {
      throw new QuoteEditConflictError('This quote was updated by someone else. Please reopen it and try again.');
    }
    tx.update(ref, {
      ...toQuoteWriteData(payload),
      updatedAt: now,
    });
  });
}

export async function deleteGlobalQuote(db: Firestore, quoteId: string): Promise<void> {
  await deleteDoc(doc(db, QUOTES_ROOT, quoteId));
}

type QuoteSubmissionWritePayload = {
  category: QuoteCategory;
  text: string;
  speakerFirstName: string;
  speakerFullName: string;
  source: string;
  sourceTmdbId?: number;
  sourceMediaType?: 'movie' | 'tv' | 'person';
  sourcePosterPath?: string;
  requesterUid: string;
  requesterUsername: string;
};

function toQuoteSubmission(id: string, data: Record<string, unknown>): QuoteSubmission {
  return {
    id,
    status:
      data.status === 'approved' || data.status === 'rejected'
        ? data.status
        : 'pending',
    category: toQuoteCategory(String(data.category ?? 'profile')),
    text: String(data.text ?? ''),
    speakerFirstName: String(data.speakerFirstName ?? data.character ?? ''),
    speakerFullName: String(data.speakerFullName ?? ''),
    source: String(data.source ?? ''),
    sourceTmdbId: typeof data.sourceTmdbId === 'number' ? data.sourceTmdbId : undefined,
    sourceMediaType:
      data.sourceMediaType === 'movie' || data.sourceMediaType === 'tv' || data.sourceMediaType === 'person'
        ? data.sourceMediaType
        : undefined,
    sourcePosterPath: typeof data.sourcePosterPath === 'string' ? data.sourcePosterPath : undefined,
    requesterUid: String(data.requesterUid ?? ''),
    requesterUsername: String(data.requesterUsername ?? ''),
    requesterLabel: String(data.requesterLabel ?? data.requesterUsername ?? ''),
    createdAt: String(data.createdAt ?? ''),
    updatedAt: String(data.updatedAt ?? ''),
    resolvedAt: typeof data.resolvedAt === 'string' ? data.resolvedAt : undefined,
    resolvedByUid: typeof data.resolvedByUid === 'string' ? data.resolvedByUid : undefined,
    resolvedByUsername: typeof data.resolvedByUsername === 'string' ? data.resolvedByUsername : undefined,
    approvedQuoteId: typeof data.approvedQuoteId === 'string' ? data.approvedQuoteId : undefined,
  };
}

export async function createQuoteSubmission(
  db: Firestore,
  payload: QuoteSubmissionWritePayload,
): Promise<void> {
  const now = new Date().toISOString();
  const ref = doc(collection(db, QUOTE_SUBMISSIONS_ROOT));
  await runTransaction(db, async (tx) => {
    tx.set(ref, {
      status: 'pending',
      category: payload.category,
      text: payload.text.trim(),
      speakerFirstName: payload.speakerFirstName.trim(),
      speakerFullName: payload.speakerFullName.trim(),
      source: payload.source.trim(),
      sourceTmdbId: payload.sourceTmdbId,
      sourceMediaType: payload.sourceMediaType,
      sourcePosterPath: payload.sourcePosterPath?.trim() || '',
      requesterUid: payload.requesterUid.trim(),
      requesterUsername: payload.requesterUsername.trim(),
      requesterLabel: payload.requesterUsername.trim(),
      createdAt: now,
      updatedAt: now,
    });
  });
}

export async function loadQuoteSubmissions(db: Firestore): Promise<QuoteSubmission[]> {
  const snap = await getDocs(query(collection(db, QUOTE_SUBMISSIONS_ROOT), orderBy('createdAt', 'asc')));
  if (snap.empty) return [];
  return snap.docs
    .map((d) => toQuoteSubmission(d.id, d.data() as Record<string, unknown>))
    .filter((item) => item.text.length > 0);
}

export function subscribeQuoteSubmissions(
  db: Firestore,
  onChange: (items: QuoteSubmission[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    query(collection(db, QUOTE_SUBMISSIONS_ROOT), orderBy('createdAt', 'asc')),
    (snap) => {
      onChange(
        snap.docs
          .map((d) => toQuoteSubmission(d.id, d.data() as Record<string, unknown>))
          .filter((item) => item.text.length > 0),
      );
    },
    (error) => {
      onError?.(error);
    },
  );
}

export function subscribeQuoteSubmissionsForRequester(
  db: Firestore,
  requesterUid: string,
  onChange: (items: QuoteSubmission[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    query(
      collection(db, QUOTE_SUBMISSIONS_ROOT),
      where('requesterUid', '==', requesterUid),
    ),
    (snap) => {
      onChange(
        snap.docs
          .map((d) => toQuoteSubmission(d.id, d.data() as Record<string, unknown>))
          .filter((item) => item.text.length > 0),
      );
    },
    (error) => {
      onError?.(error);
    },
  );
}

export async function resolveQuoteSubmission(
  db: Firestore,
  params: {
    submissionId: string;
    resolution: 'approved' | 'rejected';
    resolverUid: string;
    resolverUsername: string;
  },
): Promise<void> {
  await runTransaction(db, async (tx) => {
    const submissionRef = doc(db, QUOTE_SUBMISSIONS_ROOT, params.submissionId);
    const submissionSnap = await tx.get(submissionRef);
    if (!submissionSnap.exists()) {
      throw new Error('Quote submission no longer exists.');
    }
    const data = submissionSnap.data() as Record<string, unknown>;
    const current = toQuoteSubmission(params.submissionId, data);
    if (current.status !== 'pending') {
      throw new QuoteSubmissionAlreadyResolvedError(
        `This quote request was already ${current.status}.`,
        current.resolvedByUsername,
      );
    }

    const now = new Date().toISOString();
    let approvedQuoteId = '';
    if (params.resolution === 'approved') {
      const quoteRef = doc(collection(db, QUOTES_ROOT));
      approvedQuoteId = quoteRef.id;
      tx.set(quoteRef, {
        category: current.category,
        text: current.text,
        speakerFirstName: current.speakerFirstName,
        speakerFullName: current.speakerFullName,
        character: current.speakerFirstName,
        source: current.source,
        sourceTmdbId: current.sourceTmdbId ?? null,
        sourceMediaType: current.sourceMediaType ?? null,
        sourcePosterPath: current.sourcePosterPath ?? '',
        addedByUid: current.requesterUid,
        addedByUsername: current.requesterUsername,
        addedAt: now,
        createdAt: now,
        updatedAt: now,
      });
    }

    tx.update(submissionRef, {
      status: params.resolution,
      resolvedByUid: params.resolverUid,
      resolvedByUsername: params.resolverUsername,
      resolvedAt: now,
      approvedQuoteId: approvedQuoteId || '',
      updatedAt: now,
    });
  });
}

export async function countPendingQuoteSubmissions(db: Firestore): Promise<number> {
  const pendingSnap = await getDocs(query(
    collection(db, QUOTE_SUBMISSIONS_ROOT),
    where('status', '==', 'pending'),
  ));
  return pendingSnap.size;
}

export function subscribePendingQuoteSubmissionCount(
  db: Firestore,
  onChange: (count: number) => void,
): Unsubscribe {
  return onSnapshot(
    query(collection(db, QUOTE_SUBMISSIONS_ROOT), where('status', '==', 'pending')),
    (snap) => {
      onChange(snap.size);
    },
    () => onChange(0),
  );
}

export async function migrateLegacyQuotesIfNeeded(db: Firestore): Promise<boolean> {
  const existingSnap = await getDocs(query(collection(db, QUOTES_ROOT), limit(1)));
  if (!existingSnap.empty) return false;

  const typedLegacy = legacyQuotes as LegacyQuotesData;
  const batch = writeBatch(db);
  const now = new Date().toISOString();

  Object.entries(typedLegacy).forEach(([categoryKey, quotes]) => {
    const category = toQuoteCategory(categoryKey);
    quotes.forEach((quote) => {
      const ref = doc(collection(db, QUOTES_ROOT));
      batch.set(ref, {
        category,
        text: quote.text,
        character: quote.character,
        source: quote.source,
        createdAt: now,
        updatedAt: now,
      });
    });
  });

  await batch.commit();
  return true;
}

export async function migrateGeneralQuotesToProfile(db: Firestore): Promise<boolean> {
  const snap = await getDocs(collection(db, QUOTES_ROOT));
  if (snap.empty) return false;

  const generalDocs = snap.docs.filter((d) => String(d.data().category ?? '').trim().toLowerCase() === 'general');
  if (generalDocs.length === 0) return false;

  const batch = writeBatch(db);
  const now = new Date().toISOString();
  generalDocs.forEach((d) => {
    batch.update(d.ref, { category: 'profile', updatedAt: now });
  });
  await batch.commit();
  return true;
}
