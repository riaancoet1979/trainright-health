import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { syncNow, getStatus, subscribeStatus, queueFullUpload, forceFullResync } from '../sync/engine';
import { KNOWN_DOMAINS } from '../sync/apply';
import { enqueue, listPending, listQuarantined, clearOutbox } from '../sync/outbox';
import { setDeviceToken, clearDeviceToken, getCursor, setCursor } from '../sync/config';
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

  it('chunks a large first upload so the server batch cap is never exceeded', async () => {
    setDeviceToken('tok_1');
    // Reproduces the real failure: a first upload of 742 records was sent as one
    // request and rejected with "Send at most 500 mutations per request".
    for (let i = 0; i < 742; i += 1) await enqueue(mutation(`rec-${i}`));

    const bodies: number[] = [];
    vi.stubGlobal('fetch', vi.fn((url: unknown, init?: RequestInit) => {
      if (!String(url).includes('/push')) {
        return jsonResponse({ revision: 1, hasMore: false, changes: [] });
      }
      const body = JSON.parse(String(init!.body)) as { mutations: { id: string }[] };
      bodies.push(body.mutations.length);
      if (body.mutations.length > 500) return jsonResponse({ error: { code: 'batch_too_large' } }, 400);
      return jsonResponse({
        revision: 1,
        results: body.mutations.map((m) => ({ id: m.id, status: 'applied' })),
      });
    }));

    await syncNow();

    expect(bodies.length).toBeGreaterThan(1);
    expect(Math.max(...bodies)).toBeLessThanOrEqual(500);
    expect(bodies.reduce((a, b) => a + b, 0)).toBe(742);
    expect(await listPending()).toEqual([]);
  });

  it('keeps batches that already landed when a later batch fails', async () => {
    setDeviceToken('tok_1');
    for (let i = 0; i < 400; i += 1) await enqueue(mutation(`rec-${i}`));

    let pushCount = 0;
    vi.stubGlobal('fetch', vi.fn((url: unknown, init?: RequestInit) => {
      if (!String(url).includes('/push')) {
        return jsonResponse({ revision: 1, hasMore: false, changes: [] });
      }
      pushCount += 1;
      if (pushCount === 2) return Promise.reject(new Error('offline'));
      const body = JSON.parse(String(init!.body)) as { mutations: { id: string }[] };
      return jsonResponse({
        revision: 1,
        results: body.mutations.map((m) => ({ id: m.id, status: 'applied' })),
      });
    }));

    await syncNow();

    // The first batch was acked; only the rest remain queued for a later retry.
    const remaining = await listPending();
    expect(remaining.length).toBe(200);
    expect(getStatus().state).toBe('error');
  });

  it('re-pulls from zero when a build learns a domain it used to discard', async () => {
    // Exactly the phone's situation: an older build pulled garmin_daily
    // records, dropped them as unknown, and advanced its cursor past them.
    setDeviceToken('tok_1');
    localStorage.setItem('trainright_sync_known_domains', JSON.stringify(['custom_food']));
    setCursor(226);

    const since: string[] = [];
    vi.stubGlobal('fetch', vi.fn((url: unknown) => {
      const parsed = new URL(String(url));
      if (parsed.pathname.endsWith('/pull')) {
        since.push(parsed.searchParams.get('since') ?? '');
        return jsonResponse({ revision: 300, hasMore: false, changes: [] });
      }
      return jsonResponse({ revision: 300, results: [] });
    }));

    await syncNow();

    // Asked from 0, not from 226 — the skipped records are reachable again.
    expect(since[0]).toBe('0');
  });

  it('does not re-pull from zero when the domain set is unchanged', async () => {
    setDeviceToken('tok_1');
    localStorage.setItem('trainright_sync_known_domains', JSON.stringify([...KNOWN_DOMAINS].sort()));
    setCursor(226);

    const since: string[] = [];
    vi.stubGlobal('fetch', vi.fn((url: unknown) => {
      const parsed = new URL(String(url));
      if (parsed.pathname.endsWith('/pull')) {
        since.push(parsed.searchParams.get('since') ?? '');
        return jsonResponse({ revision: 300, hasMore: false, changes: [] });
      }
      return jsonResponse({ revision: 300, results: [] });
    }));

    await syncNow();

    expect(since[0]).toBe('226');
  });

  it('forceFullResync re-pulls the whole history on demand', async () => {
    setDeviceToken('tok_1');
    localStorage.setItem('trainright_sync_known_domains', JSON.stringify([...KNOWN_DOMAINS].sort()));
    setCursor(226);

    const since: string[] = [];
    vi.stubGlobal('fetch', vi.fn((url: unknown) => {
      const parsed = new URL(String(url));
      if (parsed.pathname.endsWith('/pull')) {
        since.push(parsed.searchParams.get('since') ?? '');
        return jsonResponse({ revision: 300, hasMore: false, changes: [] });
      }
      return jsonResponse({ revision: 300, results: [] });
    }));

    await forceFullResync();

    expect(since[0]).toBe('0');
  });

  it('counts applied changes and announces them so stale views can refresh', async () => {
    setDeviceToken('tok_1');
    localStorage.setItem('trainright_sync_known_domains', JSON.stringify([...KNOWN_DOMAINS].sort()));

    let announced = 0;
    const listener = () => { announced += 1; };
    window.addEventListener('trainright-sync-applied', listener);

    // appliedSinceLoad counts for the life of the page, and the module is not
    // reloaded between tests — so assert the delta, not an absolute.
    const before = getStatus().appliedSinceLoad;

    vi.stubGlobal('fetch', vi.fn(() => jsonResponse({
      revision: 5, hasMore: false,
      changes: [{
        domain: 'custom_food', id: 'c1', updatedAt: '2026-08-18T09:00:00.000Z',
        deleted: false, fields: { name: 'Bacon', calories: 520, protein: 37, carbs: 0, fats: 42 },
      }],
    })));

    await syncNow();
    window.removeEventListener('trainright-sync-applied', listener);

    expect(getStatus().appliedSinceLoad).toBe(before + 1);
    expect(announced).toBe(1);
  });

  it('stays silent when a sync applies nothing', async () => {
    setDeviceToken('tok_1');
    localStorage.setItem('trainright_sync_known_domains', JSON.stringify([...KNOWN_DOMAINS].sort()));

    let announced = 0;
    const listener = () => { announced += 1; };
    window.addEventListener('trainright-sync-applied', listener);

    vi.stubGlobal('fetch', vi.fn(() => jsonResponse({ revision: 5, hasMore: false, changes: [] })));

    await syncNow();
    window.removeEventListener('trainright-sync-applied', listener);

    expect(announced).toBe(0);
  });

  it('does not wedge future syncs if the pre-pull domain check throws', async () => {
    setDeviceToken('tok_1');
    // localStorage failing (quota, privacy mode) must not leave `running` stuck
    // true, which would silently disable syncing for the life of the page.
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = () => { throw new Error('quota exceeded'); };
    try {
      await syncNow();
    } finally {
      Storage.prototype.setItem = setItem;
    }
    expect(getStatus().state).toBe('error');

    // The next sync must still run rather than no-op forever.
    vi.stubGlobal('fetch', vi.fn(() => jsonResponse({ revision: 9, hasMore: false, changes: [] })));
    await syncNow();
    expect(getStatus().state).toBe('idle');
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
