import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { bootstrapDevice, pushMutations, pullChanges } from '../sync/client';
import { setDeviceToken, clearDeviceToken } from '../sync/config';
import type { Mutation } from '../sync/types';

const mutation: Mutation = {
  domain: 'achievement', id: 'a1', updatedAt: '2026-08-14T12:00:00.000Z',
  deleted: false, fields: { name: 'x', date: '2026-08-14' },
};

const jsonResponse = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json' },
  }));

describe('sync client', () => {
  beforeEach(() => {
    localStorage.clear();
    clearDeviceToken();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('bootstraps and stores the returned token', async () => {
    vi.stubGlobal('fetch', vi.fn(() => jsonResponse({ token: 'tok_1', deviceId: 'd1' })));
    const result = await bootstrapDevice('secret-code', 'Riaan PC');
    expect(result.ok).toBe(true);
    expect(localStorage.getItem('trainright_sync_token')).toBe('tok_1');
  });

  it('reports a rejected bootstrap code without storing anything', async () => {
    vi.stubGlobal('fetch', vi.fn(() => jsonResponse({ error: { code: 'bad_code', message: 'Bootstrap code rejected.' } }, 401)));
    const result = await bootstrapDevice('wrong', 'Riaan PC');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/rejected/i);
    expect(localStorage.getItem('trainright_sync_token')).toBeNull();
  });

  it('reports a network failure during bootstrap rather than throwing', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('Failed to fetch'))));
    const result = await bootstrapDevice('secret', 'Riaan PC');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/fetch/i);
  });

  it('sends the bearer token when pushing', async () => {
    setDeviceToken('tok_1');
    const fetchMock = vi.fn(() => jsonResponse({ revision: 3, results: [{ id: 'a1', status: 'applied' }] }));
    vi.stubGlobal('fetch', fetchMock);

    const results = await pushMutations([mutation]);
    expect(results[0].status).toBe('applied');

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok_1');
  });

  it('throws when pushing while unpaired', async () => {
    await expect(pushMutations([mutation])).rejects.toThrow(/not paired/i);
  });

  it('pulls changes and reports the new cursor', async () => {
    setDeviceToken('tok_1');
    vi.stubGlobal('fetch', vi.fn(() => jsonResponse({
      revision: 9, hasMore: false,
      changes: [{ domain: 'achievement', id: 'a1', updatedAt: 'x', deleted: false, fields: {} }],
    })));

    const page = await pullChanges(0);
    expect(page.revision).toBe(9);
    expect(page.changes).toHaveLength(1);
    expect(page.hasMore).toBe(false);
  });

  it('sends the cursor as a query parameter', async () => {
    setDeviceToken('tok_1');
    const fetchMock = vi.fn(() => jsonResponse({ revision: 5, hasMore: false, changes: [] }));
    vi.stubGlobal('fetch', fetchMock);

    await pullChanges(17);
    expect(String(fetchMock.mock.calls[0][0])).toContain('since=17');
  });

  it('surfaces a server error rather than returning empty', async () => {
    setDeviceToken('tok_1');
    vi.stubGlobal('fetch', vi.fn(() => jsonResponse({ error: { code: 'boom', message: 'nope' } }, 500)));
    await expect(pullChanges(0)).rejects.toThrow(/nope/);
  });

  it('falls back to the status code when the error body is unreadable', async () => {
    setDeviceToken('tok_1');
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('not json', { status: 502 }))));
    await expect(pullChanges(0)).rejects.toThrow(/502/);
  });
});
