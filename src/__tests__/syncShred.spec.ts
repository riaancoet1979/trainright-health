import { describe, it, expect } from 'vitest';
import { shredStore, STORE_KEYS } from '../sync/shred';

describe('shredStore — daily entries', () => {
  const store = {
    '2026-08-14': {
      date: '2026-08-14',
      foodEntries: [{
        id: 'f1', foodId: 'chicken', foodName: 'Chicken', portion: 220,
        calories: 363, protein: 68, carbs: 0, fats: 8,
        mealType: 'lunch', timestamp: '2026-08-14T12:00:00.000Z',
      }],
      exercises: [{
        id: 'e1', name: 'Walk', duration: 30, caloriesBurned: 120,
        type: 'walking', timestamp: '2026-08-14T13:00:00.000Z',
      }],
      totalCalories: 363, totalProtein: 68, totalCarbs: 0, totalFats: 8,
      totalExerciseCalories: 120, netCalories: 243,
      fitness: {
        pushups: { sets: [{ reps: 12, timestamp: '2026-08-14T07:00:00.000Z' }], totalReps: 12, setsCompleted: 1 },
        steps: { steps: 8000, goal: 5000 },
      },
    },
  };

  it('extracts a food entry keyed by its own id', () => {
    const records = shredStore('nutrition_tracker_daily_entries', store);
    const food = records.find((r) => r.domain === 'food_entry');
    expect(food?.id).toBe('f1');
    expect(food?.fields.foodName).toBe('Chicken');
    expect(food?.fields.date).toBe('2026-08-14');
  });

  it('extracts an exercise keyed by its own id', () => {
    const records = shredStore('nutrition_tracker_daily_entries', store);
    const exercise = records.find((r) => r.domain === 'exercise');
    expect(exercise?.id).toBe('e1');
    expect(exercise?.fields.caloriesBurned).toBe(120);
  });

  it('gives a pushup set a deterministic id', () => {
    const records = shredStore('nutrition_tracker_daily_entries', store);
    const set = records.find((r) => r.domain === 'pushup_set');
    expect(set?.id).toBe('2026-08-14:2026-08-14T07:00:00.000Z');
    expect(set?.fields.reps).toBe(12);
  });

  it('gives daily steps the date as its id', () => {
    const records = shredStore('nutrition_tracker_daily_entries', store);
    const steps = records.find((r) => r.domain === 'daily_steps');
    expect(steps?.id).toBe('2026-08-14');
    expect(steps?.fields).toMatchObject({ date: '2026-08-14', steps: 8000, goal: 5000 });
  });
});

describe('shredStore — resilience', () => {
  it.each(STORE_KEYS)('returns [] for null in %s', (key) => {
    expect(shredStore(key, null)).toEqual([]);
  });

  it.each(STORE_KEYS)('returns [] for undefined in %s', (key) => {
    expect(shredStore(key, undefined)).toEqual([]);
  });

  it.each(STORE_KEYS)('returns [] for a wrong-typed value in %s', (key) => {
    expect(shredStore(key, 'nonsense')).toEqual([]);
  });

  it('returns [] for an unknown store key', () => {
    expect(shredStore('health_metrics_v1', { anything: true })).toEqual([]);
  });

  it('skips a malformed daily entry without throwing', () => {
    const records = shredStore('nutrition_tracker_daily_entries', {
      '2026-08-14': { date: '2026-08-14', foodEntries: 'not an array' },
    });
    expect(records.filter((r) => r.domain === 'food_entry')).toEqual([]);
  });

  it('skips records that have no id', () => {
    const records = shredStore('nutrition_tracker_custom_foods', [
      { name: 'No id here', calories: 1 },
      { id: 'c1', name: 'Fine', calories: 2 },
    ]);
    expect(records.map((r) => r.id)).toEqual(['c1']);
  });
});

describe('shredStore — training', () => {
  const training = {
    programStartDate: '2026-06-07',
    logs: {
      '2026-06-07': {
        dayKey: 'mon', weekNum: 0, phase: 0, completed: true, notes: 'ok',
        shoulderPain: 2,
        exercises: {
          goblet_squat: { note: 'felt good', sets: [{ weight: '10', reps: '15', done: true }] },
        },
      },
    },
    bodyMetrics: [{ date: '2026-05-26', weight: 83.6, bfp: 19.7, waist: '', chest: '' }],
  };

  it('extracts the session keyed by date', () => {
    const records = shredStore('health_training_v1', training);
    const session = records.find((r) => r.domain === 'session_log');
    expect(session?.id).toBe('2026-06-07');
    expect(session?.fields.dayKey).toBe('mon');
    expect(session?.fields.completed).toBe(true);
  });

  it('extracts set logs with deterministic composite ids and string values', () => {
    const records = shredStore('health_training_v1', training);
    const set = records.find((r) => r.domain === 'set_log');
    expect(set?.id).toBe('2026-06-07:goblet_squat:0');
    expect(set?.fields.weight).toBe('10');
    expect(set?.fields.reps).toBe('15');
    expect(set?.fields.done).toBe(true);
  });

  it('extracts the per-exercise note as its own record', () => {
    const records = shredStore('health_training_v1', training);
    const log = records.find((r) => r.domain === 'exercise_log');
    expect(log?.id).toBe('2026-06-07:goblet_squat');
    expect(log?.fields.note).toBe('felt good');
  });

  it('maps empty-string numerics to undefined, never zero', () => {
    const records = shredStore('health_training_v1', training);
    const metric = records.find((r) => r.domain === 'body_metric');
    expect(metric?.fields.weight).toBe(83.6);
    expect(metric?.fields).not.toHaveProperty('waist');
    expect(metric?.fields).not.toHaveProperty('chest');
  });

  it('captures a legacy blob when one is present', () => {
    const records = shredStore('health_training_v1', {
      ...training,
      legacyTrainRight: { profile: { name: 'x' } },
    });
    const blob = records.find((r) => r.domain === 'legacy_blob');
    expect(blob?.id).toBe('trainright-v1');
    expect(blob?.fields.payload).toEqual({ profile: { name: 'x' } });
  });
});

describe('shredStore — achievements', () => {
  it('tolerates a null achievements store, which real backups contain', () => {
    expect(shredStore('nutrition_tracker_achievements', null)).toEqual([]);
  });

  it('extracts achievements by id', () => {
    const records = shredStore('nutrition_tracker_achievements', [
      { id: 'a1', name: 'First workout', date: '2026-06-07' },
    ]);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ domain: 'achievement', id: 'a1' });
  });
});

describe('shredStore — user settings', () => {
  it('flattens targets into the singleton record', () => {
    const records = shredStore('nutrition_tracker_user_settings', {
      targets: { dailyCalories: 2000, dailyProtein: 180, dailyCarbs: 150, dailyFats: 70 },
      theme: 'dark',
      restTimerSeconds: 90,
    });
    expect(records).toHaveLength(1);
    expect(records[0].id).toBe('singleton');
    expect(records[0].fields).toMatchObject({
      dailyCalories: 2000, dailyProtein: 180, theme: 'dark', restTimerSeconds: 90,
    });
  });
});
