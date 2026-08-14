import { SELF, env } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';

let token = '';

beforeAll(async () => {
  const res = await SELF.fetch('https://api.test/v1/auth/bootstrap', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: 'test-bootstrap-code', label: 'Push tests' }),
  });
  token = (await res.json<{ token: string }>()).token;
});

const push = (mutations: unknown[]) =>
  SELF.fetch('https://api.test/v1/sync/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ mutations }),
  });

const meal = (id: string, updatedAt: string, foodName = 'Chicken breast') => ({
  domain: 'food_entry',
  id,
  updatedAt,
  deleted: false,
  fields: {
    date: '2026-08-14', foodId: 'chicken', foodName, portion: 220,
    calories: 363, protein: 68, carbs: 0, fats: 8,
    mealType: 'lunch', timestamp: updatedAt, isManualMacroEntry: false,
  },
});

describe('POST /v1/sync/push', () => {
  it('requires authentication', async () => {
    const res = await SELF.fetch('https://api.test/v1/sync/push', {
      method: 'POST', body: '{"mutations":[]}',
    });
    expect(res.status).toBe(401);
  });

  it('inserts a new record and assigns a revision', async () => {
    const id = crypto.randomUUID();
    const res = await push([meal(id, '2026-08-14T12:00:00.000Z')]);
    expect(res.status).toBe(200);
    const body = await res.json<{ revision: number; results: { id: string; status: string }[] }>();
    expect(body.results).toEqual([{ id, status: 'applied' }]);
    expect(body.revision).toBeGreaterThan(0);

    const row = await env.DB.prepare('SELECT food_name, portion, is_manual_macro_entry FROM food_entry WHERE id = ?')
      .bind(id).first<{ food_name: string; portion: number; is_manual_macro_entry: number }>();
    expect(row?.food_name).toBe('Chicken breast');
    expect(row?.portion).toBe(220);
    expect(row?.is_manual_macro_entry).toBe(0);
  });

  it('is idempotent when the same mutation is replayed', async () => {
    const id = crypto.randomUUID();
    const mutation = meal(id, '2026-08-14T12:00:00.000Z');
    await push([mutation]);
    await push([mutation]);
    const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM food_entry WHERE id = ?')
      .bind(id).first<{ n: number }>();
    expect(row?.n).toBe(1);
  });

  it('applies a newer update and reports an older one as stale', async () => {
    const id = crypto.randomUUID();
    await push([meal(id, '2026-08-14T12:00:00.000Z', 'First')]);
    await push([meal(id, '2026-08-14T13:00:00.000Z', 'Second')]);
    const stale = await push([meal(id, '2026-08-14T11:00:00.000Z', 'Older')]);
    const body = await stale.json<{ results: { status: string }[] }>();
    expect(body.results[0].status).toBe('stale');

    const row = await env.DB.prepare('SELECT food_name FROM food_entry WHERE id = ?')
      .bind(id).first<{ food_name: string }>();
    expect(row?.food_name).toBe('Second');
  });

  it('records a delete as a tombstone rather than removing the row', async () => {
    const id = crypto.randomUUID();
    await push([meal(id, '2026-08-14T12:00:00.000Z')]);
    await push([{ domain: 'food_entry', id, updatedAt: '2026-08-14T14:00:00.000Z', deleted: true, fields: {} }]);
    const row = await env.DB.prepare('SELECT deleted_at, food_name FROM food_entry WHERE id = ?')
      .bind(id).first<{ deleted_at: string | null; food_name: string }>();
    expect(row?.deleted_at).toBe('2026-08-14T14:00:00.000Z');
    // A field-less delete must not blank the record.
    expect(row?.food_name).toBe('Chicken breast');
  });

  it('rejects an unknown domain without failing the batch', async () => {
    const goodId = crypto.randomUUID();
    const res = await push([
      { domain: 'trading_trade', id: crypto.randomUUID(), updatedAt: '2026-08-14T12:00:00.000Z', deleted: false, fields: {} },
      meal(goodId, '2026-08-14T12:00:00.000Z'),
    ]);
    const body = await res.json<{ results: { status: string; reason?: string }[] }>();
    expect(body.results[0].status).toBe('rejected');
    expect(body.results[0].reason).toContain('trading_trade');
    expect(body.results[1].status).toBe('applied');
  });

  it('rejects an unknown field without failing the batch', async () => {
    const id = crypto.randomUUID();
    const mutation = meal(id, '2026-08-14T12:00:00.000Z');
    const res = await push([{ ...mutation, fields: { ...mutation.fields, nonsense: 1 } }]);
    const body = await res.json<{ results: { status: string; reason?: string }[] }>();
    expect(body.results[0].status).toBe('rejected');
    expect(body.results[0].reason).toContain('nonsense');
  });

  it('rejects a bad updatedAt', async () => {
    const res = await push([{
      domain: 'achievement', id: crypto.randomUUID(), updatedAt: 'yesterday',
      deleted: false, fields: { name: 'x', date: '2026-08-14' },
    }]);
    const body = await res.json<{ results: { status: string; reason?: string }[] }>();
    expect(body.results[0].status).toBe('rejected');
    expect(body.results[0].reason).toContain('ISO 8601');
  });

  it('stores JSON fields as text and preserves structure', async () => {
    const id = crypto.randomUUID();
    await push([{
      domain: 'body_stat', id, updatedAt: '2026-08-14T12:00:00.000Z', deleted: false,
      fields: {
        date: '2026-08-14', weight: 87.4,
        segmentalLean: [{ region: 'leftArm', massKg: 3.1, classification: 'Normal' }],
      },
    }]);
    const row = await env.DB.prepare('SELECT segmental_lean FROM body_stat WHERE id = ?')
      .bind(id).first<{ segmental_lean: string }>();
    expect(JSON.parse(row!.segmental_lean)).toEqual([
      { region: 'leftArm', massKg: 3.1, classification: 'Normal' },
    ]);
  });

  it('preserves free-text set weights rather than coercing them', async () => {
    const id = crypto.randomUUID();
    await push([{
      domain: 'set_log', id, updatedAt: '2026-08-14T12:00:00.000Z', deleted: false,
      fields: {
        sessionDate: '2026-08-14', exerciseId: 'band-pullup', setIndex: 0,
        weight: 'red band', reps: '8', done: true,
      },
    }]);
    const row = await env.DB.prepare('SELECT weight, reps, done FROM set_log WHERE id = ?')
      .bind(id).first<{ weight: string; reps: string; done: number }>();
    expect(row?.weight).toBe('red band');
    expect(row?.reps).toBe('8');
    expect(row?.done).toBe(1);
  });

  it('rejects an oversized body before parsing it', async () => {
    const res = await SELF.fetch('https://api.test/v1/sync/push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': '5000000',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ mutations: [] }),
    });
    expect(res.status).toBe(413);
  });

  it('rejects a batch that is not shaped as {mutations: []}', async () => {
    const res = await SELF.fetch('https://api.test/v1/sync/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ nope: true }),
    });
    expect(res.status).toBe(400);
  });
});
