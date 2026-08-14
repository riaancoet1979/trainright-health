import { SELF } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';

const tokens: Record<string, string> = {};

const bootstrap = async (label: string) => {
  const res = await SELF.fetch('https://api.test/v1/auth/bootstrap', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: 'test-bootstrap-code', label }),
  });
  tokens[label] = (await res.json<{ token: string }>()).token;
};

beforeAll(async () => {
  await bootstrap('Phone');
  await bootstrap('PC');
});

const push = (device: string, mutations: unknown[]) =>
  SELF.fetch('https://api.test/v1/sync/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokens[device]}` },
    body: JSON.stringify({ mutations }),
  });

const pull = async (device: string, since: number) => {
  const res = await SELF.fetch(`https://api.test/v1/sync/pull?since=${since}`, {
    headers: { Authorization: `Bearer ${tokens[device]}` },
  });
  return res.json<{
    revision: number;
    changes: { id: string; deleted: boolean; fields: Record<string, unknown> }[];
  }>();
};

const set = (id: string, updatedAt: string, reps: string) => ({
  domain: 'set_log', id, updatedAt, deleted: false,
  fields: {
    sessionDate: '2026-08-14', exerciseId: 'goblet-squat',
    setIndex: 0, weight: '20', reps, done: true,
  },
});

describe('two-device convergence', () => {
  it('delivers offline writes from the phone to the PC exactly once', async () => {
    const pcStart = await pull('PC', 0);

    // Phone was offline and flushes three queued sets at once.
    const ids = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
    await push('Phone', [
      set(ids[0], '2026-08-14T06:00:00.000Z', '8'),
      set(ids[1], '2026-08-14T06:03:00.000Z', '8'),
      set(ids[2], '2026-08-14T06:06:00.000Z', '7'),
    ]);

    const pcAfter = await pull('PC', pcStart.revision);
    expect(pcAfter.changes.map((c) => c.id).sort()).toEqual([...ids].sort());

    // A replay of the same flush must not duplicate anything.
    await push('Phone', [set(ids[0], '2026-08-14T06:00:00.000Z', '8')]);
    const pcReplay = await pull('PC', pcAfter.revision);
    expect(pcReplay.changes).toEqual([]);
  });

  it('converges both devices on the later edit of the same record', async () => {
    const id = crypto.randomUUID();
    await push('Phone', [set(id, '2026-08-14T07:00:00.000Z', '8')]);
    await push('PC', [set(id, '2026-08-14T07:05:00.000Z', '10')]);
    await push('Phone', [set(id, '2026-08-14T07:02:00.000Z', '9')]);

    const phoneView = await pull('Phone', 0);
    const pcView = await pull('PC', 0);
    const fromPhone = phoneView.changes.find((c) => c.id === id);
    const fromPC = pcView.changes.find((c) => c.id === id);

    expect(fromPhone?.fields.reps).toBe('10');
    expect(fromPC?.fields.reps).toBe('10');
  });

  it('propagates a deletion made on one device to the other', async () => {
    const id = crypto.randomUUID();
    await push('PC', [set(id, '2026-08-14T08:00:00.000Z', '8')]);
    const phoneStart = await pull('Phone', 0);
    await push('PC', [{ domain: 'set_log', id, updatedAt: '2026-08-14T08:30:00.000Z', deleted: true, fields: {} }]);

    const phoneAfter = await pull('Phone', phoneStart.revision);
    expect(phoneAfter.changes.find((c) => c.id === id)?.deleted).toBe(true);
  });

  it('keeps records from different domains independent', async () => {
    const start = await pull('PC', 0);
    const setId = crypto.randomUUID();
    const mealId = crypto.randomUUID();

    await push('Phone', [set(setId, '2026-08-14T09:00:00.000Z', '8')]);
    await push('PC', [{
      domain: 'food_entry', id: mealId, updatedAt: '2026-08-14T09:01:00.000Z', deleted: false,
      fields: {
        date: '2026-08-14', foodId: 'oats', foodName: 'Oats', portion: 80,
        calories: 300, protein: 10, carbs: 54, fats: 6,
        mealType: 'breakfast', timestamp: '2026-08-14T09:01:00.000Z',
      },
    }]);

    const after = await pull('Phone', start.revision);
    expect(after.changes.map((c) => c.id).sort()).toEqual([setId, mealId].sort());
  });
});
