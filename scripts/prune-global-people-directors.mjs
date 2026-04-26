import { initializeApp, applicationDefault, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';

function initAdminApp() {
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;

  if (serviceAccountJson && serviceAccountJson.trim().length > 0) {
    const parsed = JSON.parse(serviceAccountJson);
    initializeApp({ credential: cert(parsed) });
    return;
  }

  if (serviceAccountPath && serviceAccountPath.trim().length > 0) {
    const raw = readFileSync(serviceAccountPath, 'utf8');
    const parsed = JSON.parse(raw);
    initializeApp({ credential: cert(parsed) });
    return;
  }

  // Fallback to GOOGLE_APPLICATION_CREDENTIALS
  initializeApp({ credential: applicationDefault() });
}

function prunePeopleItem(item) {
  const roles = Array.isArray(item?.roles) ? item.roles.slice(0, 12).map((r) => ({
    id: r?.id ?? 0,
    title: r?.title ?? '',
    mediaType: r?.mediaType === 'tv' ? 'tv' : 'movie',
    character: typeof r?.character === 'string' ? r.character : undefined,
    popularity: Number.isFinite(r?.popularity) ? r.popularity : 0,
  })) : [];

  const biography = typeof item?.biography === 'string'
    ? (item.biography.length > 120 ? `${item.biography.slice(0, 120)}...` : item.biography)
    : undefined;

  return {
    ...item,
    roles,
    moviesSeen: [],
    showsSeen: [],
    firstSeenDate: undefined,
    lastSeenDate: undefined,
    biography,
  };
}

function pruneDirectorItem(item) {
  const roles = Array.isArray(item?.roles) ? item.roles.slice(0, 12).map((r) => ({
    id: r?.id ?? 0,
    title: r?.title ?? '',
    mediaType: r?.mediaType === 'tv' ? 'tv' : 'movie',
    job: typeof r?.job === 'string' ? r.job : undefined,
    popularity: Number.isFinite(r?.popularity) ? r.popularity : 0,
  })) : [];

  const biography = typeof item?.biography === 'string'
    ? (item.biography.length > 120 ? `${item.biography.slice(0, 120)}...` : item.biography)
    : undefined;

  return {
    ...item,
    roles,
    moviesSeen: [],
    showsSeen: [],
    firstSeenDate: undefined,
    lastSeenDate: undefined,
    biography,
  };
}

async function pruneCollectionForUser(db, userId, subcollectionName, pruneItem) {
  const colRef = db.collection('users').doc(userId).collection(subcollectionName);
  const snap = await colRef.get();
  let classDocsScanned = 0;
  let classDocsUpdated = 0;
  let itemsPruned = 0;

  const writes = [];
  for (const docSnap of snap.docs) {
    if (!docSnap.id.startsWith('class_')) continue;
    classDocsScanned += 1;
    const rawItems = Array.isArray(docSnap.get('items')) ? docSnap.get('items') : [];
    const prunedItems = rawItems.map(pruneItem);

    if (JSON.stringify(rawItems) === JSON.stringify(prunedItems)) continue;
    writes.push(docSnap.ref.set({ items: prunedItems }, { merge: true }));
    classDocsUpdated += 1;
    itemsPruned += prunedItems.length;
  }

  await Promise.all(writes);
  return { classDocsScanned, classDocsUpdated, itemsPruned };
}

async function main() {
  initAdminApp();
  const db = getFirestore();

  const usersSnap = await db.collection('users').get();
  const totals = {
    usersScanned: usersSnap.size,
    usersUpdated: 0,
    peopleClassDocsUpdated: 0,
    directorsClassDocsUpdated: 0,
    itemsPruned: 0,
  };

  for (const userDoc of usersSnap.docs) {
    const userId = userDoc.id;
    const peopleResult = await pruneCollectionForUser(db, userId, 'peopleData', prunePeopleItem);
    const directorsResult = await pruneCollectionForUser(db, userId, 'directorsData', pruneDirectorItem);
    const changed = peopleResult.classDocsUpdated > 0 || directorsResult.classDocsUpdated > 0;

    if (changed) totals.usersUpdated += 1;
    totals.peopleClassDocsUpdated += peopleResult.classDocsUpdated;
    totals.directorsClassDocsUpdated += directorsResult.classDocsUpdated;
    totals.itemsPruned += peopleResult.itemsPruned + directorsResult.itemsPruned;

    if (changed) {
      console.log(
        `[prune] ${userId}: people docs ${peopleResult.classDocsUpdated}, directors docs ${directorsResult.classDocsUpdated}`
      );
    }
  }

  console.log('\nPrune complete.');
  console.log(JSON.stringify(totals, null, 2));
}

main().catch((error) => {
  console.error('Global prune failed:', error);
  process.exit(1);
});
