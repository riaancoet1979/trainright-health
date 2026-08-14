import type { SyncRecord } from './types';

export const STORE_KEYS = [
  'nutrition_tracker_daily_entries',
  'nutrition_tracker_user_settings',
  'nutrition_tracker_custom_foods',
  'nutrition_tracker_achievements',
  'trainright_body_stats',
  'health_training_v1',
] as const;

export type StoreKey = typeof STORE_KEYS[number];

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const isArray = (v: unknown): v is unknown[] => Array.isArray(v);

/**
 * Copy `keys` from `source`, dropping undefined, null and empty string.
 * Real data carries "" in numeric fields such as bodyMetrics.waist; SQLite will
 * not coerce "" to a number, so it must never reach the wire.
 */
const pick = (source: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    const value = source[key];
    if (value === undefined || value === null || value === '') continue;
    out[key] = value;
  }
  return out;
};

const FOOD_FIELDS = ['foodId', 'foodName', 'portion', 'calories', 'protein', 'carbs',
  'fats', 'mealType', 'timestamp', 'pieceCount', 'servingType', 'isManualMacroEntry'] as const;
const EXERCISE_FIELDS = ['name', 'duration', 'caloriesBurned', 'type', 'timestamp'] as const;
const CUSTOM_FOOD_FIELDS = ['name', 'calories', 'protein', 'carbs', 'fats', 'category',
  'brand', 'servingType', 'averageWeight', 'isCustom'] as const;
const BODY_STAT_FIELDS = ['date', 'weight', 'bodyFat', 'waist', 'chest', 'hips', 'leftArm',
  'rightArm', 'neck', 'thighL', 'thighR', 'shoulderWidth', 'measuredAt', 'importedAt', 'source',
  'sourceDevice', 'sourceFingerprint', 'totalBodyWaterL', 'proteinMassKg', 'mineralMassKg',
  'bodyFatMassKg', 'skeletalMuscleMassKg', 'fatFreeMassKg', 'bmi', 'smiKgM2', 'inBodyScore',
  'inBodyScoreMax', 'basalMetabolicRateKcal', 'recommendedCalorieIntakeKcal', 'waistHipRatio',
  'visceralFatLevel', 'obesityDegreePercent', 'targetWeightKg', 'weightControlKg', 'fatControlKg',
  'muscleControlKg', 'segmentalLean', 'segmentalFat', 'needsReview', 'reviewFields', 'notes'] as const;
const SESSION_FIELDS = ['dayKey', 'dayKeyOverride', 'weekNum', 'phase', 'readiness',
  'shoulderPain', 'redFlags', 'completed', 'notes'] as const;
const SET_FIELDS = ['weight', 'reps', 'done', 'leftWeight', 'leftReps', 'leftDone',
  'rightWeight', 'rightReps', 'rightDone'] as const;

const shredDailyEntries = (store: unknown): SyncRecord[] => {
  if (!isObject(store)) return [];
  const records: SyncRecord[] = [];

  for (const [date, rawEntry] of Object.entries(store)) {
    if (!isObject(rawEntry)) continue;

    if (isArray(rawEntry.foodEntries)) {
      for (const item of rawEntry.foodEntries) {
        if (!isObject(item) || typeof item.id !== 'string') continue;
        records.push({
          domain: 'food_entry',
          id: item.id,
          fields: { date, ...pick(item, FOOD_FIELDS) },
        });
      }
    }

    if (isArray(rawEntry.exercises)) {
      for (const item of rawEntry.exercises) {
        if (!isObject(item) || typeof item.id !== 'string') continue;
        records.push({
          domain: 'exercise',
          id: item.id,
          fields: { date, ...pick(item, EXERCISE_FIELDS) },
        });
      }
    }

    const fitness = rawEntry.fitness;
    if (isObject(fitness)) {
      const pushups = fitness.pushups;
      if (isObject(pushups) && isArray(pushups.sets)) {
        for (const item of pushups.sets) {
          if (!isObject(item) || typeof item.timestamp !== 'string') continue;
          records.push({
            domain: 'pushup_set',
            id: `${date}:${item.timestamp}`,
            fields: { date, reps: item.reps, timestamp: item.timestamp },
          });
        }
      }

      const steps = fitness.steps;
      if (isObject(steps) && typeof steps.steps === 'number') {
        records.push({
          domain: 'daily_steps',
          id: date,
          fields: {
            date,
            steps: steps.steps,
            goal: typeof steps.goal === 'number' ? steps.goal : 5000,
          },
        });
      }
    }
  }

  return records;
};

const shredTraining = (store: unknown): SyncRecord[] => {
  if (!isObject(store)) return [];
  const records: SyncRecord[] = [];

  const logs = store.logs;
  if (isObject(logs)) {
    for (const [date, rawLog] of Object.entries(logs)) {
      if (!isObject(rawLog)) continue;

      records.push({
        domain: 'session_log',
        id: date,
        fields: { date, ...pick(rawLog, SESSION_FIELDS) },
      });

      const exercises = rawLog.exercises;
      if (!isObject(exercises)) continue;

      for (const [exerciseId, rawExercise] of Object.entries(exercises)) {
        if (!isObject(rawExercise)) continue;

        records.push({
          domain: 'exercise_log',
          id: `${date}:${exerciseId}`,
          fields: {
            sessionDate: date,
            exerciseId,
            ...pick(rawExercise, ['note']),
          },
        });

        if (!isArray(rawExercise.sets)) continue;
        rawExercise.sets.forEach((rawSet, index) => {
          if (!isObject(rawSet)) return;
          records.push({
            domain: 'set_log',
            id: `${date}:${exerciseId}:${index}`,
            fields: {
              sessionDate: date,
              exerciseId,
              setIndex: index,
              ...pick(rawSet, SET_FIELDS),
            },
          });
        });
      }
    }
  }

  if (isArray(store.bodyMetrics)) {
    for (const rawMetric of store.bodyMetrics) {
      if (!isObject(rawMetric) || typeof rawMetric.date !== 'string') continue;
      records.push({
        domain: 'body_metric',
        id: rawMetric.date,
        fields: pick(rawMetric, ['date', 'weight', 'bfp', 'waist', 'chest']),
      });
    }
  }

  if (store.legacyTrainRight !== undefined && store.legacyTrainRight !== null) {
    records.push({
      domain: 'legacy_blob',
      id: 'trainright-v1',
      fields: { kind: 'trainright_v1', payload: store.legacyTrainRight },
    });
  }

  return records;
};

const shredUserSettings = (store: unknown): SyncRecord[] => {
  if (!isObject(store)) return [];
  const targets = isObject(store.targets) ? store.targets : {};

  const fields: Record<string, unknown> = {
    dailyCalories: targets.dailyCalories ?? 0,
    dailyProtein: targets.dailyProtein ?? 0,
    dailyCarbs: targets.dailyCarbs ?? 0,
    dailyFats: targets.dailyFats ?? 0,
    theme: typeof store.theme === 'string' ? store.theme : 'light',
    ...pick(store, ['pushupReminders', 'restTimerSeconds', 'mealSplit', 'staples']),
  };

  return [{ domain: 'user_settings', id: 'singleton', fields }];
};

const shredCustomFoods = (store: unknown): SyncRecord[] => {
  if (!isArray(store)) return [];
  return store.flatMap((item) => {
    if (!isObject(item) || typeof item.id !== 'string') return [];
    return [{ domain: 'custom_food', id: item.id, fields: pick(item, CUSTOM_FOOD_FIELDS) }];
  });
};

const shredAchievements = (store: unknown): SyncRecord[] => {
  if (!isArray(store)) return [];
  return store.flatMap((item) => {
    if (!isObject(item) || typeof item.id !== 'string') return [];
    return [{ domain: 'achievement', id: item.id, fields: pick(item, ['name', 'date']) }];
  });
};

const shredBodyStats = (store: unknown): SyncRecord[] => {
  if (!isArray(store)) return [];
  return store.flatMap((item) => {
    if (!isObject(item) || typeof item.id !== 'string') return [];
    return [{ domain: 'body_stat', id: item.id, fields: pick(item, BODY_STAT_FIELDS) }];
  });
};

const SHREDDERS: Record<StoreKey, (store: unknown) => SyncRecord[]> = {
  nutrition_tracker_daily_entries: shredDailyEntries,
  nutrition_tracker_user_settings: shredUserSettings,
  nutrition_tracker_custom_foods: shredCustomFoods,
  nutrition_tracker_achievements: shredAchievements,
  trainright_body_stats: shredBodyStats,
  health_training_v1: shredTraining,
};

/** Total function: never throws, whatever shape `store` is. */
export const shredStore = (key: string, store: unknown): SyncRecord[] => {
  const shredder = SHREDDERS[key as StoreKey];
  if (!shredder) return [];
  try {
    return shredder(store);
  } catch {
    return [];
  }
};
