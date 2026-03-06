import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../lib/firebase';
import { loadSettings, saveSettings } from '../lib/firestoreSettings';
import { type GlobalSettings, SettingsProvider } from '../state/settingsStore';
import { useSyncStatus } from '../context/SyncStatusContext';

type Props = { children: React.ReactNode };

export function FirestoreSettingsGate({ children }: Props) {
    const { user } = useAuth();
    const [initialSettings, setInitialSettings] = useState<GlobalSettings | null>(null);
    const didLogLoadRef = useRef(false);
    const { updateStatus } = useSyncStatus();

    useEffect(() => {
        if (!user || !db) {
            setInitialSettings(null);
            return;
        }
        loadSettings(db, user.uid).then((data) => {
            if (!didLogLoadRef.current) {
                didLogLoadRef.current = true;
                if (data) console.info('[Clastone] Loaded settings from Firestore');
            }
            if (data) setInitialSettings(data);
        });
    }, [user?.uid]);

    const onPersist = useCallback(
        (settings: GlobalSettings, pendingCount: number) => {
            if (!user || !db) return;
            updateStatus('settings', 'saving', { pendingCount });
            saveSettings(db, user.uid, settings)
                .then(() => updateStatus('settings', 'idle', { label: `Saved ${pendingCount} settings changes` }))
                .catch((err) => updateStatus('settings', 'error', { error: err.message }));
        },
        [user?.uid, updateStatus]
    );

    if (user && initialSettings === null) {
        // We don't block render for settings as much, 
        // but let's wait a bit to avoid layout jump if possible.
        // Actually, standard gate pattern is to block if user is logged in but data not yet ready.
    }

    return (
        <SettingsProvider
            initialSettings={initialSettings ?? undefined}
            onPersist={user && db ? onPersist : undefined}
        >
            {children}
        </SettingsProvider>
    );
}
