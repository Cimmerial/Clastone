import { doc, getDoc, type Firestore } from 'firebase/firestore';
import { throttledSetDoc } from './firebaseThrottler';
import type { GlobalSettings } from '../state/settingsStore';

export async function loadSettings(db: Firestore, uid: string): Promise<GlobalSettings | null> {
    const ref = doc(db, 'users', uid, 'config', 'global');
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    return snap.data() as GlobalSettings;
}

export async function saveSettings(db: Firestore, uid: string, settings: GlobalSettings) {
    const ref = doc(db, 'users', uid, 'config', 'global');
    await throttledSetDoc(ref, settings, { merge: true });
}
