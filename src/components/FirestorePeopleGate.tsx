import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../lib/firebase';
import { PeopleProvider, PeopleClassDef, PersonItem } from '../state/peopleStore';
import { useSyncStatus } from '../context/SyncStatusContext';
import { loadPeople, savePeople } from '../lib/firestorePeople';

export function FirestorePeopleGate({ children }: { children: React.ReactNode }) {
    const { user } = useAuth();
    const { updateStatus, updateMigrationStatus } = useSyncStatus();
    const [initialData, setInitialData] = useState<{ byClass: Record<string, PersonItem[]>; classes: PeopleClassDef[] } | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!user || !db) {
            setLoading(false);
            return;
        }

        async function fetchInitial() {
            try {
                const { byClass, classes, isMigrated } = await loadPeople(db!, user!.uid);
                setInitialData({ byClass, classes });
                updateMigrationStatus('people', isMigrated);
                updateStatus('people', 'idle', { isMigrated });
            } catch (err) {
                console.error('[Clastone] People load error', err);
                updateStatus('people', 'error', { error: String(err) });
            } finally {
                setLoading(false);
            }
        }
        fetchInitial();
    }, [user, updateMigrationStatus, updateStatus]);

    const handlePersist = async (payload: {
        byClass: Record<string, PersonItem[]>;
        classes: PeopleClassDef[];
        pendingCount?: number;
        dirtyClasses?: string[];
        classesMetadataChanged?: boolean;
    }) => {
        if (!user || !db) return;
        updateStatus('people', 'saving', { pendingCount: payload.pendingCount });
        try {
            await savePeople(db, user.uid, payload);
            updateStatus('people', 'idle', { isMigrated: true });
        } catch (err) {
            console.error('[Clastone] People persist error', err);
            updateStatus('people', 'error', { error: String(err) });
        }
    };

    if (loading) {
        return <div className="app-loading"><p>Loading people…</p></div>;
    }

    return (
        <PeopleProvider
            initialByClass={initialData?.byClass}
            initialClasses={initialData?.classes}
            onPersist={handlePersist}
        >
            {children}
        </PeopleProvider>
    );
}
