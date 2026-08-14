import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { applyChanges } from '../sync/apply';
import { listPending, clearOutbox } from '../sync/outbox';
import { getDailyEntry, getCustomFoods } from '../utils/storage';
import { getTrainingData } from '../utils/training';
import type { Change } from '../sync/types';

const flush = () => new Promise((resolve) => setTimeout(resolve, 60));

const change = (over: Partial<Change>): Change => ({
  domain: 'custom_food', id: 'c1', updatedAt: '2026-08-14T12:00:00.000Z',
  deleted: false, fields: { name: 'Bacon', calories: 520, protein: 37, carbs: 0, fats: 42 },
  ...over,
});

describe('applyChanges', () => {
  beforeEach(async () => {
    localStorage.clear();
    await clearOutbox();
  });

  it('inserts a custom food the UI can then read', async () => {
    await applyChanges([change({})]);
    expect(getCustomFoods().map((f) => f.name)).toContain('Bacon');
  });

  it('removes a record on a tombstone', async () => {
    await applyChanges([change({})]);
    await applyChanges([change({ deleted: true, fields: {} })]);
    expect(getCustomFoods()).toEqual([]);
  });

  it('inserts a food entry into the right day', async () => {
    await applyChanges([change({
      domain: 'food_entry', id: 'f1',
      fields: {
        date: '2026-08-14', foodId: 'chicken', foodName: 'Chicken', portion: 220,
        calories: 363, protein: 68, carbs: 0, fats: 8,
        mealType: 'lunch', timestamp: '2026-08-14T12:00:00.000Z',
      },
    })]);
    expect(getDailyEntry('2026-08-14').foodEntries.map((f) => f.id)).toEqual(['f1']);
  });

  it('recomputes day totals so the UI stays consistent', async () => {
    await applyChanges([change({
      domain: 'food_entry', id: 'f1',
      fields: {
        date: '2026-08-14', foodId: 'chicken', foodName: 'Chicken', portion: 220,
        calories: 363, protein: 68, carbs: 0, fats: 8,
        mealType: 'lunch', timestamp: '2026-08-14T12:00:00.000Z',
      },
    })]);
    const day = getDailyEntry('2026-08-14');
    expect(day.totalCalories).toBe(363);
    expect(day.totalProtein).toBe(68);
    expect(day.netCalories).toBe(363);
  });

  it('rebuilds a training session with its sets', async () => {
    await applyChanges([
      change({
        domain: 'session_log', id: '2026-06-07',
        fields: { date: '2026-06-07', dayKey: 'mon', weekNum: 0, phase: 0, completed: true, notes: 'ok' },
      }),
      change({
        domain: 'set_log', id: '2026-06-07:goblet_squat:0',
        fields: { sessionDate: '2026-06-07', exerciseId: 'goblet_squat', setIndex: 0, weight: '10', reps: '15', done: true },
      }),
    ]);

    const log = getTrainingData().logs['2026-06-07'];
    expect(log.dayKey).toBe('mon');
    expect(log.exercises.goblet_squat.sets[0]).toMatchObject({ weight: '10', reps: '15', done: true });
  });

  it('restores pushup sets and their derived counts', async () => {
    await applyChanges([change({
      domain: 'pushup_set', id: '2026-08-14:2026-08-14T07:00:00.000Z',
      fields: { date: '2026-08-14', reps: 12, timestamp: '2026-08-14T07:00:00.000Z' },
    })]);
    const fitness = getDailyEntry('2026-08-14').fitness!;
    expect(fitness.pushups.sets).toHaveLength(1);
    expect(fitness.pushups.totalReps).toBe(12);
    expect(fitness.pushups.setsCompleted).toBe(1);
  });

  it('never queues what it applies', async () => {
    await applyChanges([change({})]);
    await flush();
    expect(await listPending()).toEqual([]);
  });

  it('ignores an unknown domain rather than throwing', async () => {
    await expect(applyChanges([change({ domain: 'trading_trade' })])).resolves.not.toThrow();
  });

  it('is idempotent — applying the same change twice changes nothing', async () => {
    await applyChanges([change({})]);
    const first = getCustomFoods();
    await applyChanges([change({})]);
    expect(getCustomFoods()).toEqual(first);
  });

  it('leaves untouched stores alone', async () => {
    localStorage.setItem('trainright_body_stats', JSON.stringify([{ id: 'b1', date: '2026-05-26' }]));
    await applyChanges([change({})]);
    expect(JSON.parse(localStorage.getItem('trainright_body_stats')!)).toEqual([{ id: 'b1', date: '2026-05-26' }]);
  });

  it('does nothing at all for an empty change list', async () => {
    await applyChanges([]);
    expect(localStorage.length).toBe(0);
  });
});
