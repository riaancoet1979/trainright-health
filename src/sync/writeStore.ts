import { shredStore, STORE_KEYS } from './shred';
import { enqueue } from './outbox';
import type { Mutation, SyncRecord } from './types';

const TRACKED = new Set<string>(STORE_KEYS);

/**
 * While applying changes pulled from the server we must not re-enqueue them,
 * or every pull would bounce straight back out as a push.
 */
let suppressCapture = false;

export const setSuppressCapture = (value: boolean): void => {
  suppressCapture = value;
};

const readCurrent = (key: string): unknown => {
  const raw = localStorage.getItem(key);
  if (raw === null) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
};

const index = (records: SyncRecord[]): Map<string, SyncRecord> => {
  const map = new Map<string, SyncRecord>();
  for (const record of records) map.set(`${record.domain}:${record.id}`, record);
  return map;
};

const diff = (before: SyncRecord[], after: SyncRecord[], updatedAt: string): Mutation[] => {
  const previous = index(before);
  const next = index(after);
  const mutations: Mutation[] = [];

  for (const [key, record] of next) {
    const old = previous.get(key);
    if (old && JSON.stringify(old.fields) === JSON.stringify(record.fields)) continue;
    mutations.push({
      domain: record.domain, id: record.id, updatedAt, deleted: false, fields: record.fields,
    });
  }

  for (const [key, record] of previous) {
    if (next.has(key)) continue;
    mutations.push({
      domain: record.domain, id: record.id, updatedAt, deleted: true, fields: {},
    });
  }

  return mutations;
};

/**
 * The single gateway for writing a tracked store. Persists to localStorage and
 * queues the difference for sync. Untracked keys are persisted only.
 *
 * The localStorage write happens before the first await, so callers keep their
 * existing synchronous read-after-write behaviour.
 */
export const writeStore = async (key: string, value: unknown): Promise<void> => {
  if (!TRACKED.has(key)) {
    localStorage.setItem(key, JSON.stringify(value));
    return;
  }

  const before = suppressCapture ? [] : shredStore(key, readCurrent(key));
  localStorage.setItem(key, JSON.stringify(value));
  if (suppressCapture) return;

  const after = shredStore(key, value);
  const updatedAt = new Date().toISOString();

  for (const mutation of diff(before, after, updatedAt)) {
    await enqueue(mutation);
  }
};

export const captureStoreDiff = async (key: string, beforeValue: unknown, afterValue: unknown): Promise<void> => {
  if (!TRACKED.has(key) || suppressCapture) return;
  const before = shredStore(key, beforeValue);
  const after = shredStore(key, afterValue);
  const updatedAt = new Date().toISOString();
  for (const mutation of diff(before, after, updatedAt)) {
    await enqueue(mutation);
  }
};

/** Removing a whole store tombstones every record that was in it. */
export const removeStore = async (key: string): Promise<void> => {
  if (!TRACKED.has(key)) {
    localStorage.removeItem(key);
    return;
  }

  const before = suppressCapture ? [] : shredStore(key, readCurrent(key));
  localStorage.removeItem(key);
  if (suppressCapture) return;

  const updatedAt = new Date().toISOString();
  for (const record of before) {
    await enqueue({ domain: record.domain, id: record.id, updatedAt, deleted: true, fields: {} });
  }
};
