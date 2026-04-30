import {
    doc,
    getDoc,
    collection,
    getDocs,
    type Firestore
} from 'firebase/firestore';
import { throttledSetDoc, throttledWriteBatch, throttledDeleteDoc } from './firebaseThrottler';
import type { DirectorItem, DirectorsClassDef } from '../state/directorsStore';
import { ONLY_UNRANKED_DIRECTOR_CLASS } from './classTemplates';

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
    const roles = (item.roles || []).slice(0, 12).map((r) => ({
        id: r.id,
        title: r.title,
        mediaType: r.mediaType,
        job: r.job,
        popularity: r.popularity ?? 0
    }));

    return {
        ...item,
        roles,
        movieMinutes: 0,
        showMinutes: 0,
        moviesSeen: [],
        showsSeen: [],
        firstSeenDate: undefined,
        lastSeenDate: undefined,
        biography: item.biography && item.biography.length > 500
            ? item.biography.slice(0, 120) + '...'
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
                const raw = d.data().classes as DirectorsClassDef[] | undefined;
                classes = raw && raw.length > 0 ? raw : ONLY_UNRANKED_DIRECTOR_CLASS;
            } else if (id.startsWith('class_')) {
                const classKey = id.replace('class_', '');
                byClass[classKey] = ((d.data().items || []) as DirectorItem[]).map((item) => ({
                    ...item,
                    roles: item.roles ?? [],
                    moviesSeen: [],
                    showsSeen: [],
                    movieMinutes: 0,
                    showMinutes: 0,
                    firstSeenDate: undefined,
                    lastSeenDate: undefined,
                }));
            }
        });

        for (const ck of classes.map((c) => c.key)) {
            if (!byClass[ck]) byClass[ck] = [];
        }

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

    return { byClass: { UNRANKED: [] }, classes: ONLY_UNRANKED_DIRECTOR_CLASS, isMigrated: true };
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

export async function pruneStoredDirectorsDataForUser(
    db: Firestore,
    userId: string
): Promise<{ classDocsScanned: number; classDocsUpdated: number; itemsPruned: number }> {
    const directorsCol = collection(db, NEW_ROOT, userId, PEOPLE_DATA_COLLECTION);
    const directorsSnap = await getDocs(directorsCol);
    if (directorsSnap.empty) {
        return { classDocsScanned: 0, classDocsUpdated: 0, itemsPruned: 0 };
    }

    const batch = throttledWriteBatch(db, { storeName: 'directors-prune', userId });
    let classDocsScanned = 0;
    let classDocsUpdated = 0;
    let itemsPruned = 0;

    directorsSnap.forEach((d) => {
        const id = d.id;
        if (!id.startsWith('class_')) return;
        classDocsScanned += 1;

        const rawItems = (d.data().items || []) as DirectorItem[];
        const prunedItems = rawItems.map(pruneItem);
        const changed = JSON.stringify(rawItems) !== JSON.stringify(prunedItems);
        if (!changed) return;

        const classRef = doc(db, NEW_ROOT, userId, PEOPLE_DATA_COLLECTION, id);
        batch.set(classRef, stripUndefined({ items: prunedItems }), { merge: true });
        classDocsUpdated += 1;
        itemsPruned += prunedItems.length;
    });

    if (classDocsUpdated > 0) {
        await batch.commit();
    }

    return { classDocsScanned, classDocsUpdated, itemsPruned };
}

export async function pruneStoredDirectorsDataForAllUsers(
    db: Firestore
): Promise<{ usersScanned: number; usersUpdated: number; classDocsUpdated: number; itemsPruned: number }> {
    const usersSnap = await getDocs(collection(db, 'users'));
    let usersUpdated = 0;
    let classDocsUpdated = 0;
    let itemsPruned = 0;

    for (const userDoc of usersSnap.docs) {
        const result = await pruneStoredDirectorsDataForUser(db, userDoc.id);
        if (result.classDocsUpdated > 0) {
            usersUpdated += 1;
            classDocsUpdated += result.classDocsUpdated;
            itemsPruned += result.itemsPruned;
        }
    }

    return {
        usersScanned: usersSnap.size,
        usersUpdated,
        classDocsUpdated,
        itemsPruned
    };
}
