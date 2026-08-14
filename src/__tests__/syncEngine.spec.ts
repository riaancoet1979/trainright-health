import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { syncNow, getStatus, subscribeStatus, queueFullUpload } from '../sync/engine';
import { enqueue, listPending, listQuarantined, clearOutbox } from '../sync/outbox';
import { setDeviceToken, clearDeviceToken, getCursor } from '../sync/config';
import { getCustomFoods } from '../utils/storage';
import type { Mutation } from '../sync/types';

const mutation = (id: string): Mutation => ({
  domain: 'achievement', id, updatedAt: '2026-08-14T12:00:00.000Z',
  deleted: false, fields: { name: 'x', date: '2026-08-14' },
});

const jsonResponse = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json' },
  }));

const routed = (pushBody: unknown, pullBody: unknown) =>
  vi.fn((url: unknown) => (
    String(url).includes('/push') ? jsonResponse(pushBody) : jsonResponse(pullBody)
  ));

describe('sync engine', () => {
  beforeEach(async () => {
    localStorage.clear();
    await clearOutbox();
    clearDeviceToken();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('does nothing while unpaired', async () => {
    await enqueue(mutation('a'));
    await syncNow();
    expect(await listPending()).toHaveLength(1);
    expect(getStatus().state).toBe('unpaired');
  });

  it('pushes pending items and clears them on success', async () => {
    setDeviceToken('tok_1');
    await enqueue(mutation('a'));
    vi.stubGlobal('fetch', routed(
      { revision: 1, results: [{ id: 'a', status: 'applied' }] },
      { revision: 1, hasMore: false, changes: [] },
    ));

    await syncNow();
    expect(await listPending()).toEqual([]);
    expect(getStatus().state).toBe('idle');
  });

  it('clears an item the server reports as stale', async () => {
    setDeviceToken('tok_1');
    await enqueue(mutation('a'));
    vi.stubGlobal('fetch', routed(
      { revision: 1, results: [{ id: 'a', status: 'stale' }] },
      { revision: 1, hasMore: false, changes: [] },
    ));

    await syncNow();
    expect(await listPending()).toEqual([]);
  });

  it('quarantines a rejected item instead of retrying forever', async () => {
    setDeviceToken('tok_1');
    await enqueue(mutation('a'));
    vi.stubGlobal('fetch', routed(
      { revision: 1, results: [{ id: 'a', status: 'rejected', reason: 'Unknown field "x"' }] },
      { revision: 1, hasMore: false, changes: [] },
    ));

    await syncNow();
    expect(await listPending()).toEqual([]);
    const held = await listQuarantined();
    expect(held).toHaveLength(1);
    expect(held[0].lastError).toContain('Unknown field');
  });

  it('advances the cursor after a pull', async () => {
    setDeviceToken('tok_1');
    vi.stubGlobal('fetch', vi.fn(() => jsonResponse({ revision: 42, hasMore: false, changes: [] })));
    await syncNow();
    expect(getCursor()).toBe(42);
  });

  it('applies pulled changes into local storage', async () => {
    setDeviceToken('tok_1');
    vi.stubGlobal('fetch', vi.fn(() => jsonResponse({
      revision: 5, hasMore: false,
      changes: [{
        domain: 'custom_food', id: 'c1', updatedAt: '2026-08-14T12:00:00.000Z',
        deleted: false, fields: { name: 'Bacon', calories: 520, protein: 37, carbs: 0, fats: 42 },
      }],
    })));

    await syncNow();
    expect(getCustomFoods().map((f) => f.name)).toContain('Bacon');
  });

  it('does not re-queue what it just pulled', async () => {
    setDeviceToken('tok_1');
    vi.stubGlobal('fetch', vi.fn(() => jsonResponse({
      revision: 5, hasMore: false,
      changes: [{
        domain: 'custom_food', id: 'c1', updatedAt: '2026-08-14T12:00:00.000Z',
        deleted: false, fields: { name: 'Bacon', calories: 520, protein: 37, carbs: 0, fats: 42 },
      }],
    })));

    await syncNow();
    expect(await listPending()).toEqual([]);
  });

  it('follows pagination until hasMore is false', async () => {
    setDeviceToken('tok_1');
    let call = 0;
    vi.stubGlobal('fetch', vi.fn(() => {
      call += 1;
      return jsonResponse(call === 1
        ? { revision: 10, hasMore: true, changes: [] }
        : { revision: 20, hasMore: false, changes: [] });
    }));

    await syncNow();
    expect(getCursor()).toBe(20);
  });

  it('records an error status and keeps items when the network fails', async () => {
    setDeviceToken('tok_1');
    await enqueue(mutation('a'));
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));

    await syncNow();
    expect(await listPending()).toHaveLength(1);
    expect(getStatus().state).toBe('error');
    expect(getStatus().lastError).toBe('offline');
  });

  it('quarantines an item that keeps failing', async () => {
    setDeviceToken('tok_1');
    await enqueue(mutation('a'));
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));

    for (let attempt = 0; attempt < 6; attempt += 1) await syncNow();

    expect(await listPending()).toEqual([]);
    const held = await listQuarantined();
    expect(held).toHaveLength(1);
    expect(held[0].lastError).toMatch(/Failed 6 times/);
  });

  it('notifies subscribers as status changes', async () => {
    setDeviceToken('tok_1');
    vi.stubGlobal('fetch', vi.fn(() => jsonResponse({ revision: 1, hasMore: false, changes: [] })));
    const seen: string[] = [];
    const unsubscribe = subscribeStatus((next) => seen.push(next.state));
    await syncNow();
    unsubscribe();
    expect(seen).toContain('syncing');
    expect(seen).toContain('idle');
  });

  it('does not run two syncs concurrently', async () => {
    setDeviceToken('tok_1');
    const fetchMock = vi.fn(() => jsonResponse({ revision: 1, hasMore: false, changes: [] }));
    vi.stubGlobal('fetch', fetchMock);
    await Promise.all([syncNow(), syncNow()]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('queueFullUpload', () => {
  beforeEach(async () => {
    localStorage.clear();
    await clearOutbox();
    clearDeviceToken();
  });

  it('queues nothing when there is no local data', async () => {
    await queueFullUpload();
    expect(await listPending()).toEqual([]);
  });

  it('queues every existing record', async () => {
    localStorage.setItem('nutrition_tracker_custom_foods', JSON.stringify([
      { id: 'c1', name: 'Bacon', calories: 520, protein: 37, carbs: 0, fats: 42 },
      { id: 'c2', name: 'Eggs', calories: 140, protein: 12, carbs: 1, fats: 10 },
    ]));

    await queueFullUpload();
    const pending = await listPending();
    expect(pending.map((i) => i.mutation.id).sort()).toEqual(['c1', 'c2']);
    expect(pending.every((i) => i.mutation.deleted === false)).toBe(true);
  });

  it('is idempotent - running twice queues each record once', async () => {
    localStorage.setItem('nutrition_tracker_custom_foods', JSON.stringify([
      { id: 'c1', name: 'Bacon', calories: 520, protein: 37, carbs: 0, fats: 42 },
    ]));

    await queueFullUpload();
    await queueFullUpload();
    expect(await listPending()).toHaveLength(1);
  });

  it('skips a store whose contents are corrupt', async () => {
    localStorage.setItem('nutrition_tracker_custom_foods', '{not json');
    await expect(queueFullUpload()).resolves.not.toThrow();
    expect(await listPending()).toEqual([]);
  });
});
