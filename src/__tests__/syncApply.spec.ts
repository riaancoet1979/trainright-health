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

describe('applyChanges — garmin_daily', () => {
  // Own isolation: this is a sibling describe, so the parent's beforeEach does
  // not apply and localStorage would otherwise carry over between blocks.
  beforeEach(async () => {
    localStorage.clear();
    await clearOutbox();
  });

  const garminChange = (id: string, over: Partial<Change> = {}): Change => ({
    domain: 'garmin_daily', id, updatedAt: '2026-08-17T06:30:00.000Z', deleted: false,
    fields: { source: 'garmin_connect', steps: 8421, rhr: 58, hrv: 47, sleepHours: 7.2 },
    ...over,
  });

  it('creates a health_metrics_v1 day the dashboard can read', async () => {
    await applyChanges([garminChange('2026-08-16')]);
    const stored = JSON.parse(localStorage.getItem('health_metrics_v1')!);
    expect(stored.days['2026-08-16']).toMatchObject({ steps: 8421, rhr: 58, hrv: 47 });
  });

  it('replaces the whole day on a second push rather than merging fields', async () => {
    await applyChanges([garminChange('2026-08-16')]);
    await applyChanges([garminChange('2026-08-16', {
      fields: { source: 'garmin_connect', steps: 9000 },
    })]);
    const stored = JSON.parse(localStorage.getItem('health_metrics_v1')!);
    expect(stored.days['2026-08-16']).toEqual({ source: 'garmin_connect', steps: 9000 });
  });

  it('removes the day on a tombstone', async () => {
    await applyChanges([garminChange('2026-08-16')]);
    await applyChanges([garminChange('2026-08-16', { deleted: true, fields: {} })]);
    const stored = JSON.parse(localStorage.getItem('health_metrics_v1')!);
    expect(stored.days).not.toHaveProperty('2026-08-16');
  });

  it('preserves other HealthMetrics fields and existing days', async () => {
    localStorage.setItem('health_metrics_v1', JSON.stringify({
      syncedAt: '2026-08-17T06:00:00.000Z',
      days: { '2026-08-15': { steps: 5000 } },
      dateRange: { start: '2026-07-17', end: '2026-08-17' },
    }));
    await applyChanges([garminChange('2026-08-16')]);
    const stored = JSON.parse(localStorage.getItem('health_metrics_v1')!);
    expect(stored.dateRange).toEqual({ start: '2026-07-17', end: '2026-08-17' });
    expect(stored.days['2026-08-15']).toEqual({ steps: 5000 });
    expect(stored.days['2026-08-16']).toMatchObject({ steps: 8421 });
    // syncedAt intentionally advances — see the dedicated tests below.
    expect(stored.syncedAt).toBe('2026-08-17T06:30:00.000Z');
  });

  it('never queues what it applies', async () => {
    await applyChanges([garminChange('2026-08-16')]);
    await flush();
    expect(await listPending()).toEqual([]);
  });

  it('records syncedAt so the staleness banner reflects the new data', async () => {
    // Without this the device shows fresh Garmin metrics while still reporting
    // "last synced 73 d ago" from whenever it last absorbed gh-sync.json.
    await applyChanges([garminChange('2026-08-16')]);
    const stored = JSON.parse(localStorage.getItem('health_metrics_v1')!);
    expect(stored.syncedAt).toBe('2026-08-17T06:30:00.000Z');
  });

  it('keeps the newest syncedAt when changes arrive out of order', async () => {
    await applyChanges([garminChange('2026-08-16', { updatedAt: '2026-08-17T06:30:00.000Z' })]);
    await applyChanges([garminChange('2026-08-15', { updatedAt: '2026-08-10T06:30:00.000Z' })]);
    const stored = JSON.parse(localStorage.getItem('health_metrics_v1')!);
    expect(stored.syncedAt).toBe('2026-08-17T06:30:00.000Z');
  });

  it('does not regress syncedAt that is already newer', async () => {
    localStorage.setItem('health_metrics_v1', JSON.stringify({
      syncedAt: '2026-08-18T09:00:00.000Z', days: {},
    }));
    await applyChanges([garminChange('2026-08-16')]);
    const stored = JSON.parse(localStorage.getItem('health_metrics_v1')!);
    expect(stored.syncedAt).toBe('2026-08-18T09:00:00.000Z');
  });
});
