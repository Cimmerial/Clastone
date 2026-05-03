import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  type Firestore,
} from 'firebase/firestore';
import { throttledSetDoc } from './firebaseThrottler';

export type SuperlativeEntryType = 'movie' | 'tv' | 'person';

export type ProfileSuperlativeEntry = {
  entryType: SuperlativeEntryType;
  entryId: string;
  title: string;
  posterPath?: string;
  releaseDate?: string;
  subtitle?: string;
  tmdbId?: number;
};

export type ProfileSuperlativeSlot = {
  slotId: string;
  superlativeId: string;
  entry: ProfileSuperlativeEntry;
  updatedAt: string;
};

export type GlobalSuperlativeDefinition = {
  id: string;
  label: string;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  isActive: boolean;
};

const GLOBAL_SUPERLATIVES_COLLECTION = 'globalSuperlatives';
const MAX_SUPERLATIVE_SLOTS = 8;

function nowIso(): string {
  return new Date().toISOString();
}

function makeSlotId(): string {
  return `slot_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

function stripUndefined<T>(value: T): T {
  if (value === undefined) return value;
  if (Array.isArray(value)) {
    return value.filter((item) => item !== undefined).map((item) => stripUndefined(item)) as T;
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (v !== undefined) out[k] = stripUndefined(v);
    }
    return out as T;
  }
  return value;
}

function toNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function toOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function normalizeEntry(value: unknown): ProfileSuperlativeEntry | null {
  if (!value || typeof value !== 'object') return null;
  const obj = value as Record<string, unknown>;
  const entryType = obj.entryType;
  if (entryType !== 'movie' && entryType !== 'tv' && entryType !== 'person') return null;
  const entryId = toNonEmptyString(obj.entryId);
  const title = toNonEmptyString(obj.title);
  if (!entryId || !title) return null;

  const tmdbIdRaw = obj.tmdbId;
  const tmdbId =
    typeof tmdbIdRaw === 'number' && Number.isFinite(tmdbIdRaw)
      ? tmdbIdRaw
      : typeof tmdbIdRaw === 'string' && /^\d+$/.test(tmdbIdRaw)
        ? Number(tmdbIdRaw)
        : undefined;

  return {
    entryType,
    entryId,
    title,
    posterPath: toOptionalString(obj.posterPath),
    releaseDate: toOptionalString(obj.releaseDate),
    subtitle: toOptionalString(obj.subtitle),
    tmdbId,
  };
}

export function normalizeProfileSuperlativeSlots(value: unknown): ProfileSuperlativeSlot[] {
  if (!Array.isArray(value)) return [];
  const normalized: ProfileSuperlativeSlot[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue;
    const item = raw as Record<string, unknown>;
    const superlativeId = toNonEmptyString(item.superlativeId);
    const entry = normalizeEntry(item.entry);
    if (!superlativeId || !entry) continue;
    normalized.push({
      slotId: toNonEmptyString(item.slotId) ?? makeSlotId(),
      superlativeId,
      entry,
      updatedAt: toNonEmptyString(item.updatedAt) ?? nowIso(),
    });
    if (normalized.length >= MAX_SUPERLATIVE_SLOTS) break;
  }
  return normalized;
}

export function normalizeGlobalSuperlativeDefinition(
  id: string,
  value: unknown
): GlobalSuperlativeDefinition | null {
  if (!value || typeof value !== 'object') return null;
  const obj = value as Record<string, unknown>;
  const label = toNonEmptyString(obj.label);
  if (!label) return null;
  return {
    id,
    label,
    createdAt: toNonEmptyString(obj.createdAt) ?? nowIso(),
    updatedAt: toNonEmptyString(obj.updatedAt) ?? nowIso(),
    createdBy: toOptionalString(obj.createdBy),
    isActive: obj.isActive !== false,
  };
}

export function clampSuperlativeSlots(slots: ProfileSuperlativeSlot[]): ProfileSuperlativeSlot[] {
  return normalizeProfileSuperlativeSlots(slots).slice(0, MAX_SUPERLATIVE_SLOTS);
}

export async function loadGlobalSuperlatives(db: Firestore): Promise<GlobalSuperlativeDefinition[]> {
  const ref = collection(db, GLOBAL_SUPERLATIVES_COLLECTION);
  const snap = await getDocs(query(ref, orderBy('label', 'asc')));
  return snap.docs
    .map((d) => normalizeGlobalSuperlativeDefinition(d.id, d.data()))
    .filter((item): item is GlobalSuperlativeDefinition => Boolean(item))
    .filter((item) => item.isActive);
}

export async function createGlobalSuperlative(
  db: Firestore,
  params: { label: string; createdBy?: string }
): Promise<GlobalSuperlativeDefinition> {
  const label = params.label.trim();
  if (!label) throw new Error('Superlative label is required.');
  const id = `sup_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const ts = nowIso();
  const payload: GlobalSuperlativeDefinition = {
    id,
    label,
    createdAt: ts,
    updatedAt: ts,
    createdBy: params.createdBy,
    isActive: true,
  };
  const ref = doc(db, GLOBAL_SUPERLATIVES_COLLECTION, id);
  await throttledSetDoc(ref, stripUndefined(payload));
  return payload;
}

export async function deleteGlobalSuperlative(db: Firestore, superlativeId: string): Promise<void> {
  const id = superlativeId.trim();
  if (!id) return;
  await deleteDoc(doc(db, GLOBAL_SUPERLATIVES_COLLECTION, id));
}

export async function loadUserSuperlativeSlots(db: Firestore, uid: string): Promise<ProfileSuperlativeSlot[]> {
  const userRef = doc(db, 'users', uid);
  const snap = await getDoc(userRef);
  if (!snap.exists()) return [];
  return normalizeProfileSuperlativeSlots((snap.data() as Record<string, unknown>).superlativeSlots);
}

export async function saveUserSuperlativeSlots(
  db: Firestore,
  uid: string,
  slots: ProfileSuperlativeSlot[]
): Promise<ProfileSuperlativeSlot[]> {
  const clamped = clampSuperlativeSlots(slots).map((slot) => ({
    ...slot,
    updatedAt: slot.updatedAt || nowIso(),
  }));
  const userRef = doc(db, 'users', uid);
  await throttledSetDoc(
    userRef,
    stripUndefined({
      superlativeSlots: clamped,
    }),
    { merge: true }
  );
  return clamped;
}
