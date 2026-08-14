import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { writeStore, removeStore, setSuppressCapture } from '../sync/writeStore';
import { listPending, clearOutbox } from '../sync/outbox';

const KEY = 'nutrition_tracker_custom_foods';
const food = (id: string, name: string) => ({
  id, name, calories: 100, protein: 10, carbs: 5, fats: 2, isCustom: true,
});

describe('writeStore', () => {
  beforeEach(async () => {
    localStorage.clear();
    await clearOutbox();
    setSuppressCapture(false);
  });

  it('persists the value to localStorage', async () => {
    await writeStore(KEY, [food('a', 'Bacon')]);
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual([food('a', 'Bacon')]);
  });

  it('enqueues an upsert for a new record', async () => {
    await writeStore(KEY, [food('a', 'Bacon')]);
    const pending = await listPending();
    expect(pending).toHaveLength(1);
    expect(pending[0].mutation).toMatchObject({ domain: 'custom_food', id: 'a', deleted: false });
    expect(pending[0].mutation.fields.name).toBe('Bacon');
  });

  it('enqueues nothing when the value is unchanged', async () => {
    await writeStore(KEY, [food('a', 'Bacon')]);
    await clearOutbox();
    await writeStore(KEY, [food('a', 'Bacon')]);
    expect(await listPending()).toEqual([]);
  });

  it('enqueues only the record that changed', async () => {
    await writeStore(KEY, [food('a', 'Bacon'), food('b', 'Eggs')]);
    await clearOutbox();
    await writeStore(KEY, [food('a', 'Bacon'), { ...food('b', 'Eggs'), calories: 200 }]);
    const pending = await listPending();
    expect(pending).toHaveLength(1);
    expect(pending[0].mutation.id).toBe('b');
  });

  it('enqueues a tombstone for a removed record', async () => {
    await writeStore(KEY, [food('a', 'Bacon'), food('b', 'Eggs')]);
    await clearOutbox();
    await writeStore(KEY, [food('a', 'Bacon')]);
    const pending = await listPending();
    expect(pending).toHaveLength(1);
    expect(pending[0].mutation).toMatchObject({ id: 'b', deleted: true });
  });

  it('captures nothing while suppressed, but still persists', async () => {
    setSuppressCapture(true);
    await writeStore(KEY, [food('a', 'Bacon')]);
    expect(localStorage.getItem(KEY)).not.toBeNull();
    expect(await listPending()).toEqual([]);
  });

  it('ignores untracked keys entirely', async () => {
    await writeStore('some_ui_flag', { dismissed: true });
    expect(await listPending()).toEqual([]);
    expect(JSON.parse(localStorage.getItem('some_ui_flag')!)).toEqual({ dismissed: true });
  });

  it('treats a first write over absent storage as all-new, not as a diff', async () => {
    await writeStore(KEY, [food('a', 'Bacon'), food('b', 'Eggs')]);
    expect(await listPending()).toHaveLength(2);
  });

  it('recovers when the existing stored value is corrupt JSON', async () => {
    localStorage.setItem(KEY, '{not json');
    await writeStore(KEY, [food('a', 'Bacon')]);
    const pending = await listPending();
    expect(pending).toHaveLength(1);
    expect(pending[0].mutation.deleted).toBe(false);
  });

  it('writes to localStorage synchronously, before the promise settles', () => {
    void writeStore(KEY, [food('a', 'Bacon')]);
    expect(localStorage.getItem(KEY)).not.toBeNull();
  });

  it('tombstones every record when a whole store is removed', async () => {
    await writeStore(KEY, [food('a', 'Bacon'), food('b', 'Eggs')]);
    await clearOutbox();
    await removeStore(KEY);
    const pending = await listPending();
    expect(pending).toHaveLength(2);
    expect(pending.every((i) => i.mutation.deleted)).toBe(true);
    expect(localStorage.getItem(KEY)).toBeNull();
  });
});
