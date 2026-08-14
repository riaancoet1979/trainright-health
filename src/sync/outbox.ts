import type { Mutation, OutboxItem } from './types';

const DB_NAME = 'trainright-sync';
const DB_VERSION = 1;
const STORE = 'outbox';

let dbPromise: Promise<IDBDatabase> | null = null;

const openDb = (): Promise<IDBDatabase> => {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'seq', autoIncrement: true });
        store.createIndex('state', 'state', { unique: false });
        // One pending item per record: repeated edits collapse onto it.
        store.createIndex('recordKey', 'recordKey', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
};

const tx = async <T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> => {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(STORE, mode);
    const request = run(transaction.objectStore(STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

interface StoredItem extends OutboxItem {
  recordKey: string;
}

const keyOf = (mutation: Mutation): string => `${mutation.domain}:${mutation.id}`;

const allItems = (): Promise<StoredItem[]> =>
  tx('readonly', (store) => store.getAll() as IDBRequest<StoredItem[]>);

/**
 * Append a mutation. If a pending mutation for the same record already exists,
 * it is replaced — the newest state of a record is the only one worth sending,
 * and a notes field firing a write per keystroke would otherwise flood the
 * queue. This is also what makes a repeated full upload idempotent.
 */
export const enqueue = async (mutation: Mutation): Promise<void> => {
  const existing = (await allItems()).find(
    (item) => item.state === 'pending' && item.recordKey === keyOf(mutation),
  );

  const item: StoredItem = {
    ...(existing?.seq !== undefined ? { seq: existing.seq } : {}),
    recordKey: keyOf(mutation),
    mutation,
    state: 'pending',
    attempts: 0,
    queuedAt: new Date().toISOString(),
  };

  await tx('readwrite', (store) => store.put(item));
};

const bySeq = (a: OutboxItem, b: OutboxItem): number => (a.seq ?? 0) - (b.seq ?? 0);

export const listPending = async (): Promise<OutboxItem[]> =>
  (await allItems()).filter((item) => item.state === 'pending').sort(bySeq);

export const listQuarantined = async (): Promise<OutboxItem[]> =>
  (await allItems()).filter((item) => item.state === 'quarantined').sort(bySeq);

export const countPending = async (): Promise<number> => (await listPending()).length;

export const ack = async (seqs: number[]): Promise<void> => {
  for (const seq of seqs) {
    await tx('readwrite', (store) => store.delete(seq));
  }
};

export const recordAttempt = async (seq: number, error: string): Promise<void> => {
  const item = await tx('readonly', (store) => store.get(seq) as IDBRequest<StoredItem | undefined>);
  if (!item) return;
  await tx('readwrite', (store) => store.put({ ...item, attempts: item.attempts + 1, lastError: error }));
};

export const quarantine = async (seq: number, reason: string): Promise<void> => {
  const item = await tx('readonly', (store) => store.get(seq) as IDBRequest<StoredItem | undefined>);
  if (!item) return;
  await tx('readwrite', (store) => store.put({ ...item, state: 'quarantined', lastError: reason }));
};

export const discardQuarantined = async (seq: number): Promise<void> => {
  await tx('readwrite', (store) => store.delete(seq));
};

/**
 * Return every quarantined item to the pending queue with its attempt count
 * reset. Needed when items were held for a reason that has since been fixed —
 * a client bug, or a server that was temporarily rejecting valid payloads.
 */
export const retryAllQuarantined = async (): Promise<number> => {
  const held = (await allItems()).filter((item) => item.state === 'quarantined');
  for (const item of held) {
    await tx('readwrite', (store) => store.put({
      ...item, state: 'pending' as const, attempts: 0, lastError: undefined,
    }));
  }
  return held.length;
};

export const clearOutbox = async (): Promise<void> => {
  await tx('readwrite', (store) => store.clear());
};
