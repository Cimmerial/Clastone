import {
    setDoc,
    updateDoc,
    deleteDoc,
    writeBatch,
    type Firestore,
    type DocumentReference,
    type UpdateData,
    type WithFieldValue,
    type WriteBatch,
    type SetOptions
} from 'firebase/firestore';

export type RequestStatus = 'Queued' | 'Sent' | 'Error';

export interface ThrottledRequest {
    id: string;
    type: 'setDoc' | 'updateDoc' | 'deleteDoc' | 'writeBatch';
    path: string;
    status: RequestStatus;
    timestamp: number;
    resolve?: (value: void) => void;
    reject?: (error: any) => void;
    execute: () => Promise<void>;
    metadata?: any;
}

let requestLog: ThrottledRequest[] = [];
let queue: ThrottledRequest[] = [];
let isProcessing = false;
let isPaused = false;
let listeners: (() => void)[] = [];

function notifyListeners() {
    listeners.forEach(l => l());
}

export function subscribeToThrottler(listener: () => void) {
    listeners.push(listener);
    return () => {
        listeners = listeners.filter(l => l !== listener);
    };
}

export function getThrottlerState() {
    return {
        queue,
        requestLog,
        isPaused
    };
}

export function setThrottlerPaused(paused: boolean) {
    isPaused = paused;
    notifyListeners();
    if (!paused && !isProcessing && queue.length > 0) {
        processQueue();
    }
}

export function clearThrottlerLog() {
    requestLog = [];
    notifyListeners();
}

function generateId() {
    return Math.random().toString(36).substring(2, 9);
}

function addToLog(req: ThrottledRequest) {
    requestLog.unshift(req);
    if (requestLog.length > 200) {
        requestLog.pop();
    }
}

async function processQueue() {
    if (isProcessing || isPaused || queue.length === 0) return;

    isProcessing = true;
    notifyListeners();

    while (queue.length > 0 && !isPaused) {
        const req = queue[0];
        try {
            await req.execute();
            req.status = 'Sent';
            req.resolve?.();
        } catch (e) {
            console.error('[FirebaseThrottler] Error executing request', e);
            req.status = 'Error';
            req.reject?.(e);
        }

        // Remove from queue after attempting
        queue.shift();
        notifyListeners();

        // Wait 1 second before processing the next request
        if (queue.length > 0 && !isPaused) {
            await new Promise(r => setTimeout(r, 1000));
        }
    }

    isProcessing = false;
    notifyListeners();
}

function enqueueRequest(
    type: ThrottledRequest['type'],
    path: string,
    execute: () => Promise<void>,
    metadata?: any
): Promise<void> {
    return new Promise((resolve, reject) => {
        const req: ThrottledRequest = {
            id: generateId(),
            type,
            path,
            status: 'Queued',
            timestamp: Date.now(),
            resolve,
            reject,
            execute,
            metadata
        };

        queue.push(req);
        addToLog(req);
        notifyListeners();

        if (!isProcessing && !isPaused) {
            processQueue();
        }
    });
}

// Wrappers

export function throttledSetDoc<T = DocumentData>(
    reference: DocumentReference<T>,
    data: WithFieldValue<T>,
    options?: SetOptions
): Promise<void> {
    return enqueueRequest('setDoc', reference.path, () => {
        if (options) {
            return setDoc(reference, data, options);
        }
        return setDoc(reference, data);
    });
}

export function throttledUpdateDoc<T = DocumentData>(
    reference: DocumentReference<T>,
    data: UpdateData<T>
): Promise<void> {
    return enqueueRequest('updateDoc', reference.path, () => updateDoc(reference, data as any));
}

export function throttledDeleteDoc<T = DocumentData>(
    reference: DocumentReference<T>
): Promise<void> {
    return enqueueRequest('deleteDoc', reference.path, () => deleteDoc(reference));
}

type DocumentData = { [field: string]: any };

// We need to return an object that quacks like WriteBatch but queues the commit
export function throttledWriteBatch(db: Firestore, metadata?: any): WriteBatch {
    const actualBatch = writeBatch(db);
    let operationCount = 0;

    return {
        set(documentRef: DocumentReference<any>, data: any, options?: any) {
            if (options) {
                actualBatch.set(documentRef, data, options);
            } else {
                actualBatch.set(documentRef, data);
            }
            operationCount++;
            return this;
        },
        update(documentRef: DocumentReference<any>, data: any, ...rest: any[]) {
            if (rest.length > 0) {
                // Handle field/value pairs (not commonly used in this codebase but good to have)
                (actualBatch.update as any)(documentRef, data, ...rest);
            } else {
                actualBatch.update(documentRef, data);
            }
            operationCount++;
            return this;
        },
        delete(documentRef: DocumentReference<any>) {
            actualBatch.delete(documentRef);
            operationCount++;
            return this;
        },
        commit(): Promise<void> {
            if (operationCount === 0) return Promise.resolve();

            return enqueueRequest('writeBatch', `Batch (${operationCount} ops)`, () => actualBatch.commit(), metadata);
        }
    };
}
