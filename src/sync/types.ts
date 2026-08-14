/** A record as it travels to and from the server. */
export interface SyncRecord {
  domain: string;
  id: string;
  fields: Record<string, unknown>;
}

/** A pending local change, queued in the outbox. */
export interface Mutation {
  domain: string;
  id: string;
  updatedAt: string;
  deleted: boolean;
  fields: Record<string, unknown>;
}

/** A change delivered by the server. */
export interface Change {
  domain: string;
  id: string;
  updatedAt: string;
  deleted: boolean;
  fields: Record<string, unknown>;
}

export type OutboxState = 'pending' | 'quarantined';

export interface OutboxItem {
  /** IndexedDB auto-increment key. */
  seq?: number;
  mutation: Mutation;
  state: OutboxState;
  attempts: number;
  lastError?: string;
  queuedAt: string;
}

export interface PushResult {
  id: string;
  status: 'applied' | 'stale' | 'rejected';
  reason?: string;
}
