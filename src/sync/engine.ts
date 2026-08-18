import { getCursor, setCursor, isPaired, resetCursor, resetCursorIfDomainsChanged } from './config';
import { pushMutations, pullChanges } from './client';
import {
  listPending, ack, quarantine, recordAttempt, countPending, enqueue,
} from './outbox';
import { applyChanges, KNOWN_DOMAINS } from './apply';
import { shredStore, STORE_KEYS } from './shred';

export type SyncState = 'unpaired' | 'idle' | 'syncing' | 'error';

export interface SyncStatus {
  state: SyncState;
  pending: number;
  lastSyncedAt: string | null;
  lastError: string | null;
}

const MAX_ATTEMPTS = 6;
const MAX_PULL_PAGES = 50;
/**
 * The server rejects a push of more than 500 mutations. A first upload of a
 * real dataset is well past that, so pushes are chunked. Kept below the cap
 * with room to spare, since the server also limits the raw body size.
 */
const PUSH_BATCH_SIZE = 200;

let status: SyncStatus = { state: 'unpaired', pending: 0, lastSyncedAt: null, lastError: null };
let running = false;
const listeners = new Set<(status: SyncStatus) => void>();

const emit = (next: Partial<SyncStatus>): void => {
  status = { ...status, ...next };
  for (const listener of listeners) listener(status);
};

export const getStatus = (): SyncStatus => status;

export const subscribeStatus = (listener: (status: SyncStatus) => void): (() => void) => {
  listeners.add(listener);
  listener(status);
  return () => {
    listeners.delete(listener);
  };
};

/**
 * Queue every record currently in local storage for upload. Used once, when a
 * device that already holds data is paired. Idempotent: the outbox keeps one
 * pending mutation per record, so running it twice queues each record once.
 */
export const queueFullUpload = async (): Promise<void> => {
  const updatedAt = new Date().toISOString();

  for (const key of STORE_KEYS) {
    const raw = localStorage.getItem(key);
    if (raw === null) continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      continue;
    }

    for (const record of shredStore(key, parsed)) {
      await enqueue({
        domain: record.domain, id: record.id, updatedAt, deleted: false, fields: record.fields,
      });
    }
  }

  emit({ pending: await countPending() });
};

/**
 * Push everything queued, then pull everything new. Safe to call at any time:
 * concurrent calls collapse into one, and a failure leaves the outbox intact.
 */
export const syncNow = async (): Promise<void> => {
  if (running) return;
  if (!isPaired()) {
    emit({ state: 'unpaired', pending: await countPending() });
    return;
  }

  running = true;
  emit({ state: 'syncing', lastError: null });

  // If this build understands domains an earlier one didn't, re-pull from zero:
  // changes for an unknown domain were dropped while the cursor advanced past
  // them, so they are otherwise lost to this device forever.
  if (resetCursorIfDomainsChanged(KNOWN_DOMAINS)) {
    console.info('[sync] new record types available — re-pulling full history');
  }

  try {
    const pending = await listPending();
    for (let offset = 0; offset < pending.length; offset += PUSH_BATCH_SIZE) {
      const batch = pending.slice(offset, offset + PUSH_BATCH_SIZE);
      const results = await pushMutations(batch.map((item) => item.mutation));
      const byId = new Map(batch.map((item) => [item.mutation.id, item]));
      const done: number[] = [];

      for (const result of results) {
        const item = byId.get(result.id);
        if (item?.seq === undefined) continue;

        if (result.status === 'applied' || result.status === 'stale') {
          done.push(item.seq);
        } else {
          // A rejected payload cannot succeed on retry: hold it for review.
          await quarantine(item.seq, result.reason ?? 'Rejected by server');
        }
      }
      // Ack each batch as it lands, so a later failure does not undo progress.
      await ack(done);
      emit({ pending: await countPending() });
    }

    let cursor = getCursor();
    for (let page = 0; page < MAX_PULL_PAGES; page += 1) {
      const result = await pullChanges(cursor);
      if (result.changes.length) await applyChanges(result.changes);
      cursor = result.revision;
      setCursor(cursor);
      if (!result.hasMore) break;
    }

    emit({
      state: 'idle',
      pending: await countPending(),
      lastSyncedAt: new Date().toISOString(),
      lastError: null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    // Count the attempt against each pending item, and give up on any that has
    // failed too often rather than retrying forever.
    for (const item of await listPending()) {
      if (item.seq === undefined) continue;
      await recordAttempt(item.seq, message);
      if (item.attempts + 1 >= MAX_ATTEMPTS) {
        await quarantine(item.seq, `Failed ${MAX_ATTEMPTS} times: ${message}`);
      }
    }

    emit({ state: 'error', pending: await countPending(), lastError: message });
  } finally {
    running = false;
  }
};

/**
 * Forget the cursor and pull the whole history again. Applying a change is
 * idempotent, so this is always safe — it costs bandwidth, never correctness.
 * The manual escape hatch for when a device looks out of step.
 */
export const forceFullResync = async (): Promise<void> => {
  resetCursor();
  await syncNow();
};

/** Sync on load, on reconnect, on tab focus, and every five minutes. */
export const startAutoSync = (): (() => void) => {
  const trigger = () => { void syncNow(); };

  trigger();
  window.addEventListener('online', trigger);
  window.addEventListener('focus', trigger);
  const interval = window.setInterval(trigger, 5 * 60 * 1000);

  return () => {
    window.removeEventListener('online', trigger);
    window.removeEventListener('focus', trigger);
    window.clearInterval(interval);
  };
};
