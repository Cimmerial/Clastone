import {
    doc,
    getDoc,
    collection,
    getDocs,
    type Firestore
} from 'firebase/firestore';
import { throttledSetDoc, throttledWriteBatch, throttledDeleteDoc } from './firebaseThrottler';
import type { DirectorItem, DirectorsClassDef } from '../state/directorsStore';

const NEW_ROOT = 'users';
const PEOPLE_DATA_COLLECTION = 'directorsData';
const METADATA_DOC_ID = 'metadata';

const LEGACY_COLLECTION = 'users';
const LEGACY_SUBCOLLECTION = 'data';
const LEGACY_DOC_ID = 'directors';

/** Firestore does not allow undefined. Strip it from objects/arrays so setDoc succeeds. */
function stripUndefined<T>(value: T): T {
    if (value === undefined) return value;
    if (Array.isArray(value)) {
        return value
            .filter((item) => item !== undefined)
            .map((item) => stripUndefined(item)) as T;
    }
    if (value !== null && typeof value === 'object') {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(value)) {
            if (v !== undefined) {
                out[k] = stripUndefined(v);
            }
        }
        return out as T;
    }
    return value;
}

/** Prune large fields that can be re-fetched from TMDB to keep document under 1MB. */
export function pruneItem(item: DirectorItem): DirectorItem {
    const roles = item.roles || [];
    const seenMovieIds = new Set(item.moviesSeen);
    const seenShowIds = new Set(item.showsSeen);

    // 1. Separate seen and unseen roles
    const seenRoles = roles.filter(r => {
        const fullId = r.mediaType === 'movie' ? `tmdb-movie-${r.id}` : `tmdb-tv-${r.id}`;
        return seenMovieIds.has(fullId) || seenShowIds.has(fullId);
    });

    const unseenRoles = roles.filter(r => {
        const fullId = r.mediaType === 'movie' ? `tmdb-movie-${r.id}` : `tmdb-tv-${r.id}`;
        return !seenMovieIds.has(fullId) && !seenShowIds.has(fullId);
    });

    // 2. Combine: All seen roles + top remaining up to 30 total
    const limit = 30;
    const finalRoles = [...seenRoles];
    const remainingSpace = Math.max(0, limit - seenRoles.length);

    if (remainingSpace > 0) {
        finalRoles.push(...unseenRoles.slice(0, remainingSpace));
    }

    return {
        ...item,
        roles: finalRoles,
        biography: item.biography && item.biography.length > 500
            ? item.biography.slice(0, 500) + '...'
            : item.biography,
    };
}

export async function loadDirectors(db: Firestore, userId: string): Promise<{
    byClass: Record<string, DirectorItem[]>;
    classes: DirectorsClassDef[];
    isMigrated: boolean;
}> {
    // Try loading from the flat directorsData sub-collection
    const directorsCol = collection(db, NEW_ROOT, userId, PEOPLE_DATA_COLLECTION);
    const directorsSnap = await getDocs(directorsCol);

    if (!directorsSnap.empty) {
        let classes: DirectorsClassDef[] = [];
        const byClass: Record<string, DirectorItem[]> = {};

        directorsSnap.forEach((d) => {
            const id = d.id;
            if (id === METADATA_DOC_ID) {
                classes = (d.data().classes || []) as DirectorsClassDef[];
            } else if (id.startsWith('class_')) {
                const classKey = id.replace('class_', '');
                byClass[classKey] = (d.data().items || []) as DirectorItem[];
            }
        });

        return { byClass, classes, isMigrated: true };
    }

    // If new structure doesn't exist, check legacy
    const legacyRef = doc(db, LEGACY_COLLECTION, userId, LEGACY_SUBCOLLECTION, LEGACY_DOC_ID);
    const legacySnap = await getDoc(legacyRef);

    if (legacySnap.exists()) {
        console.info('[Clastone] Found legacy directors data, migration required.');
        const legacyData = legacySnap.data() as { byClass: Record<string, DirectorItem[]>; classes: DirectorsClassDef[] } | undefined;
        return {
            byClass: legacyData?.byClass || {},
            classes: legacyData?.classes || [],
            isMigrated: false
        };
    }

    return { byClass: {}, classes: [], isMigrated: true };
}

export async function saveDirectors(
    db: Firestore,
    userId: string,
    payload: {
        byClass: Record<string, DirectorItem[]>;
        classes: DirectorsClassDef[];
        dirtyClasses?: string[];
        classesMetadataChanged?: boolean;
    }
): Promise<void> {
    const batch = throttledWriteBatch(db, {
        storeName: 'directors',
        dirtyClasses: payload.dirtyClasses,
        metadataChanged: payload.classesMetadataChanged
    });

    // 1. Save metadata
    const metadataRef = doc(db, NEW_ROOT, userId, PEOPLE_DATA_COLLECTION, METADATA_DOC_ID);
    if (payload.classesMetadataChanged || !payload.dirtyClasses) {
        batch.set(metadataRef, stripUndefined({ classes: payload.classes }));
    }

    // 2. Save each class as a flat document
    const classesToSave = payload.dirtyClasses
        ? payload.classes.filter(c => payload.dirtyClasses!.includes(c.key))
        : payload.classes;

    for (const item of classesToSave) {
        const key = item.key;
        const classRef = doc(db, NEW_ROOT, userId, PEOPLE_DATA_COLLECTION, `class_${key}`);
        const items = (payload.byClass[key] || []).map(pruneItem);
        batch.set(classRef, stripUndefined({ items }));
    }

    // 3. Delete legacy document if it exists
    const legacyRef = doc(db, LEGACY_COLLECTION, userId, LEGACY_SUBCOLLECTION, LEGACY_DOC_ID);
    batch.delete(legacyRef);

    console.info('[Clastone] Saving directors to flat Firestore sub-collection', {
        uid: userId,
        classesSaved: classesToSave.length,
        dirtyClasses: payload.dirtyClasses
    });

    await batch.commit();
}
