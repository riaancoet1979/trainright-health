import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import {
  enqueue, listPending, ack, quarantine, listQuarantined,
  clearOutbox, countPending, recordAttempt, discardQuarantined, retryAllQuarantined,
} from '../sync/outbox';
import type { Mutation } from '../sync/types';

const mutation = (id: string): Mutation => ({
  domain: 'achievement', id, updatedAt: '2026-08-14T12:00:00.000Z',
  deleted: false, fields: { name: 'x', date: '2026-08-14' },
});

describe('outbox', () => {
  beforeEach(async () => { await clearOutbox(); });

  it('starts empty', async () => {
    expect(await listPending()).toEqual([]);
    expect(await countPending()).toBe(0);
  });

  it('enqueues and lists in insertion order', async () => {
    await enqueue(mutation('a'));
    await enqueue(mutation('b'));
    const pending = await listPending();
    expect(pending.map((i) => i.mutation.id)).toEqual(['a', 'b']);
    expect(pending[0].attempts).toBe(0);
    expect(pending[0].state).toBe('pending');
  });

  it('acks by seq, removing only those items', async () => {
    await enqueue(mutation('a'));
    await enqueue(mutation('b'));
    const [first] = await listPending();
    await ack([first.seq!]);
    expect((await listPending()).map((i) => i.mutation.id)).toEqual(['b']);
  });

  it('quarantines an item out of the pending list', async () => {
    await enqueue(mutation('a'));
    const [item] = await listPending();
    await quarantine(item.seq!, 'Unknown field "nonsense"');
    expect(await listPending()).toEqual([]);
    const held = await listQuarantined();
    expect(held).toHaveLength(1);
    expect(held[0].lastError).toContain('nonsense');
  });

  it('discards a quarantined item on request', async () => {
    await enqueue(mutation('a'));
    const [item] = await listPending();
    await quarantine(item.seq!, 'nope');
    await discardQuarantined(item.seq!);
    expect(await listQuarantined()).toEqual([]);
  });

  it('counts attempts against an item', async () => {
    await enqueue(mutation('a'));
    const [item] = await listPending();
    await recordAttempt(item.seq!, 'offline');
    await recordAttempt(item.seq!, 'offline');
    const [after] = await listPending();
    expect(after.attempts).toBe(2);
    expect(after.lastError).toBe('offline');
  });

  it('collapses repeated mutations of the same record to the latest', async () => {
    await enqueue({ ...mutation('a'), fields: { name: 'first', date: '2026-08-14' } });
    await enqueue({ ...mutation('a'), fields: { name: 'second', date: '2026-08-14' } });
    const pending = await listPending();
    expect(pending).toHaveLength(1);
    expect(pending[0].mutation.fields.name).toBe('second');
  });

  it('keeps mutations of different records separate', async () => {
    await enqueue(mutation('a'));
    await enqueue(mutation('b'));
    expect(await countPending()).toBe(2);
  });

  it('keeps same-id records in different domains separate', async () => {
    await enqueue(mutation('same'));
    await enqueue({ ...mutation('same'), domain: 'custom_food' });
    expect(await countPending()).toBe(2);
  });

  it('returns quarantined items to pending with attempts reset', async () => {
    await enqueue(mutation('a'));
    await enqueue(mutation('b'));
    for (const item of await listPending()) {
      await recordAttempt(item.seq!, 'boom');
      await quarantine(item.seq!, 'boom');
    }
    expect(await listPending()).toEqual([]);

    const moved = await retryAllQuarantined();
    expect(moved).toBe(2);

    const pending = await listPending();
    expect(pending).toHaveLength(2);
    expect(pending.every((i) => i.attempts === 0)).toBe(true);
    expect(pending.every((i) => i.lastError === undefined)).toBe(true);
    expect(await listQuarantined()).toEqual([]);
  });

  it('does not collapse onto a quarantined item', async () => {
    await enqueue(mutation('a'));
    const [item] = await listPending();
    await quarantine(item.seq!, 'nope');
    await enqueue(mutation('a'));
    expect(await countPending()).toBe(1);
    expect(await listQuarantined()).toHaveLength(1);
  });
});
