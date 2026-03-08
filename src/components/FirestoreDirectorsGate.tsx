import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../lib/firebase';
import { DirectorsProvider, DirectorsClassDef, DirectorItem } from '../state/directorsStore';
import { useSyncStatus } from '../context/SyncStatusContext';
import { loadDirectors, saveDirectors } from '../lib/firestoreDirectors';

export function FirestoreDirectorsGate({ children }: { children: React.ReactNode }) {
    const { user } = useAuth();
    const { updateStatus, updateMigrationStatus } = useSyncStatus();
    const [initialData, setInitialData] = useState<{ byClass: Record<string, DirectorItem[]>; classes: DirectorsClassDef[] } | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!user || !db) {
            setLoading(false);
            return;
        }

        async function fetchInitial() {
            try {
                const { byClass, classes, isMigrated } = await loadDirectors(db!, user!.uid);
                setInitialData({ byClass, classes });
                updateMigrationStatus('directors', isMigrated);
                updateStatus('directors', 'idle', { isMigrated });
            } catch (err) {
                console.error('[Clastone] Directors load error', err);
                updateStatus('directors', 'error', { error: String(err) });
            } finally {
                setLoading(false);
            }
        }
        fetchInitial();
    }, [user, updateMigrationStatus, updateStatus]);

    const handlePersist = async (payload: {
        byClass: Record<string, DirectorItem[]>;
        classes: DirectorsClassDef[];
        pendingCount?: number;
        dirtyClasses?: string[];
        classesMetadataChanged?: boolean;
    }) => {
        if (!user || !db) return;
        updateStatus('directors', 'saving', { pendingCount: payload.pendingCount });
        try {
            await saveDirectors(db, user.uid, payload);
            updateStatus('directors', 'idle', { isMigrated: true });
        } catch (err) {
            console.error('[Clastone] Directors persist error', err);
            updateStatus('directors', 'error', { error: String(err) });
        }
    };

    if (loading) {
        return <div className="app-loading"><p>Loading directors…</p></div>;
    }

    return (
        <DirectorsProvider
            initialByClass={initialData?.byClass}
            initialClasses={initialData?.classes}
            onPersist={handlePersist}
        >
            {children}
        </DirectorsProvider>
    );
}
