import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  query,
  updateDoc,
  writeBatch,
  type Firestore,
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
  | 'settings'
  | 'general';

export type FirebaseQuote = {
  id: string;
  category: QuoteCategory;
  text: string;
  character: string;
  source: string;
  createdAt: string;
  updatedAt: string;
};

type LegacyQuote = {
  text: string;
  character: string;
  source: string;
};

type LegacyQuotesData = Record<string, LegacyQuote[]>;

const QUOTES_ROOT = 'globalQuotes';

function toQuoteCategory(value: string): QuoteCategory {
  const safe = value.trim().toLowerCase();
  if (
    safe === 'movies' ||
    safe === 'tv' ||
    safe === 'actors' ||
    safe === 'directors' ||
    safe === 'watchlist' ||
    safe === 'search' ||
    safe === 'profile' ||
    safe === 'settings' ||
    safe === 'general'
  ) {
    return safe;
  }
  return 'general';
}

export async function loadGlobalQuotes(db: Firestore): Promise<FirebaseQuote[]> {
  const snap = await getDocs(collection(db, QUOTES_ROOT));
  if (snap.empty) return [];
  return snap.docs
    .map((d) => {
      const data = d.data();
      return {
        id: d.id,
        category: toQuoteCategory(String(data.category ?? 'general')),
        text: String(data.text ?? ''),
        character: String(data.character ?? ''),
        source: String(data.source ?? ''),
        createdAt: String(data.createdAt ?? ''),
        updatedAt: String(data.updatedAt ?? ''),
      } satisfies FirebaseQuote;
    })
    .filter((q) => q.text.length > 0)
    .sort((a, b) => a.text.localeCompare(b.text));
}

export async function addGlobalQuote(
  db: Firestore,
  payload: Omit<FirebaseQuote, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<void> {
  const now = new Date().toISOString();
  await addDoc(collection(db, QUOTES_ROOT), {
    category: payload.category,
    text: payload.text.trim(),
    character: payload.character.trim(),
    source: payload.source.trim(),
    createdAt: now,
    updatedAt: now,
  });
}

export async function updateGlobalQuote(
  db: Firestore,
  quoteId: string,
  payload: Omit<FirebaseQuote, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<void> {
  await updateDoc(doc(db, QUOTES_ROOT, quoteId), {
    category: payload.category,
    text: payload.text.trim(),
    character: payload.character.trim(),
    source: payload.source.trim(),
    updatedAt: new Date().toISOString(),
  });
}

export async function deleteGlobalQuote(db: Firestore, quoteId: string): Promise<void> {
  await deleteDoc(doc(db, QUOTES_ROOT, quoteId));
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
