import { SELF } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';

let token = '';

beforeAll(async () => {
  const res = await SELF.fetch('https://api.test/v1/auth/bootstrap', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: 'test-bootstrap-code', label: 'Pull tests' }),
  });
  token = (await res.json<{ token: string }>()).token;
});

const push = (mutations: unknown[]) =>
  SELF.fetch('https://api.test/v1/sync/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ mutations }),
  });

interface PullBody {
  revision: number;
  hasMore: boolean;
  changes: {
    domain: string; id: string; updatedAt: string;
    deleted: boolean; fields: Record<string, unknown>;
  }[];
}

const pull = async (since: number, limit?: number): Promise<PullBody> => {
  const url = new URL('https://api.test/v1/sync/pull');
  url.searchParams.set('since', String(since));
  if (limit !== undefined) url.searchParams.set('limit', String(limit));
  const res = await SELF.fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  expect(res.status).toBe(200);
  return res.json<PullBody>();
};

const meal = (id: string, updatedAt: string, foodName: string) => ({
  domain: 'food_entry', id, updatedAt, deleted: false,
  fields: {
    date: '2026-08-14', foodId: 'chicken', foodName, portion: 220,
    calories: 363, protein: 68, carbs: 0, fats: 8,
    mealType: 'lunch', timestamp: updatedAt, isManualMacroEntry: false,
  },
});

describe('GET /v1/sync/pull', () => {
  it('requires authentication', async () => {
    const res = await SELF.fetch('https://api.test/v1/sync/pull?since=0');
    expect(res.status).toBe(401);
  });

  it('returns everything from revision zero', async () => {
    const id = crypto.randomUUID();
    await push([meal(id, '2026-08-14T12:00:00.000Z', 'Chicken breast')]);
    const body = await pull(0);
    const change = body.changes.find((c) => c.id === id);
    expect(change?.domain).toBe('food_entry');
    expect(change?.fields.foodName).toBe('Chicken breast');
    expect(change?.deleted).toBe(false);
  });

  it('returns nothing when the cursor is current', async () => {
    await push([meal(crypto.randomUUID(), '2026-08-14T12:00:00.000Z', 'Anything')]);
    const first = await pull(0);
    const second = await pull(first.revision);
    expect(second.changes).toEqual([]);
    expect(second.revision).toBe(first.revision);
  });

  it('returns only changes after the cursor', async () => {
    const before = await pull(0);
    const id = crypto.randomUUID();
    await push([meal(id, '2026-08-14T15:00:00.000Z', 'Later meal')]);
    const after = await pull(before.revision);
    expect(after.changes.map((c) => c.id)).toEqual([id]);
  });

  it('propagates deletions as tombstones', async () => {
    const id = crypto.randomUUID();
    await push([meal(id, '2026-08-14T12:00:00.000Z', 'Doomed')]);
    const mid = await pull(0);
    await push([{ domain: 'food_entry', id, updatedAt: '2026-08-14T16:00:00.000Z', deleted: true, fields: {} }]);
    const after = await pull(mid.revision);
    const change = after.changes.find((c) => c.id === id);
    expect(change?.deleted).toBe(true);
  });

  it('converts booleans and JSON back to real types', async () => {
    const id = crypto.randomUUID();
    await push([{
      domain: 'body_stat', id, updatedAt: '2026-08-14T12:00:00.000Z', deleted: false,
      fields: {
        date: '2026-08-14', weight: 87.4, needsReview: true,
        segmentalLean: [{ region: 'leftArm', massKg: 3.1 }],
      },
    }]);
    const body = await pull(0);
    const change = body.changes.find((c) => c.id === id);
    expect(change?.fields.needsReview).toBe(true);
    expect(change?.fields.segmentalLean).toEqual([{ region: 'leftArm', massKg: 3.1 }]);
    expect(change?.fields.weight).toBe(87.4);
  });

  it('omits columns the record has no value for', async () => {
    const id = crypto.randomUUID();
    await push([{
      domain: 'body_stat', id, updatedAt: '2026-08-14T12:00:00.000Z', deleted: false,
      fields: { date: '2026-08-14', weight: 87.4 },
    }]);
    const body = await pull(0);
    const change = body.changes.find((c) => c.id === id);
    expect(change?.fields).not.toHaveProperty('notes');
    expect(change?.fields).not.toHaveProperty('segmentalFat');
  });

  it('does not leak the internal revision into the change payload', async () => {
    await push([meal(crypto.randomUUID(), '2026-08-14T12:00:00.000Z', 'Hidden')]);
    const body = await pull(0);
    expect(body.changes[0]).not.toHaveProperty('revision');
  });

  it('pages with limit and reports hasMore', async () => {
    const start = await pull(0);
    await push([
      meal(crypto.randomUUID(), '2026-08-14T17:00:00.000Z', 'One'),
      meal(crypto.randomUUID(), '2026-08-14T17:01:00.000Z', 'Two'),
      meal(crypto.randomUUID(), '2026-08-14T17:02:00.000Z', 'Three'),
    ]);

    const page = await pull(start.revision, 2);
    expect(page.changes).toHaveLength(2);
    expect(page.hasMore).toBe(true);

    const rest = await pull(page.revision, 2);
    expect(rest.changes).toHaveLength(1);
    expect(rest.hasMore).toBe(false);
  });

  it('rejects a non-numeric cursor', async () => {
    const res = await SELF.fetch('https://api.test/v1/sync/pull?since=banana', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(400);
  });
});
