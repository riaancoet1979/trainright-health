import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import {
  addCustomFood, saveDailyEntry, getDailyEntry, addAchievement,
  saveUserSettings, getUserSettings, deleteCustomFood, getCustomFoods,
} from '../utils/storage';
import { listPending, clearOutbox } from '../sync/outbox';

const flush = () => new Promise((resolve) => setTimeout(resolve, 60));

describe('existing mutators feed the outbox', () => {
  beforeEach(async () => {
    localStorage.clear();
    await clearOutbox();
  });

  it('addCustomFood enqueues a custom_food upsert', async () => {
    addCustomFood({ name: 'Bacon', calories: 520, protein: 37, carbs: 0, fats: 42 });
    await flush();
    const pending = await listPending();
    expect(pending.map((i) => i.mutation.domain)).toContain('custom_food');
  });

  it('deleteCustomFood enqueues a tombstone', async () => {
    const food = addCustomFood({ name: 'Bacon', calories: 520, protein: 37, carbs: 0, fats: 42 });
    await flush();
    await clearOutbox();

    deleteCustomFood(food.id);
    await flush();
    const pending = await listPending();
    expect(pending).toHaveLength(1);
    expect(pending[0].mutation).toMatchObject({ domain: 'custom_food', id: food.id, deleted: true });
    expect(getCustomFoods()).toEqual([]);
  });

  it('saveDailyEntry enqueues a food_entry upsert', async () => {
    const entry = getDailyEntry('2026-08-14');
    entry.foodEntries.push({
      id: 'f1', foodId: 'chicken', foodName: 'Chicken', portion: 220,
      calories: 363, protein: 68, carbs: 0, fats: 8,
      mealType: 'lunch', timestamp: '2026-08-14T12:00:00.000Z',
    });
    saveDailyEntry(entry);
    await flush();
    const pending = await listPending();
    expect(pending.some((i) => i.mutation.domain === 'food_entry' && i.mutation.id === 'f1')).toBe(true);
  });

  it('addAchievement enqueues an achievement upsert', async () => {
    addAchievement({ id: 'a1', name: 'First workout', date: '2026-08-14' });
    await flush();
    const pending = await listPending();
    expect(pending.some((i) => i.mutation.domain === 'achievement')).toBe(true);
  });

  it('saveUserSettings enqueues the singleton settings record', async () => {
    const settings = getUserSettings();
    settings.targets.dailyCalories = 2400;
    saveUserSettings(settings);
    await flush();
    const pending = await listPending();
    const record = pending.find((i) => i.mutation.domain === 'user_settings');
    expect(record?.mutation.id).toBe('singleton');
    expect(record?.mutation.fields.dailyCalories).toBe(2400);
  });

  it('reads still see the value synchronously right after a write', () => {
    const entry = getDailyEntry('2026-08-14');
    entry.totalCalories = 1234;
    saveDailyEntry(entry);
    expect(getDailyEntry('2026-08-14').totalCalories).toBe(1234);
  });

  it('queues one mutation per changed record, not one per store write', async () => {
    const entry = getDailyEntry('2026-08-14');
    entry.foodEntries.push({
      id: 'f1', foodId: 'chicken', foodName: 'Chicken', portion: 220,
      calories: 363, protein: 68, carbs: 0, fats: 8,
      mealType: 'lunch', timestamp: '2026-08-14T12:00:00.000Z',
    });
    saveDailyEntry(entry);
    await flush();
    await clearOutbox();

    // Editing one entry must not re-queue the other records for that day.
    entry.foodEntries[0].portion = 250;
    saveDailyEntry(entry);
    await flush();

    const pending = await listPending();
    expect(pending).toHaveLength(1);
    expect(pending[0].mutation.id).toBe('f1');
  });
});
